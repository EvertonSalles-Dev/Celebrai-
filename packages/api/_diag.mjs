/**
 * Diagnóstico da causa raiz do 500 no login.
 * Roda a mesma consulta que o POST /auth/login faz e imprime o erro real.
 */
import { config } from 'dotenv';
config();

const url = process.env.DATABASE_URL || '';
console.log('DATABASE_PROVIDER =', process.env.DATABASE_PROVIDER);
console.log('DATABASE_URL      =', url.slice(0, 24) + '…');
console.log('prefixo da URL    =', url.split(':')[0] || '(vazio)');

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

try {
  const u = await prisma.user.findFirst();
  console.log('CONSULTA OK ->', u ? `${u.email} | role=${u.role} | status=${u.status}` : '(nenhum usuário na tabela)');
} catch (error) {
  console.log('--- ERRO REAL DO PRISMA ---');
  console.log('name    =', error?.name);
  console.log('code    =', error?.code);
  console.log('message =', error?.message);
}

await prisma.$disconnect();
