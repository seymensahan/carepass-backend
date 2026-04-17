/**
 * Backfill availableRoles for ALL users based on the profiles they own in DB.
 * Ensures every user whose Nurse/Doctor/Patient profile exists has the
 * corresponding role in availableRoles (in addition to their current role).
 *
 * Run with: npx ts-node scripts/fix-all-available-roles.ts
 */
import { PrismaClient, Role } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();

  const users = await prisma.user.findMany({
    include: { patient: true, nurse: true, doctor: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const user of users) {
    const currentRoles = new Set<Role>(user.availableRoles || []);
    const before = Array.from(currentRoles).sort();

    // Always include current role
    currentRoles.add(user.role);
    if (user.patient) currentRoles.add('patient' as Role);
    if (user.nurse) currentRoles.add('nurse' as Role);
    if (user.doctor) currentRoles.add('doctor' as Role);

    const after = Array.from(currentRoles).sort();
    const changed = before.length !== after.length || before.some((r, i) => r !== after[i]);

    if (!changed) {
      skipped++;
      continue;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { availableRoles: Array.from(currentRoles) },
    });

    updated++;
    console.log(`[updated] ${user.email}`);
    console.log(`          role=${user.role}`);
    console.log(`          before=${JSON.stringify(before)}`);
    console.log(`          after=${JSON.stringify(after)}`);
    console.log(
      `          profiles: patient=${!!user.patient} nurse=${!!user.nurse} doctor=${!!user.doctor}`,
    );
  }

  console.log('');
  console.log(`Done. Updated: ${updated}, skipped (already correct): ${skipped}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
