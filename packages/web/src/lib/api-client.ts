import { ACCESS_TOKEN_KEY, API_PREFIX, API_URL } from '@/config/app';
import type { ApiEnvelope, ApiError } from '@/types';

/**
 * Cliente HTTP central.
 *
 * Responsabilidades:
 *  - montar a URL base;
 *  - anexar o access token;
 *  - renovar o token automaticamente em 401 e repetir a requisição UMA vez;
 *  - normalizar erros da API em `ApiRequestError`.
 *
 * Nenhum componente React faz `fetch` diretamente: tudo passa por aqui.
 */

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = error.code;
    this.details = error.details;
  }
}

// ---------------------------------------------------------------------------
// Token em memória + sessionStorage
// ---------------------------------------------------------------------------

let accessToken: string | null = sessionStorage.getItem(ACCESS_TOKEN_KEY);

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (token) sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
  else sessionStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Callback disparado quando a sessão expira em definitivo (força logout). */
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

// ---------------------------------------------------------------------------
// Requisição base
// ---------------------------------------------------------------------------

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Envia o corpo como texto (ex.: CSV). */
  rawBody?: string;
  contentType?: string;
  /** Não tenta renovar o token em 401 (usado nas próprias rotas de auth). */
  skipAuthRefresh?: boolean;
  signal?: AbortSignal;
}

/** Evita múltiplas renovações simultâneas do token. */
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      // Sem `Content-Type` e sem corpo: o Fastify recusa um POST que declare
      // `application/json` e mande corpo vazio —
      //   FST_ERR_CTP_EMPTY_JSON_BODY (400)
      // O token de refresh vem do cookie httpOnly, então nada precisa ir no body.
      const response = await fetch(`${API_URL}${API_PREFIX}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) return false;

      const payload = (await response.json()) as ApiEnvelope<{ accessToken: string }>;
      setAccessToken(payload.data.accessToken);
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { error?: ApiError };
    if (body.error) return body.error;
  } catch {
    // resposta sem corpo JSON
  }
  return {
    code: 'UNKNOWN_ERROR',
    message: response.statusText || 'Erro inesperado na comunicação com o servidor.',
  };
}

async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<ApiEnvelope<T>> {
  const { method = 'GET', body, rawBody, contentType, skipAuthRefresh, signal } = options;

  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (rawBody !== undefined) headers['Content-Type'] = contentType ?? 'text/plain';

  const response = await fetch(`${API_URL}${API_PREFIX}${path}`, {
    method,
    headers,
    credentials: 'include',
    signal,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(rawBody !== undefined ? { body: rawBody } : {}),
  });

  // Renovação transparente do token.
  if (response.status === 401 && !skipAuthRefresh) {
    const refreshed = await refreshAccessToken();

    if (refreshed) {
      return rawRequest<T>(path, { ...options, skipAuthRefresh: true });
    }

    setAccessToken(null);
    onSessionExpired?.();
    throw new ApiRequestError(401, {
      code: 'SESSION_EXPIRED',
      message: 'Sua sessão expirou. Faça login novamente.',
    });
  }

  if (response.status === 204) {
    return { data: undefined as T };
  }

  if (!response.ok) {
    throw new ApiRequestError(response.status, await parseError(response));
  }

  const text = await response.text();
  if (!text) return { data: undefined as T };

  return JSON.parse(text) as ApiEnvelope<T>;
}

/** Requisição que devolve o envelope completo (com `meta` de paginação). */
export function request<T>(path: string, options?: RequestOptions): Promise<ApiEnvelope<T>> {
  return rawRequest<T>(path, options);
}

/** Requisição que devolve apenas `data`. */
export async function requestData<T>(path: string, options?: RequestOptions): Promise<T> {
  const envelope = await rawRequest<T>(path, options);
  return envelope.data;
}

/** Requisição que devolve texto puro (ex.: CSV de exportação). */
export async function requestText(path: string, options: RequestOptions = {}): Promise<string> {
  const headers: Record<string, string> = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(`${API_URL}${API_PREFIX}${path}`, {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    signal: options.signal,
  });

  if (!response.ok) {
    throw new ApiRequestError(response.status, await parseError(response));
  }

  return response.text();
}

/** Constrói query string ignorando valores vazios. */
export function buildQuery(params: Record<string, unknown> | object): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}
