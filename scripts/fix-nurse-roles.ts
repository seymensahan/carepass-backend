/**
 * Quick script to fix availableRoles for the test nurse account.
 * Run with: npx ts-node scripts/fix-nurse-roles.ts
 */
import { PrismaClient, Role } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const emails = [
    'infirmier.test@carypass.com',
    'infirmiere.test@carypass.com',
    'infirmier.test@carypass.cm',
    'infirmiere.test@carypass.cm',
  ];

  for (const email of emails) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { patient: true, nurse: true, doctor: true },
    });
    if (!user) {
      console.log(`[skip] ${email} — no user found`);
      continue;
    }

    const currentRoles = user.availableRoles || [];
    const newRoles = new Set<Role>(currentRoles);
    // Ensure current role
    newRoles.add(user.role);
    // Add roles for each profile present
    if (user.patient) newRoles.add('patient' as Role);
    if (user.nurse) newRoles.add('nurse' as Role);
    if (user.doctor) newRoles.add('doctor' as Role);

    const finalRoles = Array.from(newRoles);
    await prisma.user.update({
      where: { id: user.id },
      data: { availableRoles: finalRoles },
    });

    console.log(`[ok] ${email}`);
    console.log(`     role=${user.role}`);
    console.log(`     before=${JSON.stringify(currentRoles)}`);
    console.log(`     after=${JSON.stringify(finalRoles)}`);
    console.log(`     profiles: patient=${!!user.patient} nurse=${!!user.nurse} doctor=${!!user.doctor}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
