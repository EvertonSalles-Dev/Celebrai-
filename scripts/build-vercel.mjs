import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

console.log('[celebrai-vercel] Starting Vercel production build...');

// 1. Generate Prisma Client
console.log('[celebrai-vercel] 1/3 Generating Prisma Client...');
execSync('npm run db:generate', { stdio: 'inherit' });

// 2. Build API
console.log('[celebrai-vercel] 2/3 Building API package...');
execSync('npm run build --workspace @celebrai/api', { stdio: 'inherit' });

// 3. Build Web
console.log('[celebrai-vercel] 3/3 Building Web package...');
execSync('npm run build --workspace @celebrai/web', { stdio: 'inherit' });

// 4. Validate the output directory the Vercel project is configured to serve.
//
// O `outputDirectory` do vercel.json é `packages/web/dist`. A Vercel só falha
// DEPOIS que o build termina com "No Output Directory named \"dist\" found after
// the Build completed", então validamos aqui para o erro apontar a causa real.
const webDist = resolve('packages/web/dist');
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
