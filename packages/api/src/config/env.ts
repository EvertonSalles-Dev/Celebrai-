import 'dotenv/config';
import { z } from 'zod';

/**
 * Validação e normalização das variáveis de ambiente.
 * Falha rápido (fail-fast) se algo essencial estiver faltando em produção.
 */
const booleanish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3333),
  API_PREFIX: z.string().default('/api'),

  APP_URL: z.string().url().default('http://localhost:5173'),
  API_URL: z.string().url().default('http://localhost:3333'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  DATABASE_PROVIDER: z.enum(['postgresql', 'sqlite', 'mysql']).default('postgresql'),

  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET deve ter ao menos 16 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(16, 'JWT_REFRESH_SECRET deve ter ao menos 16 caracteres'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  INVITATION_TOKEN_SECRET: z.string().min(16).default('celebrai-invitation-secret-change-me'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(8).max(15).default(12),

  CORS_ORIGINS: z
    .string()
    .default(
      [
        'http://localhost:5173',
        'http://localhost:4173',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:4173',
      ].join(','),
    ),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  CHECKIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),

  /**
   * Origens extras autorizadas no CORS, separadas por vírgula.
   *
   * `CORS_ORIGINS` já cobre o desenvolvimento e os domínios que a Vercel injeta
   * automaticamente (`VERCEL_URL` / `VERCEL_PROJECT_PRODUCTION_URL`). Esta
   * variável existe para o caso em que o FRONT é servido de um host diferente do
   * back — domínio próprio, CDN ou outro projeto na Vercel.
   *
   * Sem a origem correta aqui, o navegador bloqueia o login antes mesmo de a
   * requisição chegar: "blocked by CORS policy" / "Origem não autorizada pelo
   * CORS". Aceita valores exatos e curingas simples, ex.:
   *   EXTRA_CORS_ORIGINS=https://celebrai.app,https://*.celebrai.app
   */
  EXTRA_CORS_ORIGINS: z.string().default(''),

  MAIL_DRIVER: z.enum(['smtp', 'disabled']).default('disabled'),
  MAIL_FROM: z.string().default('Celebrai <no-reply@celebrai.app>'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().optional(),
  SMTP_SECURE: booleanish.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  WHATSAPP_DRIVER: z.enum(['cloud_api', 'disabled']).default('disabled'),
  WHATSAPP_API_URL: z.string().default('https://graph.facebook.com/v20.0'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default('v20.0'),

  GOOGLE_MAPS_API_KEY: z.string().optional(),

  SEED_SUPER_ADMIN_NAME: z.string().default('Super Admin'),
  SEED_SUPER_ADMIN_EMAIL: z.string().email().default('super@celebrai.app'),
  SEED_SUPER_ADMIN_PASSWORD: z.string().min(8).default('SuperAdmin@123'),
});

export type AppEnv = z.infer<typeof envSchema>;

/**
 * Detecta execução em ambiente serverless (Vercel/Lambda). Nesses ambientes
 * `process.exit` é proibido — ele aborta a invocação sem produzir resposta.
 */
export const isServerless = Boolean(
  process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME,
);

/**
 * Aliases de conexão PostgreSQL que a Vercel e integrações (Neon, Vercel
 * Postgres, Supabase) injetam no ambiente.
 *
 * O schema do Prisma só lê `DATABASE_URL`. Sem este preenchimento, um projeto
 * cuja conexão chegou apenas como `POSTGRES_URL` ou `PRISMA_DATABASE_URL`
 * falharia na inicialização com `DATABASE_URL é obrigatória`, mesmo tendo o
 * banco corretamente configurado no painel.
 */
const DATABASE_URL_ALIASES = [
  'POSTGRES_URL',
  'PRISMA_DATABASE_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
] as const;

function applyDatabaseUrlAlias(): void {
  const current = process.env.DATABASE_URL;

  // Já é uma URL de banco válida (Postgres ou SQLite) — nada a fazer.
  if (current && /^(postgres(ql)?|file):/.test(current.trim())) return;

  const alias = DATABASE_URL_ALIASES.find((key) => {
    const value = process.env[key];
    return value && /^postgres(ql)?:\/\//.test(value.trim());
  });

  if (alias) process.env.DATABASE_URL = process.env[alias];
}

/**
 * Mantém `DATABASE_PROVIDER` coerente com a `DATABASE_URL` em uso.
 *
 * O Prisma Client é gerado para UM provider, mas o `db-compat` e outros pontos
 * do código decidem o formato dos campos a partir de `DATABASE_PROVIDER`. Quando
 * os dois divergem, o erro aparece longe da causa:
 *
 *   url de produção (postgresql) + DATABASE_PROVIDER=sqlite
 *     → `toJsonField` deixa de serializar e o Prisma recusa a escrita
 *     → 500 INTERNAL_ERROR no login (auditoria e criação de sessão).
 *
 * A `DATABASE_URL` é a fonte da verdade porque é ela que o Prisma usa de fato:
 *  - `file:`             → sqlite
 *  - `postgres://`/`postgresql://` → postgresql
 *  - `mysql://`          → mysql
 *
 * Sem URL definida, o valor do ambiente é mantido (a validação do Zod já
 * garante que `DATABASE_URL` existe).
 */
function applyProviderFromUrl(): void {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return;

  const provider = /^file:/.test(url)
    ? 'sqlite'
    : /^mysql:\/\//.test(url)
      ? 'mysql'
      : /^postgres(ql)?:\/\//.test(url)
        ? 'postgresql'
        : null;

  if (!provider) return;

  if (process.env.DATABASE_PROVIDER !== provider) {
    console.warn(
      `[celebrai] DATABASE_PROVIDER ajustado para "${provider}" conforme a DATABASE_URL ` +
      `(valor anterior: "${process.env.DATABASE_PROVIDER ?? '(ausente)'}").`,
    );
  }

  process.env.DATABASE_PROVIDER = provider;
}

function loadEnv(): AppEnv {
  applyDatabaseUrlAlias();
  applyProviderFromUrl();

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    const message = `[celebrai] Configuração de ambiente inválida:\n${issues}`;
    // eslint-disable-next-line no-console
    console.error(`\n${message}\n`);

    // Em serverless (Vercel/Lambda) `process.exit` encerraria a invocação sem
    // resposta HTTP — o cliente veria um timeout opaco. Lançar o erro entrega
    // uma mensagem clara e deixa o handler converter em 500.
    if (isServerless) throw new Error(message);
    process.exit(1);
  }

  const env = parsed.data;

  if (env.NODE_ENV === 'production') {
    const insecure = [
      ['JWT_ACCESS_SECRET', 'troque-este-segredo-de-acesso-em-producao'],
      ['JWT_REFRESH_SECRET', 'troque-este-segredo-de-refresh-em-producao'],
      ['INVITATION_TOKEN_SECRET', 'celebrai-invitation-secret-change-me'],
    ].filter(([key, value]) => env[key as keyof AppEnv] === value);

    if (insecure.length > 0) {
      const message = `[celebrai] Segredos padrão detectados em produção: ${insecure
        .map(([k]) => k)
        .join(', ')}. Defina valores fortes antes de subir.`;
      // eslint-disable-next-line no-console
      console.error(`\n${message}\n`);

      if (isServerless) throw new Error(message);
      process.exit(1);
    }
  }

  return env;
}

export const env = loadEnv();

export const isProd = env.NODE_ENV === 'production';
export const isDev = env.NODE_ENV === 'development';
export const isTest = env.NODE_ENV === 'test';

/**
 * URL pública do frontend usada para montar os links de convite.
 *
 * O `APP_URL` continua tendo prioridade: em produção com domínio próprio
 * (ex.: `https://celebrai.com`) é ele que deve definir o link entregue ao
 * convidado. O fallback existe para o caso em que `APP_URL` ficou apontado
 * para um domínio de **deployment efêmero** da Vercel
 * (`projeto-<hash>-…vercel.app`): esse host deixa de existir no próximo push
 * e o convite passa a responder `404 DEPLOYMENT_NOT_FOUND`.
 *
 * Ordem de resolução:
 *  1. `APP_URL`, se for um domínio **estável** (não um host de deployment).
 *  2. `VERCEL_PROJECT_PRODUCTION_URL` → domínio estável de produção, sempre
 *     resolve para o deployment atual.
 *  3. `APP_URL` como veio, ainda que efêmero (último recurso — mantém o
 *     comportamento anterior em vez de quebrar).
 *  4. `VERCEL_URL` (host deste deployment) quando não há mais nada.
 *
 * Em desenvolvimento/local, sem nenhuma variável da Vercel presente, o valor
 * final é simplesmente o `APP_URL` do `.env` (`http://localhost:5173`).
 */
function resolveAppUrl(): string {
  const configured = env.APP_URL.replace(/\/$/, '');

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const deploymentHost = process.env.VERCEL_URL;

  /**
   * Um host é "efêmero" quando carrega o hash do deployment
   * (`<projeto>-<hash>-<time>.vercel.app`), que muda a cada push.
   *
   * O hash é um segmento **misto** (letras E dígitos, ex.: `7wv16812a`,
   * `ilm2vr51a`). Exigir as duas naturezas evita falsos positivos em nomes de
   * time (`evertonsalles-devs-projects` é só letras) e, principalmente, impede
   * que o domínio estável do projeto (`celebrai-ofc-api-22.vercel.app`) seja
   * tratado como efêmero — falha que fazia a resolução cair para o domínio de
   * produção da Vercel, mesmo com o `APP_URL` correto.
   */
  const isEphemeral = (url: string): boolean => {
    const host = url.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
    if (!host.endsWith('.vercel.app')) return false;
    // Segmento entre hífens com letras & dígitos e tamanho de hash (>= 8).
    const match = host.match(/-([a-z0-9]{8,})-[a-z0-9-]*\.vercel\.app$/);
    if (!match) return false;
    const segment = match[1] ?? '';
    return /[a-z]/.test(segment) && /[0-9]/.test(segment);
  };

  if (!isEphemeral(configured)) return configured;

  if (productionHost) return `https://${productionHost}`;

  return configured || (deploymentHost ? `https://${deploymentHost}` : configured);
}

/** URL pública resolvida do frontend — use esta para montar links de convite. */
export const appUrl = resolveAppUrl();

/**
 * Origens permitidas pelo CORS.
 *
 * Além da lista de `CORS_ORIGINS`, incluímos automaticamente os domínios que a
 * própria Vercel injeta em cada deployment:
 *
 *  - `VERCEL_URL`            → domínio único deste deployment
 *                               (ex.: celebrai-ofc-api-22-faetnx71o-….vercel.app)
 *  - `VERCEL_PROJECT_PRODUCTION_URL` → domínio estável de produção
 *                               (ex.: celebrai-ofc-api-22.vercel.app)
 *
 * Sem isso o CORS quebra a cada deploy: como a URL de preview muda a cada push,
 * uma lista fixa nunca casa e o login falha com "Origem não autorizada pelo
 * CORS". As variáveis já são fornecidas pelo ambiente — não é preciso
 * configurá-las no painel.
 *
 * `EXTRA_CORS_ORIGINS` entra logo depois de `CORS_ORIGINS` — é o escape para
 * servir o front de um host diferente do back (domínio próprio/CDN).
 */
function resolveCorsOrigins(): string[] {
  const configured = env.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const extras = env.EXTRA_CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const vercelHosts = [process.env.VERCEL_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
    .filter((host): host is string => Boolean(host))
    .map((host) => `https://${host}`);

  return [...new Set([...configured, ...extras, ...vercelHosts])];
}

export const corsOrigins = resolveCorsOrigins();

/**
 * Verifica se uma origem está autorizada.
 *
 * A comparação é exata contra `corsOrigins`, com uma exceção: entradas que
 * contenham `*` são tratadas como curinga simples (`https://*.dominio.com`).
 *
 * Os curingas existem porque as URLs de preview da Vercel **não** são
 * subdomínios: o formato é `projeto-hash-time-projeto.vercel.app`, ou seja, um
 * único label DNS com hífens — `*.dominio.com` nunca casaria com elas. Essas
 * URLs já são liberadas automaticamente via `VERCEL_URL` em
 * `resolveCorsOrigins`, que é o mecanismo correto para o caso; o curinga serve
 * para domínios próprios com muitos subdomínios (ex.: `https://*.celebrai.app`).
 *
 * A lista é estritamente explícita também em desenvolvimento: para acessar o
 * dev server por outro IP/host (ex.: `http://192.168.56.1:5173`), adicione-o
 * a `CORS_ORIGINS` no `.env`.
 */
export function isOriginAllowed(origin: string): boolean {
  return corsOrigins.some((allowed) => {
    if (allowed === origin) return true;
    if (!allowed.includes('*')) return false;

    const [prefix = '', suffix = ''] = allowed.split('*');
    return origin.startsWith(prefix) && origin.endsWith(suffix) && origin.length >= allowed.length - 1;
  });
}
