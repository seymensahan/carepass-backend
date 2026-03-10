import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AppwriteService } from '../common/services/appwrite.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly appwriteService: AppwriteService,
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
}
