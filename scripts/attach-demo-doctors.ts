/**
 * Attach the two test doctors (dradrien1, dradrien2) to a hospital so the
 * demo institution dashboard shows realistic doctor metrics.
 *
 * Run with: npx ts-node scripts/attach-demo-doctors.ts
 *
 * Override target hospital with env vars:
 *   HOSPITAL_NAME="My Hospital" npx ts-node scripts/attach-demo-doctors.ts
 *   HOSPITAL_ADMIN_EMAIL="admin@h.com" npx ts-node scripts/attach-demo-doctors.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const HOSPITAL_NAME = process.env.HOSPITAL_NAME || 'Hôpital Central de Yaoundé';
const HOSPITAL_ADMIN_EMAIL = process.env.HOSPITAL_ADMIN_EMAIL;

const DOCTORS_TO_ATTACH = [
  {
    email: 'dradrien1@gmail.com',
    forceFirstName: 'Adrien',
    forceLastName: 'Nkemgefa',
    specialty: 'Médecine Générale',
    role: 'doctor',
    isPrimary: true,
  },
  {
    email: 'dradrien2@gmail.com',
    forceFirstName: 'Claude',
    forceLastName: 'Nkemgefa',
    specialty: 'Cardiologie',
    role: 'doctor',
    isPrimary: false,
  },
];

async function main() {
  let hospital;

  if (HOSPITAL_ADMIN_EMAIL) {
    const adminUser = await prisma.user.findUnique({ where: { email: HOSPITAL_ADMIN_EMAIL } });
    if (!adminUser) {
      console.error(`Admin user "${HOSPITAL_ADMIN_EMAIL}" not found.`);
      process.exit(1);
    }
    hospital = await prisma.institution.findFirst({
      where: { adminUserId: adminUser.id },
    });
    if (!hospital) {
      console.error(`No institution found administered by ${HOSPITAL_ADMIN_EMAIL}.`);
      process.exit(1);
    }
  } else {
    hospital = await prisma.institution.findFirst({
      where: { name: HOSPITAL_NAME },
    });
    if (!hospital) {
      console.error(`Hospital "${HOSPITAL_NAME}" not found.`);
      console.error(`Run "npx ts-node scripts/list-institutions.ts" to see all institutions.`);
      process.exit(1);
    }
  }

  console.log(`\nHospital target: ${hospital.name} (${hospital.id})\n`);

  for (const target of DOCTORS_TO_ATTACH) {
    console.log(`▶ ${target.email}`);

    let user = await prisma.user.findUnique({ where: { email: target.email } });

    if (!user) {
      // Create the account from scratch with a known password (Password123!)
      const passwordHash = '$2b$10$rqXC0ZS9SYc0L9N6qP3VsuqK7MRr2QhpTfMnmMZUKO8hFvSdYeKOq';
      user = await prisma.user.create({
        data: {
          email: target.email,
          passwordHash,
          firstName: target.forceFirstName,
          lastName: target.forceLastName,
          role: 'doctor',
          availableRoles: ['doctor'],
          emailVerifiedAt: new Date(),
        },
      });
      console.log(`   ✓ User created from scratch with role=doctor`);
    } else {
      // Force-update name + role + availableRoles so the doctors list always shows
      // the right name regardless of what data was already there.
      const availableRoles = new Set<string>(
        user.availableRoles && user.availableRoles.length > 0
          ? (user.availableRoles as string[])
          : [user.role],
      );
      availableRoles.add('doctor');

      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          firstName: target.forceFirstName,
          lastName: target.forceLastName,
          // Promote primary role to doctor so the institution dashboard treats them
          // as one. The other roles stay reachable through availableRoles.
          role: 'doctor',
          availableRoles: [...availableRoles] as any,
          emailVerifiedAt: new Date(),
        },
      });
      console.log(`   ✓ User updated: name forced to "${target.forceFirstName} ${target.forceLastName}", role=doctor`);
    }

    // Drop any nurse profile that would conflict with the doctor view
    const existingNurse = await prisma.nurse.findUnique({ where: { userId: user.id } });
    if (existingNurse) {
      await prisma.nurse.delete({ where: { id: existingNurse.id } });
      console.log(`   ⚠ Existing nurse profile removed (was blocking doctor flow)`);
    }

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
      console.log(`   ✓ Doctor profile created (specialty=${target.specialty})`);
    } else {
      doctor = await prisma.doctor.update({
        where: { id: doctor.id },
        data: {
          specialty: doctor.specialty || target.specialty,
          institutionId: target.isPrimary ? hospital.id : doctor.institutionId,
          isVerified: true,
          verifiedAt: doctor.verifiedAt || new Date(),
        },
      });
      console.log(`   ✓ Doctor profile already existed, kept`);
    }

    await prisma.doctorInstitution.upsert({
      where: {
        doctorId_institutionId: { doctorId: doctor.id, institutionId: hospital.id },
      },
      create: {
        doctorId: doctor.id,
        institutionId: hospital.id,
        role: target.role,
        specialty: target.specialty,
        isPrimary: target.isPrimary,
        isActive: true,
        startDate: new Date(),
      },
      update: {
        role: target.role,
        specialty: target.specialty,
        isPrimary: target.isPrimary,
        isActive: true,
        endDate: null,
      },
    });
    console.log(`   ✓ Attached to ${hospital.name} (specialty=${target.specialty}, primary=${target.isPrimary})\n`);
  }

  console.log('Done. The two doctors are now visible in the institution dashboard.');
}

main()
  .catch((e) => {
    console.error('\n❌ Script failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
