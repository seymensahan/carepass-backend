/**
 * Attach the two test doctors (dradrien1, dradrien2) to "Hôpital Central de
 * Yaoundé" so the demo institution dashboard shows realistic doctor metrics.
 *
 * Run with: npx ts-node scripts/attach-demo-doctors.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const HOSPITAL_NAME = 'Hôpital Central de Yaoundé';

const DOCTORS_TO_ATTACH = [
  {
    email: 'dradrien1@gmail.com',
    fallbackFirstName: 'Adrien',
    fallbackLastName: 'Nkemgefa',
    specialty: 'Médecine Générale',
    role: 'doctor',
    isPrimary: true,
  },
  {
    email: 'dradrien2@gmail.com',
    fallbackFirstName: 'Claude',
    fallbackLastName: 'Nkemgefa',
    specialty: 'Cardiologie',
    role: 'doctor',
    isPrimary: false,
  },
];

async function main() {
  const hospital = await prisma.institution.findFirst({
    where: { name: HOSPITAL_NAME },
  });

  if (!hospital) {
    console.error(`Hospital "${HOSPITAL_NAME}" not found. Did the seed run?`);
    process.exit(1);
  }

  console.log(`Hospital found: ${hospital.name} (${hospital.id})`);

  for (const target of DOCTORS_TO_ATTACH) {
    const user = await prisma.user.findUnique({ where: { email: target.email } });
    if (!user) {
      console.log(`  ✗ ${target.email} — user not found. Run the user creation step first.`);
      continue;
    }

    if (!user.firstName || !user.lastName) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          firstName: user.firstName || target.fallbackFirstName,
          lastName: user.lastName || target.fallbackLastName,
        },
      });
    }

    const availableRoles = new Set<string>(
      user.availableRoles && user.availableRoles.length > 0 ? user.availableRoles : [user.role],
    );
    availableRoles.add('doctor');
    await prisma.user.update({
      where: { id: user.id },
      data: { availableRoles: [...availableRoles] as any },
    });

    let doctor = await prisma.doctor.findUnique({ where: { userId: user.id } });
    if (!doctor) {
      doctor = await prisma.doctor.create({
        data: {
          userId: user.id,
          specialty: target.specialty,
          licenseNumber: `CM-DOC-${Date.now()}-${target.email.split('@')[0]}`.slice(0, 50),
          institutionId: target.isPrimary ? hospital.id : null,
          isVerified: true,
          verifiedAt: new Date(),
        },
      });
      console.log(`  ✓ ${target.email} — Doctor profile created (${target.specialty})`);
    } else {
      await prisma.doctor.update({
        where: { id: doctor.id },
        data: {
          specialty: doctor.specialty || target.specialty,
          institutionId: target.isPrimary ? hospital.id : doctor.institutionId,
          isVerified: true,
          verifiedAt: doctor.verifiedAt || new Date(),
        },
      });
      console.log(`  ✓ ${target.email} — Doctor profile already exists, kept`);
    }

    await prisma.doctorInstitution.upsert({
      where: {
        doctorId_institutionId: { doctorId: doctor.id, institutionId: hospital.id },
      },
      create: {
        doctorId: doctor.id,
        institutionId: hospital.id,
        role: target.role,
        isPrimary: target.isPrimary,
        isActive: true,
        startDate: new Date(),
      },
      update: {
        role: target.role,
        isActive: true,
        endDate: null,
      },
    });
    console.log(`     → Attached to ${HOSPITAL_NAME} (specialty: ${target.specialty}, primary: ${target.isPrimary})`);
  }

  console.log('\nDone. The two doctors are now visible in the institution dashboard.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
