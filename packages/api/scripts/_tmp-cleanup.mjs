import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const tests = await prisma.event.findMany({
  where: { title: { contains: 'QA' } },
  select: { id: true, title: true },
});
console.log('eventos de teste encontrados:', tests);

for (const t of tests) {
  const guests = await prisma.guest.count({ where: { eventId: t.id } });
  const audits = await prisma.auditLog.count({ where: { eventId: t.id } });
  console.log(`  ${t.id} "${t.title}" -> guests:${guests} auditLogs:${audits}`);

  try {
    await prisma.event.delete({ where: { id: t.id } });
    console.log('  -> excluido');
  } catch (e) {
    console.log('  -> ERRO:', String(e.message).split('\n').slice(0, 5).join(' | '));
  }
}

await prisma.$disconnect();
