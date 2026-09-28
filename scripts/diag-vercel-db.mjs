// Diagnóstico: roda como build-step na Vercel e reporta o host do DATABASE_URL real.
import { execSync } from 'node:child_process';

const keys = ['DATABASE_URL', 'POSTGRES_URL', 'PRISMA_DATABASE_URL', 'POSTGRES_URL_NON_POOLING', 'DATABASE_URL_UNPOOLED'];

for (const k of keys) {
  const v = process.env[k];
  if (v && /^postgres/.test(v)) {
    const host = v.match(/@([^/]+)\//)?.[1] ?? '?';
    console.log(`[diag] ${k} -> host=${host}`);
  } else {
    console.log(`[diag] ${k} -> ${v ? 'definida (não-postgres)' : 'AUSENTE'}`);
  }
}

// Conta os usuários no banco que o build realmente enxerga.
const script = `
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const n = await p.user.count();
const list = await p.user.findMany({ select: { email: true, role: true } });
console.log('[diag] users =', n);
console.log('[diag] emails =', JSON.stringify(list));
await p.$disconnect();
`;
try {
  const out = execSync(`node --input-type=module -e ${JSON.stringify(script)}`, {
    cwd: 'packages/api',
    env: process.env,
    stdio: 'pipe',
  }).toString();
  console.log(out);
} catch (e) {
  console.log('[diag] erro ao consultar:', e.stdout?.toString() ?? '', e.stderr?.toString() ?? e.message);
}