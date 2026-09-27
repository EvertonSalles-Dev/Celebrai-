#!/usr/bin/env node
/**
 * Celebrai — garante que exista um SUPER_ADMIN no banco atual.
 *
 * PROBLEMA QUE ISTO RESOLVE
 * -------------------------
 * `prisma migrate deploy` cria as TABELAS, mas nenhum usuário. Em um banco novo
 * (ex.: Neon, criado do zero para produção) a tabela `User` fica vazia e o login
 * responde sempre "E-mail ou senha incorretos":
 *
 *   const user = await prisma.user.findUnique({ where: { email } });
 *   if (!user || ...) throw new UnauthorizedError('E-mail ou senha incorretos.');
 *
 * O seed completo (`prisma/seed.ts`) insere usuários, mas APAGA todas as tabelas
 * antes e cria dados de demonstração (evento fictício, convidados, etc.) — não
 * serve para um banco de produção já em uso.
 *
 * Este script cria SOMENTE o super admin, de forma idempotente:
 *   - se o e-mail não existe  → cria com a senha de `SEED_SUPER_ADMIN_PASSWORD`;
 *   - se já existe            → não altera nada (nunca sobrescreve a senha).
 *
 * DIFERENÇA PARA O SEED
 * ---------------------
 * Aqui nada é apagado e nenhum dado de exemplo é criado. É seguro rodar contra
 * um banco de produção quantas vezes for necessário.
 *
 * Uso (dentro de packages/api):
 *   npm run db:bootstrap-admin
 *
 * Variáveis respeitadas (com os mesmos defaults do env.ts):
 *   SEED_SUPER_ADMIN_NAME      (default "Super Admin")
 *   SEED_SUPER_ADMIN_EMAIL     (default super@celebrai.app)
 *   SEED_SUPER_ADMIN_PASSWORD  (default SuperAdmin@123)
 */
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(__dirname, '..');
const envFile = resolve(apiRoot, '.env');

/**
 * Carrega o `.env` do workspace da API sem depender do dotenv.
 *
 * A resolução de módulos do workspace raiz já traz o `dotenv` instalado, mas
 * lê-lo diretamente aqui mantém o script utilizável mesmo se as dependências
 * não estiverem instaladas por completo.
 */
function loadDotEnv() {
  if (!existsSync(envFile)) return;
  const content = readFileSync(envFile, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^"|"$/g, '');
    // Variável já presente no ambiente tem prioridade (ex.: injeção da Vercel).
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv();

/**
 * Aliases de conexão que a Vercel/Neon podem injetar no lugar de DATABASE_URL.
 * Espelha `applyDatabaseUrlAlias()` de `src/config/env.ts`.
 */
const DATABASE_URL_ALIASES = [
  'POSTGRES_URL',
  'PRISMA_DATABASE_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING',
];

function resolveDatabaseUrl() {
  const current = process.env.DATABASE_URL;
  if (current && /^postgres(ql)?:\/\//.test(current.trim())) return current.trim();

  const alias = DATABASE_URL_ALIASES.find((key) => {
    const value = process.env[key];
    return value && /^postgres(ql)?:\/\//.test(value.trim());
  });

  if (alias) return process.env[alias].trim();
  return current?.trim() ?? null;
}

const databaseUrl = resolveDatabaseUrl();

if (!databaseUrl) {
  console.error(
    '[celebrai] bootstrap-admin: nenhuma URL de banco encontrada.\n' +
    '          Defina DATABASE_URL (ou POSTGRES_URL) no .env ou no ambiente.',
  );
  process.exit(1);
}

const email = (process.env.SEED_SUPER_ADMIN_EMAIL ?? 'super@celebrai.app').trim().toLowerCase();
const name = process.env.SEED_SUPER_ADMIN_NAME ?? 'Super Admin';
const password = process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'SuperAdmin@123';

if (password.length < 8) {
  console.error('[celebrai] bootstrap-admin: SEED_SUPER_ADMIN_PASSWORD deve ter ao menos 8 caracteres.');
  process.exit(1);
}

/**
 * Resolve o Prisma Client gerado e o bcryptjs a partir das dependências do
 * monorepo. O Client é carregado via `createRequire` porque este arquivo é ESM.
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient({
  datasources: { db: { url: databaseUrl } },
  log: ['error'],
});

async function main() {
  console.log(`[celebrai] bootstrap-admin: verificando "${email}"…`);

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    console.log(
      `[celebrai] bootstrap-admin: usuário já existe (role=${existing.role}, status=${existing.status}).\n` +
      '          Nada alterado — a senha atual foi preservada.',
    );
    return;
  }

  const passwordHash = await bcrypt.hash(password, Number(process.env.BCRYPT_ROUNDS ?? 12));

  const user = await prisma.user.create({
    data: { name, email, passwordHash, role: 'SUPER_ADMIN' },
    select: { id: true, email: true, role: true, status: true },
  });

  console.log(
    `[celebrai] bootstrap-admin: ✅ SUPER_ADMIN criado.\n` +
    `          id:    ${user.id}\n` +
    `          email: ${user.email}\n` +
    `          role:  ${user.role}\n\n` +
    '          Faça login com este e-mail e a senha de SEED_SUPER_ADMIN_PASSWORD\n' +
    '          e troque-a em seguida.',
  );
}

main()
  .catch((error) => {
    console.error('[celebrai] bootstrap-admin: ❌ falha:', error);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });