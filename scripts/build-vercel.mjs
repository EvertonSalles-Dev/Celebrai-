import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

console.log('[celebrai-vercel] Starting Vercel production build...');

/**
 * A raiz do MONOREPO, descoberta a partir da localização deste arquivo.
 *
 * Isto é o que torna o script independente do Root Directory configurado no
 * painel da Vercel. Se o projeto estiver apontando para `packages/api` em vez
 * da raiz do repositório, o cwd do processo é `packages/api` e o caminho
 * relativo `scripts/build-vercel.mjs` resolve para
 * `packages/api/scripts/build-vercel.mjs` — que não existe:
 *
 *   Error: Cannot find module '/vercel/path0/packages/api/scripts/build-vercel.mjs'
 *
 * Como este arquivo mora em `<raiz>/scripts/`, subir um nível a partir dele
 * devolve sempre a raiz correta do monorepo — onde ficam o `package.json` com
 * os workspaces, o `packages/web/dist` e o `api/index.ts`.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

console.log(`[celebrai-vercel] Raiz do monorepo: ${repoRoot}`);
console.log(`[celebrai-vercel] cwd do processo: ${process.cwd()}`);

if (resolve(process.cwd()) !== repoRoot) {
  console.warn(
    '[celebrai-vercel] ⚠️  O cwd não é a raiz do monorepo.\n' +
    '          Causa provável: o Root Directory do projeto na Vercel está em\n' +
    '          `packages/api` em vez de vazio/`.` (Settings → General).\n' +
    '          O build continua a partir da raiz real, mas o `outputDirectory`\n' +
    '          e o `api/index.ts` declarados no vercel.json só resolvem\n' +
    '          corretamente com o Root Directory na raiz.',
  );
}

/**
 * Executa um comando sempre a partir da raiz do monorepo.
 *
 * `env` permite injetar variáveis extras no processo filho (usado para repassar
 * a URL do banco encontrada sob um alias como `DATABASE_URL`).
 */
function run(command, options = {}) {
  execSync(command, {
    stdio: 'inherit',
    cwd: repoRoot,
    env: options.env ?? process.env,
  });
}

/**
 * Considera apenas URLs de conexão PostgreSQL válidas para a migration.
 *
 * O schema de produção (`packages/api/prisma/schema.prisma`) declara
 * `provider = "postgresql"` e `url = env("DATABASE_URL")`. Se o valor de
 * `DATABASE_URL` for outra coisa — tipicamente `file:./dev.db` (SQLite), que
 * sobra no painel da Vercel se alguém rodou o projeto em modo local —, o Prisma
 * aborta a validação com:
 *
 *   P1012: Error validating datasource `db`: the URL must start with the
 *          protocol `postgresql://` or `postgres://`.
 *
 * Essa falha não tem nada a ver com o artefato do build, então tratamos como
 * "sem banco" e seguimos.
 */
function isPostgresUrl(value) {
  return typeof value === 'string' && /^postgres(ql)?:\/\//.test(value.trim());
}

/**
 * Procura a URL do Postgres no ambiente sob qualquer um dos nomes conhecidos.
 *
 * A Vercel (e integrações como Neon/Vercel Postgres) injeta a conexão com nomes
 * variados — `POSTGRES_URL`, `PRISMA_DATABASE_URL`, `POSTGRES_PRISMA_URL`… —
 * enquanto o schema só lê `DATABASE_URL`. Aceitar os aliases evita que a
 * migration falhe só porque o provedor escolheu outro nome.
 */
const dbUrlKeys = [
  'DATABASE_URL',
  'POSTGRES_URL',
  'PRISMA_DATABASE_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
];

const databaseUrlKey = dbUrlKeys.find((key) => isPostgresUrl(process.env[key]));
const rawDatabaseUrl = process.env.DATABASE_URL;

/**
 * Estado do acesso ao banco no momento do build:
 *  - 'ok'      → há uma URL PostgreSQL válida; a migration pode rodar.
 *  - 'missing' → nenhuma variável de conexão definida.
 *  - 'invalid' → `DATABASE_URL` definida, mas não é `postgresql://` (ex.: SQLite).
 */
const dbState = databaseUrlKey ? 'ok' : rawDatabaseUrl ? 'invalid' : 'missing';

// 1. Generate Prisma Client (obrigatório: a API importa @prisma/client)
console.log('[celebrai-vercel] 1/4 Generating Prisma Client...');
run('npm run db:generate');

// 2. Migrate DB (melhor esforço).
//
// `prisma migrate deploy` NÃO é pré-requisito do build: o artefato (função da
// API + bundle do front) não depende do schema do banco estar atualizado. Ele
// falha na Vercel por motivos comuns e independentes:
//   - `prisma` está em devDependencies, e a Vercel pode podar devDeps antes do
//     deploy (a própria Prisma documenta mover `prisma` para `dependencies`);
//   - o schema lê `env("DATABASE_URL")` e, sem essa variável, aborta com
//     `Environment variable not found`;
//   - `DATABASE_URL` existe mas NÃO é `postgresql://` (ex.: `file:./dev.db`),
//     e a validação aborta com P1012.
//
// Por isso rodamos como melhor esforço: se falhar, avisamos e seguimos. Um
// deploy com migrations pendentes é recuperável (basta rodá-las à parte); um
// build derrubado por causa disso não entrega nada.
console.log('[celebrai-vercel] 2/4 Migrating DB (best-effort)...');

if (dbState === 'missing') {
  console.warn(
    '[celebrai-vercel] ⚠️  Nenhuma variável de conexão Postgres no build — pulando a migração.\n' +
    '          Defina `DATABASE_URL` em Settings → Environment Variables, ou rode:\n' +
    '          cd packages/api && npx prisma migrate deploy',
  );
} else if (dbState === 'invalid') {
  console.warn(
    '[celebrai-vercel] ⚠️  `DATABASE_URL` está definida, mas não é uma URL PostgreSQL — pulando a migração.\n' +
    `          Valor recebido começa com: "${String(rawDatabaseUrl).slice(0, 24)}"\n` +
    '          O Prisma recusaria com P1012 ("the URL must start with postgresql://").\n' +
    '          Corrija no painel: Settings → Environment Variables → DATABASE_URL.\n' +
    '          Se a conexão estiver em POSTGRES_URL/PRISMA_DATABASE_URL, copie o valor\n' +
    '          para DATABASE_URL ou rode as migrations manualmente.',
  );
} else {
  // Passa a URL encontrada como `DATABASE_URL` para o processo filho. Isso cobre
  // o caso em que a conexão válida está em outro alias e o schema de produção
  // (que só lê `DATABASE_URL`) não a enxergaria.
  const migrateEnv = { ...process.env };
  if (databaseUrlKey !== 'DATABASE_URL') {
    migrateEnv.DATABASE_URL = process.env[databaseUrlKey];
    console.log(`[celebrai-vercel] Usando ${databaseUrlKey} como DATABASE_URL para a migração.`);
  }

  let migrated = false;
  try {
    run('npm run db:deploy --workspace @celebrai/api', { env: migrateEnv });
    migrated = true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[celebrai-vercel] ⚠️  Comando falhou: npm run db:deploy --workspace @celebrai/api`);
    console.warn(`[celebrai-vercel]    ${detail}`);
  }

  if (!migrated) {
    console.warn(
      '[celebrai-vercel] ⚠️  A migração falhou, mas o build CONTINUA.\n' +
      '          Causa provável: `prisma` em devDependencies foi podado pela Vercel.\n' +
      '          Aplique as migrations manualmente:\n' +
      '          cd packages/api && npx prisma migrate deploy',
    );
  }
}

// 3. Build API (obrigatório)
console.log('[celebrai-vercel] 3/4 Building API package...');
run('npm run build --workspace @celebrai/api');

// 4. Build Web (obrigatório)
console.log('[celebrai-vercel] 4/4 Building Web package...');
run('npm run build --workspace @celebrai/web');

// 5. Validate the output directory the Vercel project is configured to serve.
//
// O `outputDirectory` do vercel.json é `packages/web/dist`. A Vercel só falha
// DEPOIS que o build termina com "No Output Directory named \"dist\" found after
// the Build completed", então validamos aqui para o erro apontar a causa real.
const webDist = resolve(repoRoot, 'packages/web/dist');
const indexHtml = resolve(webDist, 'index.html');

if (!existsSync(indexHtml)) {
  console.error(
    `[celebrai-vercel] ❌ Build do frontend não gerou index.html em ${webDist}.\n` +
    '          Confira se `packages/web/vite.config.ts` aponta outDir para dist e se\n' +
    '          o passo 4/4 terminou sem erro.',
  );
  process.exit(1);
}

const assetsDir = resolve(webDist, 'assets');
const assetCount = existsSync(assetsDir) ? readdirSync(assetsDir).length : 0;

console.log(
  `[celebrai-vercel] ✅ Build finished successfully! ` +
  `Serve-ready output: packages/web/dist (index.html + ${assetCount} assets).`,
);
