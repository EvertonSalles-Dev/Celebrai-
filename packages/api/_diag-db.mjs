/**
 * Sonda a alcançabilidade TCP dos hosts de banco declarados nos .env.
 * Não executa SQL — apenas verifica se há um Postgres aceitando conexão,
 * para decidir se o dev local pode apontar para o Neon.
 */
import { createConnection } from 'node:net';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function readKey(file, key) {
  if (!existsSync(file)) return null;
  const m = new RegExp(`^${key}=(.*)$`, 'm').exec(readFileSync(file, 'utf8'));
  return m ? m[1].trim().replace(/^"|"$/g, '') : null;
}

function probe(host, port, timeout = 6000) {
  return new Promise((done) => {
    const s = createConnection({ host, port });
    const finish = (ok, info) => {
      s.removeAllListeners();
      s.destroy();
      done({ ok, info });
    };
    s.setTimeout(timeout);
    s.once('connect', () => finish(true, 'conectou'));
    s.once('timeout', () => finish(false, 'timeout'));
    s.once('error', (e) => finish(false, e.code || e.message));
  });
}

const targets = [
  { label: 'packages/api/.env', file: resolve(process.cwd(), '.env') },
  { label: 'raiz/.env', file: resolve(process.cwd(), '..', '..', '.env') },
];

for (const t of targets) {
  const url = readKey(t.file, 'DATABASE_URL');
  const provider = readKey(t.file, 'DATABASE_PROVIDER');
  console.log(`\n### ${t.label}`);
  console.log('  provider    :', provider);
  if (!url) {
    console.log('  DATABASE_URL: (ausente)');
    continue;
  }
  console.log('  url scheme  :', url.split(':')[0]);
  let host = 'localhost';
  let port = 5432;
  try {
    const u = new URL(url);
    host = u.hostname;
    port = Number(u.port) || 5432;
  } catch {
    /* postgresql:// não é scheme WHATWG em todos os casos */
  }
  console.log('  host:port   :', `${host}:${port}`);
  const r = await probe(host, port);
  console.log('  TCP         :', r.ok ? `✅ ${r.info}` : `❌ ${r.info}`);
}
