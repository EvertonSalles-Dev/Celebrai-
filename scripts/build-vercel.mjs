import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, cpSync } from 'node:fs';
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

// 4. Mirror build output to both ./dist and ./packages/web/dist
const rootDist = resolve('dist');
const webDist = resolve('packages/web/dist');

if (existsSync(webDist)) {
  console.log('[celebrai-vercel] Syncing packages/web/dist -> ./dist');
  mkdirSync(rootDist, { recursive: true });
  cpSync(webDist, rootDist, { recursive: true });
}

if (existsSync(rootDist)) {
  console.log('[celebrai-vercel] Syncing ./dist -> packages/web/dist');
  mkdirSync(webDist, { recursive: true });
  cpSync(rootDist, webDist, { recursive: true });
}

console.log('[celebrai-vercel] ✅ Build finished successfully! Created dist/ and packages/web/dist/');
