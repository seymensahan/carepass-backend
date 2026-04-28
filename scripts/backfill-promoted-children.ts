/**
 * Backfill: link Child rows to their promoted Patient via the new
 * `promotedPatientId` column. Detects legacy promotions by the synthetic
 * email pattern `dep-<childId>@carypass.local` set in promoteToPatient.
 *
 * Run with: npx ts-node scripts/backfill-promoted-children.ts
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();

  const candidates = await prisma.child.findMany({
    where: { promotedPatientId: null },
    select: { id: true, firstName: true, lastName: true },
  });

  let linked = 0;
  for (const child of candidates) {
    const syntheticEmail = `dep-${child.id}@carypass.local`;
    const user = await prisma.user.findUnique({
      where: { email: syntheticEmail },
      include: { patient: true },
    });
    if (!user?.patient) continue;

    await prisma.child.update({
      where: { id: child.id },
      data: { promotedPatientId: user.patient.id },
    });
    linked++;
    console.log(
      `[linked] ${child.firstName} ${child.lastName} (${child.id}) → patient ${user.patient.carypassId}`,
    );
  }

  console.log(`\nDone. Linked ${linked}/${candidates.length} child rows.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
