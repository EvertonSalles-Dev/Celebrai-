#!/usr/bin/env node
/**
 * Celebrai — gerador de schema para desenvolvimento local.
 *
 * O schema de PRODUÇÃO é PostgreSQL (`prisma/schema.prisma`) e usa recursos que
 * só existem nesse banco: enums, arrays (`String[]`) e `Json`.
 *
 * Para permitir rodar o projeto em máquinas sem Docker/Postgres, este script
 * gera `prisma/schema.dev.prisma` a partir do schema de produção, traduzindo os
 * tipos que o SQLite não suporta:
 *   - `enum`            → `String`
 *   - `String[]`        → `String` (JSON serializado)
 *   - `Json`            → `String`
 *
 * O schema de produção NUNCA é modificado.
 *
 * Além do schema, o script ajusta `DATABASE_PROVIDER` e `DATABASE_URL` no
 * `.env` local — sem isso o Prisma Client é gerado para um provider e recebe
 * uma URL de outro, e todo acesso ao banco falha com
 * "the URL must start with the protocol `postgresql://`" (HTTP 500 no login).
 *
 * Uso:
 *   node scripts/set-provider.mjs sqlite       # gera schema.dev.prisma + .env
 *   node scripts/set-provider.mjs postgresql   # remove o arquivo de dev
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const prismaDir = resolve(__dirname, '..', 'prisma');
const sourceSchema = resolve(prismaDir, 'schema.prisma');
const devSchema = resolve(prismaDir, 'schema.dev.prisma');

const envFile = resolve(__dirname, '..', '.env');
const POSTGRES_URL = 'postgresql://celebrai:celebrai@localhost:5432/celebrai?schema=public';
const SQLITE_URL = 'file:./dev.db';

/**
 * Reescreve uma chave no `.env` preservando comentários e demais valores.
 * Retorna `false` quando a chave não existe (nada é adicionado à força).
 */
function patchEnv(key, value) {
  if (!existsSync(envFile)) return false;

  const content = readFileSync(envFile, 'utf8');
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (!pattern.test(content)) return false;

  writeFileSync(envFile, content.replace(pattern, `${key}=${value}`), 'utf8');
  return true;
}

/** O tester de migrations do Prisma mantém 2 conexões abertas ao banco. */
function suppressPrismaAdvisory() {
  const original = console.log;
  console.log = (...args) => {
    if (typeof args[0] === 'string' && args[0].includes('Prisma Migrate has detected')) return;
    original(...args);
  };
}

/**
 * O Prisma Connect do Windows falha ao conectar em "localhost" resolvido para
 * IPv6 (`::1`), mas o servidor costuma escutar apenas em IPv4. Sondamos IPv4,
 * IPv6 e `127.0.0.1` — o primeiro que fechar conexão TCP está no ar.
 */
function probeTcp(host, port, timeout = 700) {
  return new Promise((resolvePromise) => {
    const socket = createConnection({ host, port });
    const done = (up) => {
      socket.removeAllListeners();
      socket.destroy();
      resolvePromise(up);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

function postgresHostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'localhost';
  }
}

function portFromUrl(url, fallback = 5432) {
  try {
    // `postgresql://` não é um scheme conhecido pelo WHATWG URL; o default do
    // protocolo já é 5432, então o parse funciona e a porta sai correta.
    return Number(new URL(url).port) || fallback;
  } catch {
    return fallback;
  }
}

const provider = (process.argv[2] || 'postgresql').toLowerCase();
if (!['postgresql', 'sqlite'].includes(provider)) {
  console.error(`Provider inválido: ${provider}. Use 'postgresql' ou 'sqlite'.`);
  process.exit(1);
}

/** Valor atual de uma chave no `.env` (string vazia se ausente). */
function readEnv(key) {
  if (!existsSync(envFile)) return '';
  const match = new RegExp(`^${key}=(.*)$`, 'm').exec(readFileSync(envFile, 'utf8'));
  return match ? match[1].trim().replace(/^"|"$/g, '') : '';
}

/**
 * Só faz sentido sondar o banco quando o projeto foi configurado para
 * PostgreSQL. Em modo SQLite a variável não descreve um servidor TCP.
 */
async function isPostgresReachable() {
  if (readEnv('DATABASE_PROVIDER') !== 'postgresql' || !existsSync(envFile)) return null;

  const url = readEnv('DATABASE_URL') || POSTGRES_URL;
  const port = portFromUrl(url);

  const hosts = [postgresHostFromUrl(url), '127.0.0.1', '::1'].filter(
    (host, index, list) => host && list.indexOf(host) === index,
  );

  for (const host of hosts) {
    if (await probeTcp(host, port)) return { up: true, host, port };
  }
  return { up: false, host: null, port };
}

if (provider === 'postgresql') {
  // Evita que o par (provider, URL) fique inconsistente — causa direta do
  // erro "the URL must start with the protocol postgresql://" no login.
  // Só troca a URL se ela não for um Postgres válido, para não sobrescrever
  // credenciais reais que o desenvolvedor já tenha configurado.
  const currentUrl = readEnv('DATABASE_URL');
  if (patchEnv('DATABASE_PROVIDER', 'postgresql')) {
    console.log('[celebrai] .env → DATABASE_PROVIDER=postgresql');
  }

  if (!/^postgres(ql)?:\/\//.test(currentUrl)) {
    patchEnv('DATABASE_URL', `"${POSTGRES_URL}"`);
    console.log(`[celebrai] .env → DATABASE_URL=${POSTGRES_URL}`);
  }

  if (existsSync(devSchema)) {
    rmSync(devSchema);
    console.log('[celebrai] schema.dev.prisma removido — usando PostgreSQL.');
  } else {
    console.log('[celebrai] Nada a fazer — o schema de produção já é PostgreSQL.');
  }

  const reachable = await isPostgresReachable();
  if (reachable === null) {
    console.log('[celebrai] .env sem DATABASE_PROVIDER — o default do código é PostgreSQL.');
  } else if (reachable.up) {
    suppressPrismaAdvisory();
    console.log(`[celebrai] PostgreSQL alcançável em ${reachable.host}:${reachable.port}.`);
  } else {
    console.log('');
    console.log(`⚠️  Nenhum PostgreSQL escutando em 127.0.0.1:${reachable.port}.`);
    console.log('   Suba o banco (docker compose up -d db) ou rode em SQLite:');
    console.log('   node scripts/set-provider.mjs sqlite');
  }

  process.exit(0);
}

let schema = readFileSync(sourceSchema, 'utf8');

// 1) Remove os blocos `enum` do SQLite e coleta os nomes para virar String.
//
// O comentário usa `//` e NÃO `///`. Em Prisma, `///` é doc-comment e precisa
// estar imediatamente acima de um campo, bloco ou enum — um `///` solto, que é
// o que sobra depois de remover o bloco `enum`, faz o schema inteiro ser
// rejeitado com `This line is not a valid definition within a schema`.
const enumNames = [];
schema = schema.replace(/enum\s+(\w+)\s*\{[\s\S]*?\n\}/g, (_match, name) => {
  enumNames.push(name);
  return `// enum ${name} → String (SQLite)`;
});

// 2) Substitui os usos dos enums por String (respeitando limites de palavra).
for (const name of enumNames) {
  schema = schema.replace(new RegExp(`\\b${name}\\b`, 'g'), 'String');
}

// 3) Tipos que o SQLite não suporta.
schema = schema
  .replace(/\bString\[\]/g, 'String?')
  .replace(/\bJson\?/g, 'String?')
  .replace(/\bJson\b/g, 'String');

// 3b) Valores padrão de campos que eram enum precisam virar string.
//     Ex.: `@default(QR_CODE)` -> `@default("QR_CODE")`
const defaultValues = [
  'ADMIN',
  'SUPER_ADMIN',
  'RECEPTIONIST',
  'ACTIVE',
  'SUSPENDED',
  'PENDING',
  'CONFIRMED',
  'DECLINED',
  'CHECKED_IN',
  'CANCELLED',
  'DRAFT',
  'PUBLISHED',
  'FINISHED',
  'QR_CODE',
  'MANUAL',
  'EMAIL',
  'WHATSAPP',
  'SMS',
  'LINK',
  'QUEUED',
  'SENT',
  'FAILED',
];

for (const value of defaultValues) {
  schema = schema.replace(
    new RegExp(`@default\\(${value}\\)`, 'g'),
    `@default("${value}")`,
  );
}

// 4) Ajusta o datasource e o output do client de dev.
schema = schema
  .replace(/provider = "postgresql"/, 'provider = "sqlite"')
  .replace(/generator client \{\n\s+provider = "prisma-client-js"\n\}/, 'generator client {\n  provider = "prisma-client-js"\n  binaryTargets = ["native"]\n}');

writeFileSync(devSchema, schema, 'utf8');
console.log('[celebrai] schema.dev.prisma gerado (SQLite).');
console.log(`          Enums convertidos em String: ${enumNames.join(', ')}`);

if (patchEnv('DATABASE_PROVIDER', 'sqlite') && patchEnv('DATABASE_URL', `"${SQLITE_URL}"`)) {
  console.log('[celebrai] .env atualizado (DATABASE_PROVIDER=sqlite, DATABASE_URL=file:./dev.db).');
}

console.log('');
console.log('Próximos passos (obrigatórios — o Client precisa ser regenerado):');
console.log('  npx prisma db push --schema prisma/schema.dev.prisma');
console.log('  npx prisma generate --schema prisma/schema.dev.prisma');
console.log('  npm run db:seed');
