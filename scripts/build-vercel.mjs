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

/** Executa um comando sempre a partir da raiz do monorepo. */
function run(command) {
  execSync(command, { stdio: 'inherit', cwd: repoRoot });
}

// 1. Generate Prisma Client
console.log('[celebrai-vercel] 1/3 Generating Prisma Client...');
run('npm run db:generate');

// 2. Build API
console.log('[celebrai-vercel] 2/3 Building API package...');
run('npm run build --workspace @celebrai/api');

// 3. Build Web
console.log('[celebrai-vercel] 3/3 Building Web package...');
run('npm run build --workspace @celebrai/web');

// 4. Validate the output directory the Vercel project is configured to serve.
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
    '          o passo 3/3 terminou sem erro.',
  );
  process.exit(1);
}

const assetsDir = resolve(webDist, 'assets');
const assetCount = existsSync(assetsDir) ? readdirSync(assetsDir).length : 0;

console.log(
  `[celebrai-vercel] ✅ Build finished successfully! ` +
  `Serve-ready output: packages/web/dist (index.html + ${assetCount} assets).`,
);
