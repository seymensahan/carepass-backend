import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient, Role } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AppwriteService } from '../common/services/appwrite.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly appwriteService: AppwriteService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ---------------------------------------------------------------------------
  // GET PROFILE
  // ---------------------------------------------------------------------------
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        role: true,
        availableRoles: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatarUrl: true,
        isActive: true,
        emailVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        patient: {
          include: {
            allergies: true,
            medicalConditions: true,
            emergencyContacts: true,
            children: true,
          },
        },
        doctor: {
          include: {
            institution: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // Build response with role-specific data
    const { patient, doctor, ...baseUser } = user;

    const profile: any = { ...baseUser };

    if (user.role === Role.patient && patient) {
      profile.patient = patient;
    }

    if (user.role === Role.doctor && doctor) {
      profile.doctor = doctor;
    }

    // Add institution status for institution_admin, doctor, and nurse roles
    if (['institution_admin', 'doctor', 'nurse'].includes(user.role)) {
      let institution: any = null;
      if (user.role === 'institution_admin') {
        institution = await this.prisma.institution.findFirst({ where: { adminUserId: userId } });
      } else if (user.role === 'doctor' && doctor?.institutionId) {
        institution = await this.prisma.institution.findUnique({ where: { id: doctor.institutionId } });
      } else if (user.role === 'nurse') {
        const nurse = await this.prisma.nurse.findUnique({ where: { userId } });
        if (nurse?.institutionId) {
          institution = await this.prisma.institution.findUnique({ where: { id: nurse.institutionId } });
        }
      }
      if (institution) {
        profile.institutionStatus = {
          isSuspended: institution.isSuspended || false,
          suspensionReason: institution.suspensionReason || null,
        };
      }
    }

    // Add subscription status for all subscribable roles
    if (['institution_admin', 'patient', 'doctor', 'nurse'].includes(user.role)) {
      const subscription = await this.prisma.subscription.findFirst({
        where: { userId, status: 'active' },
        include: { plan: { select: { name: true } } },
        orderBy: { endDate: 'desc' },
      });
      if (subscription) {
        const isExpired = new Date(subscription.endDate) < new Date();
        profile.subscriptionStatus = {
          isExpired,
          endDate: subscription.endDate,
          planName: subscription.plan?.name || null,
        };
      } else {
        // Check if user has ANY subscription (expired/cancelled)
        const anySubscription = await this.prisma.subscription.findFirst({
          where: { userId },
          include: { plan: { select: { name: true } } },
          orderBy: { endDate: 'desc' },
        });
        if (anySubscription) {
          // Had a subscription that expired
          profile.subscriptionStatus = {
            isExpired: true,
            endDate: anySubscription.endDate,
            planName: anySubscription.plan?.name || null,
          };
        } else if (user.role === 'institution_admin') {
          // Institution admin without any subscription
          profile.subscriptionStatus = {
            isExpired: true,
            endDate: null,
            planName: null,
          };
        }
        // For patient/doctor/nurse without subscription: don't block (they might not have subscribed yet)
      }
    }

    return profile;
  }

  // ---------------------------------------------------------------------------
  // UPDATE PROFILE
  // ---------------------------------------------------------------------------
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // Update User table fields
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
      },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatarUrl: true,
        updatedAt: true,
      },
    });

    // Update Patient table fields (gender, dateOfBirth, bloodGroup, genotype)
    const hasPatientFields = dto.gender !== undefined || dto.dateOfBirth !== undefined
      || dto.bloodGroup !== undefined || dto.genotype !== undefined;

    if (user.role === Role.patient && hasPatientFields) {
      await this.prisma.patient.updateMany({
        where: { userId },
        data: {
          ...(dto.gender !== undefined && { gender: dto.gender as any }),
          ...(dto.dateOfBirth !== undefined && { dateOfBirth: new Date(dto.dateOfBirth) }),
          ...(dto.bloodGroup !== undefined && { bloodGroup: dto.bloodGroup || null }),
          ...(dto.genotype !== undefined && { genotype: dto.genotype || null }),
        },
      });
    }

    return {
      message: 'Profil mis à jour avec succès',
      user: updatedUser,
    };
  }

  // ---------------------------------------------------------------------------
  // CHANGE PASSWORD
  // ---------------------------------------------------------------------------
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      throw new UnauthorizedException('Le mot de passe actuel est incorrect');
    }

    // Prevent setting the same password
    const isSamePassword = await bcrypt.compare(dto.newPassword, user.passwordHash);
    if (isSamePassword) {
      throw new BadRequestException('Le nouveau mot de passe doit être différent de l\'actuel');
    }

    // Hash and update
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: 'Mot de passe modifié avec succès' };
  }

  // ---------------------------------------------------------------------------
  // UPLOAD AVATAR
  // ---------------------------------------------------------------------------
  async uploadAvatar(userId: string, file: Express.Multer.File) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    if (!file) {
      throw new BadRequestException('Aucun fichier fourni');
    }

    // Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Format de fichier non supporté. Utilisez JPEG, PNG, WebP ou GIF');
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('Le fichier ne doit pas dépasser 5 Mo');
    }

    // Upload to Appwrite
    const { url: avatarUrl } = await this.appwriteService.uploadFile(file, 'avatars');

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarUrl },
      select: {
        id: true,
        avatarUrl: true,
      },
    });

    return {
      message: 'Avatar mis à jour avec succès',
      user: updatedUser,
    };
  }

  // ---------------------------------------------------------------------------
  // ADD NURSE ROLE TO EXISTING PATIENT
  // ---------------------------------------------------------------------------
  /**
   * Allow a patient user to also become a nurse.
   * Creates a Nurse profile linked to an institution and adds 'nurse' to availableRoles.
   * The user keeps their patient profile and can switch between roles.
   */
  // ---------------------------------------------------------------------------
  // ENSURE USER HAS A PATIENT PROFILE
  // ---------------------------------------------------------------------------
  /**
   * Make sure the user has a Patient profile. Used for doctors/nurses created
   * before we started auto-creating patient profiles for them.
   */
  async ensurePatientProfile(userId: string, dto?: {
    dateOfBirth?: string;
    gender?: string;
    bloodGroup?: string;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { patient: true },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    if (user.patient) {
      return { message: 'Profil patient déjà existant', patient: user.patient };
    }

    // Generate CaryPass ID using same logic as auth.service
    const year = new Date().getFullYear();
    const counterResult = await this.prisma.$transaction(async (tx) => {
      const setting = await tx.systemSetting.findUnique({
        where: { key: 'carypass_id_counter' },
      });
      const counter = parseInt(setting?.value || '0') + 1;
      await tx.systemSetting.upsert({
        where: { key: 'carypass_id_counter' },
        update: { value: counter.toString() },
        create: {
          key: 'carypass_id_counter',
          value: counter.toString(),
          description: 'Compteur CaryPass ID',
        },
      });
      return counter;
    });
    const carypassId = `CP-${year}-${counterResult.toString().padStart(5, '0')}`;

    const patient = await this.prisma.patient.create({
      data: {
        userId,
        carypassId,
        dateOfBirth: dto?.dateOfBirth ? new Date(dto.dateOfBirth) : new Date('2000-01-01'),
        gender: dto?.gender as any,
        bloodGroup: dto?.bloodGroup,
      },
    });

    // Add 'patient' to availableRoles if not already present
    const newRoles = Array.from(new Set([...user.availableRoles, 'patient' as Role]));
    await this.prisma.user.update({
      where: { id: userId },
      data: { availableRoles: newRoles },
    });

    return {
      message: 'Profil patient créé. Vous pouvez maintenant gérer votre dossier médical personnel.',
      patient,
    };
  }

  // ---------------------------------------------------------------------------
  // ADD DOCTOR ROLE TO EXISTING USER
  // ---------------------------------------------------------------------------
  /**
   * Allow a patient user to also become a doctor.
   * Creates a Doctor profile (unverified — pending super admin validation).
   */
  async addDoctorRole(userId: string, dto: {
    specialty: string;
    licenseNumber: string;
    institutionId?: string;
    bio?: string;
    city?: string;
    region?: string;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { doctor: true },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    if (user.doctor) {
      throw new BadRequestException('Vous êtes déjà enregistré comme médecin');
    }

    // Verify license number is unique
    const existingLicense = await this.prisma.doctor.findUnique({
      where: { licenseNumber: dto.licenseNumber },
    });
    if (existingLicense) {
      throw new BadRequestException('Ce numéro de licence est déjà utilisé');
    }

    // Verify institution if provided
    if (dto.institutionId) {
      const institution = await this.prisma.institution.findUnique({
        where: { id: dto.institutionId },
      });
      if (!institution) {
        throw new NotFoundException('Institution non trouvée');
      }
    }

    // Create doctor profile + add doctor to availableRoles in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const doctor = await tx.doctor.create({
        data: {
          userId,
          specialty: dto.specialty,
          licenseNumber: dto.licenseNumber,
          institutionId: dto.institutionId,
          bio: dto.bio,
          city: dto.city,
          region: dto.region,
          isVerified: false, // Requires super admin validation
        },
      });

      // Also create DoctorInstitution entry if institution provided
      if (dto.institutionId) {
        await tx.doctorInstitution.create({
          data: {
            doctorId: doctor.id,
            institutionId: dto.institutionId,
            isPrimary: true,
          },
        });
      }

      const newRoles = Array.from(new Set([...user.availableRoles, 'doctor' as Role]));
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { availableRoles: newRoles },
        select: { id: true, availableRoles: true, role: true },
      });

      return { doctor, user: updatedUser };
    });

    return {
      message: 'Profil médecin créé. En attente de vérification par l\'administrateur.',
      doctor: result.doctor,
      availableRoles: result.user.availableRoles,
    };
  }

  async addNurseRole(userId: string, dto: {
    institutionId: string;
    specialty: string;
    licenseNumber: string;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { nurse: true },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    if (user.nurse) {
      throw new BadRequestException('Vous êtes déjà enregistré comme infirmier');
    }

    // Verify institution exists
    const institution = await this.prisma.institution.findUnique({
      where: { id: dto.institutionId },
    });
    if (!institution) {
      throw new NotFoundException('Institution non trouvée');
    }

    // Verify license number is unique
    const existingLicense = await this.prisma.nurse.findUnique({
      where: { licenseNumber: dto.licenseNumber },
    });
    if (existingLicense) {
      throw new BadRequestException('Ce numéro de licence est déjà utilisé');
    }

    // Create nurse profile + add nurse to availableRoles in transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const nurse = await tx.nurse.create({
        data: {
          userId,
          institutionId: dto.institutionId,
          specialty: dto.specialty,
          licenseNumber: dto.licenseNumber,
        },
      });

      const newRoles = Array.from(new Set([...user.availableRoles, 'nurse' as Role]));
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: { availableRoles: newRoles },
        select: { id: true, availableRoles: true, role: true },
      });

      return { nurse, user: updatedUser };
    });

    return {
      message: 'Profil infirmier créé avec succès. Vous pouvez maintenant basculer entre vos rôles.',
      nurse: result.nurse,
      availableRoles: result.user.availableRoles,
    };
  }

  // ---------------------------------------------------------------------------
  // SWITCH ACTIVE ROLE
  // ---------------------------------------------------------------------------
  /**
   * Switch the user's active role to one of their availableRoles.
   * Used when a user has multiple roles (e.g. patient + nurse).
   */
  async switchActiveRole(userId: string, newRole: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    if (!user.availableRoles.includes(newRole as Role)) {
      throw new BadRequestException(`Ce rôle n'est pas disponible pour vous`);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role: newRole as Role },
      select: {
        id: true,
        email: true,
        role: true,
        availableRoles: true,
        firstName: true,
        lastName: true,
        phone: true,
        avatarUrl: true,
      },
    });

    // Generate new JWT tokens with the new role
    const payload = { sub: updated.id, email: updated.email, role: updated.role };
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: (this.configService.get<string>('JWT_EXPIRES_IN') || '15m') as any,
    });
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') || '7d') as any,
    });

    return {
      message: `Rôle actif changé en ${newRole}`,
      user: updated,
      accessToken,
      refreshToken,
    };
  }

  // ---------------------------------------------------------------------------
  // DELETE ACCOUNT (soft delete)
  // ---------------------------------------------------------------------------
  async deleteAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    if (!user.isActive) {
      throw new BadRequestException('Ce compte est déjà désactivé');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    return { message: 'Compte désactivé avec succès' };
  }

  // ---------------------------------------------------------------------------
  // ADMIN: UPDATE USER (super_admin)
  // ---------------------------------------------------------------------------
  async adminUpdateUser(id: string, data: { isActive?: boolean; isBanned?: boolean }) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
      select: { id: true, email: true, firstName: true, lastName: true, isActive: true, role: true },
    });

    return { success: true, data: updated };
  }

  // ---------------------------------------------------------------------------
  // ADMIN: DELETE USER (super_admin)
  // ---------------------------------------------------------------------------
  async adminDeleteUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // Hard delete: clean up ALL related data then delete user
    // Order matters due to foreign key constraints

    // 1. Generic user-level data
    await this.prisma.notification.deleteMany({ where: { userId: id } });
    await this.prisma.otpCode.deleteMany({ where: { userId: id } });
    await this.prisma.emailVerificationToken.deleteMany({ where: { userId: id } });
    await this.prisma.passwordResetToken.deleteMany({ where: { userId: id } });

    // 2. Patient-specific cleanup
    const patient = await this.prisma.patient.findUnique({ where: { userId: id } });
    if (patient) {
      // Delete prescription items → prescriptions → consultations
      const consultations = await this.prisma.consultation.findMany({
        where: { patientId: patient.id },
        select: { id: true },
      });
      const consultationIds = consultations.map(c => c.id);
      if (consultationIds.length > 0) {
        const prescriptions = await this.prisma.prescription.findMany({
          where: { consultationId: { in: consultationIds } },
          select: { id: true },
        });
        if (prescriptions.length > 0) {
          await this.prisma.prescriptionItem.deleteMany({
            where: { prescriptionId: { in: prescriptions.map(p => p.id) } },
          });
          await this.prisma.prescription.deleteMany({
            where: { consultationId: { in: consultationIds } },
          });
        }
        await this.prisma.consultation.deleteMany({ where: { patientId: patient.id } });
      }

      await this.prisma.allergy.deleteMany({ where: { patientId: patient.id } });
      await this.prisma.medicalCondition.deleteMany({ where: { patientId: patient.id } });
      await this.prisma.emergencyContact.deleteMany({ where: { patientId: patient.id } });
      await this.prisma.vaccination.deleteMany({ where: { patientId: patient.id } });
      await this.prisma.labResult.deleteMany({ where: { patientId: patient.id } });
      await this.prisma.accessGrant.deleteMany({ where: { patientId: patient.id } });
      await this.prisma.accessRequest.deleteMany({ where: { patientId: patient.id } });
      await this.prisma.appointment.deleteMany({ where: { patientId: patient.id } });
      // Children
      const children = await this.prisma.child.findMany({ where: { parentId: patient.id }, select: { id: true } });
      if (children.length > 0) {
        await this.prisma.vaccination.deleteMany({ where: { childId: { in: children.map(c => c.id) } } });
        await this.prisma.child.deleteMany({ where: { parentId: patient.id } });
      }
      await this.prisma.patient.delete({ where: { id: patient.id } });
    }

    // 3. Doctor-specific cleanup
    const doctor = await this.prisma.doctor.findUnique({ where: { userId: id } });
    if (doctor) {
      await this.prisma.doctorInstitution.deleteMany({ where: { doctorId: doctor.id } });
      await this.prisma.accessGrant.deleteMany({ where: { doctorId: doctor.id } });
      await this.prisma.accessRequest.deleteMany({ where: { doctorId: doctor.id } });
      await this.prisma.appointment.deleteMany({ where: { doctorId: doctor.id } });
      await this.prisma.doctor.delete({ where: { id: doctor.id } });
    }

    // 4. Nurse-specific cleanup
    const nurse = await this.prisma.nurse.findUnique({ where: { userId: id } });
    if (nurse) {
      await this.prisma.hospitalisationNurseAssignment.deleteMany({ where: { nurseId: nurse.id } });
      await this.prisma.nurse.delete({ where: { id: nurse.id } });
    }

    // 5. Institution admin cleanup
    await this.prisma.institution.updateMany({ where: { adminUserId: id }, data: { adminUserId: null } });

    // 6. Subscription/payment cleanup
    await this.prisma.payment.deleteMany({ where: { userId: id } });
    await this.prisma.subscription.deleteMany({ where: { userId: id } });

    // 7. Delete user
    await this.prisma.user.delete({ where: { id } });

    return { success: true, message: 'Utilisateur supprimé avec succès' };
  }
}
