/**
 * Diagnostic: shows the full state of the two demo doctors and their links.
 *
 * Run with: npx ts-node scripts/diagnose-demo-doctors.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EMAILS = ['dradrien1@gmail.com', 'dradrien2@gmail.com'];

async function main() {
  for (const email of EMAILS) {
    console.log(`\n===== ${email} =====`);
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        doctor: {
          include: {
            institutions: { include: { institution: true } },
            institution: true,
          },
        },
        nurse: true,
      },
    });

    if (!user) {
      console.log('  ✗ User not found');
      continue;
    }

    console.log(`  User: ${user.firstName} ${user.lastName} (id=${user.id})`);
    console.log(`  Role: ${user.role}`);
    console.log(`  availableRoles: ${JSON.stringify(user.availableRoles)}`);
    console.log(`  hasNurseProfile: ${!!user.nurse}`);
    console.log(`  hasDoctorProfile: ${!!user.doctor}`);

    if (user.doctor) {
      console.log(`  Doctor specialty: ${user.doctor.specialty}`);
      console.log(`  Doctor primary institution: ${user.doctor.institution?.name ?? 'NONE'}`);
      console.log(`  Doctor licenseNumber: ${user.doctor.licenseNumber}`);
      console.log(`  DoctorInstitution links (${user.doctor.institutions.length}):`);
      for (const link of user.doctor.institutions) {
        console.log(
          `    → ${link.institution.name} | active=${link.isActive} | primary=${link.isPrimary} | specialty(override)=${link.specialty ?? '(none)'}`,
        );
      }
    }
  }
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
