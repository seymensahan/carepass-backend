/**
 * Quick diagnostic: list all institutions in the DB and which user admins each.
 *
 * Run with: npx ts-node scripts/list-institutions.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const institutions = await prisma.institution.findMany({
    include: {
      adminUser: { select: { id: true, email: true, firstName: true, lastName: true } },
      doctors: { select: { id: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`\nFound ${institutions.length} institution(s):\n`);

  for (const inst of institutions) {
    console.log(`📍 ${inst.name}`);
    console.log(`   id: ${inst.id}`);
    console.log(`   type: ${inst.type}`);
    console.log(
      `   admin: ${inst.adminUser ? `${inst.adminUser.firstName} ${inst.adminUser.lastName} <${inst.adminUser.email}>` : '(no admin user)'}`,
    );
    console.log(`   doctors attached: ${inst.doctors.length}`);
    console.log('');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
