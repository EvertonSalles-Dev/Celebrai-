// Diagnóstico temporário: conecta no banco e conta registros nas tabelas principais.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const url = process.env.DATABASE_URL ?? '';
  const safe = url.replace(/:\/\/([^:]+):[^@]+@/, '://$1:***@');
  console.log('DATABASE_URL (mascarada):', safe);
  console.log('');

  const [users, events, guests, invitations] = await Promise.all([
    prisma.user.count(),
    prisma.event.count(),
    prisma.guest.count(),
    prisma.invitation.count(),
  ]);

  console.log('users       =', users);
  console.log('events      =', events);
  console.log('guests      =', guests);
  console.log('invitations =', invitations);
  console.log('');

  const list = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  console.log('Usuarios cadastrados:');
  console.table(list);
} catch (error) {
  console.error('ERRO:', error?.message ?? error);
  if (error?.code) console.error('Prisma code:', error.code);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}