import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { buildServer } from '../packages/api/src/app.js';

/**
 * O `import()` dinâmico é obrigatório aqui.
 *
 * `api/` é compilado como CommonJS pela Vercel (o `package.json` da raiz não
 * declara `"type": "module"`), enquanto `packages/api` é ESM. Um `import`
 * estático de `../packages/api/dist/app.js` vira `require('...app.js')` e falha
 * com `ERR_REQUIRE_ESM`, porque `require()` não consegue carregar um módulo ES.
 *
 * A forma dinâmica funciona nos dois formatos e é resolvida em runtime.
 *
 * O caminho aponta para `dist/` (JS já compilado) e não para `src/`: o build
 * da Vercel roda `tsc` do workspace da API antes de empacotar a função, então
 * não dependemos de a Vercel transpilar TS de outro workspace por conta própria.
 */
const loadApp = () =>
  import('../packages/api/dist/app.js') as Promise<{ buildServer: typeof buildServer }>;

/**
 * Entrypoint da API na Vercel.
 *
 * A instância do Fastify é criada UMA vez por container e reaproveitada entre
 * invocações (`appPromise`) — recriar a cada request desperdiça o pool de
 * conexões do Prisma e provoca cold start em toda chamada.
 *
 * O roteamento chega aqui via `rewrites` do vercel.json: `/api/:path*` → esta
 * função (declarada ANTES do fallback da SPA). Sem essa ordem o Vercel serviria
 * `/index.html` (arquivo estático) e um POST receberia 405 Method Not Allowed.
 */
let appPromise: Promise<Awaited<ReturnType<typeof buildServer>>> | undefined;

/**
 * Reconstrói a URL original que o Fastify espera.
 *
 * O `rewrite` do vercel.json aponta `/api/:path*` para esta função. Com a
 * sintaxe de parâmetro nomeado, a Vercel entrega o trecho capturado como query
 * string (`?path=auth/login`), então `req.url` pode chegar como `/api/index`
 * em vez de `/api/auth/login`. O Fastify registra as rotas JÁ com o prefixo
 * `/api` (ver `registerRoutes`), então precisa enxergar o caminho completo.
 *
 * Se a Vercel já entregar o caminho original (`/api/auth/login`, comportamento
 * padrão para functions), não existe o parâmetro `path` e a função não altera
 * nada — é seguro chamá-la sempre.
 *
 * Há também o caso de a Vercel entregar o caminho do DESTINO do rewrite
 * (`/api/index`) mantendo o restante na query string. Como as rotas são
 * registradas com o prefixo `/api` (ver `registerRoutes`), `/api/index` não
 * casa com `/api/auth/login` e o Fastify devolve
 * `404 NOT_FOUND — Rota não encontrada: GET /api/auth/login`.
 * Aqui o prefixo é reaplicado para os formatos `/index`, `/api` e `/api/index`.
 */
function restoreOriginalPath(req: VercelRequest): void {
  const prefix = '/api';
  const rawUrl = req.url ?? '';

  const [pathname = '', search = ''] = rawUrl.split('?');
  const params = new URLSearchParams(search);
  const captured = params.get('path');

  /** Reconstrói a URL completa a partir do caminho capturado. */
  const withCapturedPath = (): string => {
    params.delete('path');
    const restored = `${prefix}/${(captured ?? '').replace(/^\/+/, '')}`;
    const rest = params.toString();
    return rest ? `${restored}?${rest}` : restored;
  };

  if (captured) {
    req.url = withCapturedPath();
    return;
  }

  // O rewrite apontou para a própria função (`/api/index`) sem preservar o
  // caminho capturado: sem correção nenhuma requisição encontraria rota.
  if (pathname === '/api/index' || pathname === '/api' || pathname === '/api/') {
    req.url = withCapturedPath();
  }
}

/**
 * Executa o handler com uma URL simulada e devolve o que o Fastify respondeu.
 *
 * Permite validar a reescrita de caminho e o roteamento (ex.: `/api/index` ou
 * `?path=auth/login` virando `/api/auth/login`) sem depender da Vercel.
 *
 * Use `method: 'POST'` em rotas de escrita: um GET em `/api/auth/login` devolve
 * 404 mesmo com o roteamento correto, porque a rota só existe para POST.
 */
export async function debugRouting(
  url: string,
  method: 'GET' | 'POST' = 'GET',
  payload?: Record<string, unknown>,
): Promise<{ status: number; body: string; url: string }> {
  const app = await getApp();
  const req = { method, url, headers: { host: 'localhost' } } as unknown as VercelRequest;

  restoreOriginalPath(req);

  const response = await app.inject({
    method,
    url: req.url ?? '/',
    ...(payload !== undefined ? { payload } : {}),
  });

  return { status: response.statusCode, body: response.body, url: req.url ?? '' };
}

/** Constrói (ou reutiliza) a instância do Fastify já pronta para uso. */
function getApp() {
  appPromise ??= loadApp().then(async ({ buildServer }) => {
    const app = await buildServer();
    await app.ready();
    return app;
  });
  return appPromise;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const app = await getApp();

    // URL original antes de qualquer ajuste: é o que permite diagnosticar um
    // 404 de rota pelos logs da Vercel sem precisar reproduzir o deploy.
    const originalUrl = req.url ?? '';

    restoreOriginalPath(req);

    // eslint-disable-next-line no-console
    console.log(`[celebrai] ${req.method} ${originalUrl} -> ${req.url}`);

    // `app.server` é o servidor HTTP do Node; emitir `request` entrega o par
    // req/res do Vercel direto ao roteador do Fastify (padrão recomendado para
    // ambientes serverless — ver guia "Serverless" do Fastify).
    app.server.emit('request', req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;

    // eslint-disable-next-line no-console
    console.error('[celebrai] Falha ao inicializar/atender na Vercel:', message, stack);

    // Se o erro veio da validação de ambiente, expor a causa real é essencial
    // para diagnosticar (variável faltando no painel da Vercel).
    const isEnvError = message.includes('[celebrai]');

    if (!res.headersSent) {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: isEnvError ? message : 'Erro interno do servidor.',
        },
      });
    }
  }
}