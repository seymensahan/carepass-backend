/**
 * Diagnose why a test nurse account sees no patients / consultations / hospitalisations.
 * Prints the nurse's institutionId, counts of related rows, and common filter results.
 *
 * Run with: npx ts-node scripts/diagnose-nurse-data.ts <email>
 * Example:  npx ts-node scripts/diagnose-nurse-data.ts infirmiere.test@carypass.cm
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const email = process.argv[2] || 'infirmiere.test@carypass.cm';

  const user = await prisma.user.findUnique({
    where: { email },
    include: { nurse: true },
  });

  if (!user) {
    console.log(`[!] No user with email ${email}`);
    await prisma.$disconnect();
    return;
  }

  console.log(`\n=== USER ${email} ===`);
  console.log(`  id:              ${user.id}`);
  console.log(`  role:            ${user.role}`);
  console.log(`  availableRoles:  ${JSON.stringify(user.availableRoles)}`);

  if (!user.nurse) {
    console.log(`[!] No Nurse profile linked to this user`);
    await prisma.$disconnect();
    return;
  }

  const nurse = user.nurse;
  console.log(`\n=== NURSE PROFILE ===`);
  console.log(`  nurse.id:         ${nurse.id}`);
  console.log(`  institutionId:    ${nurse.institutionId ?? 'NULL'}`);
  console.log(`  specialty:        ${nurse.specialty}`);
  console.log(`  licenseNumber:    ${nurse.licenseNumber}`);

  if (!nurse.institutionId) {
    console.log(`\n[!] nurse.institutionId is NULL — dashboard/hospitalisations/pending-tasks will return 0`);
  } else {
    const institution = await prisma.institution.findUnique({ where: { id: nurse.institutionId } });
    console.log(`  institution.name: ${institution?.name ?? 'NOT FOUND'}`);
  }

  // Consultations initiated by this nurse
  const initiatedConsultations = await prisma.consultation.count({
    where: { initiatedByNurseId: nurse.id },
  });
  console.log(`\n=== DATA COUNTS ===`);
  console.log(`  consultations initiated by nurse:         ${initiatedConsultations}`);

  // Hospitalisation assignments
  const assignmentsCount = await prisma.hospitalisationNurseAssignment.count({
    where: { nurseId: nurse.id },
  });
  console.log(`  hospitalisation assignments:              ${assignmentsCount}`);

  // Access grants
  const accessGrants = await prisma.accessGrant.count({
    where: { doctorId: nurse.id, isActive: true },
  });
  console.log(`  active access grants (nurse as grantee):  ${accessGrants}`);

  // Care plan executions in last 7 days
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const executions = await prisma.carePlanExecution.count({
    where: { nurseId: nurse.id, executedAt: { gte: since } },
  });
  console.log(`  care plan executions (last 7 days):       ${executions}`);

  // Pending items in nurse's institution (if any)
  if (nurse.institutionId) {
    const pending = await prisma.carePlanItem.count({
      where: {
        hospitalisation: {
          institutionId: nurse.institutionId,
          nurseAssignments: { some: { nurseId: nurse.id } },
        },
      },
    });
    console.log(`  care plan items (assigned to nurse):      ${pending}`);
  }

  console.log(`\n=== LIKELY CAUSES ===`);
  if (!nurse.institutionId) {
    console.log(`  1. nurse.institutionId is NULL → dashboard endpoints return empty.`);
    console.log(`     Fix: assign an institution to the nurse.`);
  }
  if (assignmentsCount === 0) {
    console.log(`  2. No HospitalisationNurseAssignment records exist.`);
    console.log(`     Hospitalisations + pending tasks will be empty until doctor/admin`);
    console.log(`     assigns this nurse to a hospitalisation.`);
  }
  if (initiatedConsultations === 0 && accessGrants === 0) {
    console.log(`  3. No initiated consultations AND no access grants → my-patients will be empty.`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
