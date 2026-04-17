import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaClient, Role } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../email/email.service';
import { randomBytes } from 'crypto';

@Injectable()
export class InvitationsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create an invitation and send it via email.
   */
  async createInvitation(
    institutionId: string,
    invitedById: string,
    email: string,
    role: 'doctor' | 'nurse',
    message?: string,
  ) {
    // Check institution exists
    const institution = await this.prisma.institution.findUnique({
      where: { id: institutionId },
    });
    if (!institution) {
      throw new NotFoundException('Institution non trouvée');
    }

    // Check maxDoctors limit from subscription plan
    if (role === 'doctor') {
      // Find the institution admin's active subscription to get the plan limits
      const subscription = await this.prisma.subscription.findFirst({
        where: {
          userId: institution.adminUserId!,
          status: 'active',
        },
        include: { plan: true },
      });

      if (subscription?.plan?.maxDoctors) {
        // Count current doctors + pending doctor invitations
        const [currentDoctors, pendingInvitations] = await Promise.all([
          this.prisma.doctor.count({ where: { institutionId } }),
          this.prisma.invitation.count({ where: { institutionId, role: 'doctor' as any, status: 'pending' } }),
        ]);
        const totalDoctors = currentDoctors + pendingInvitations;
        if (totalDoctors >= subscription.plan.maxDoctors) {
          throw new ConflictException(
            `Limite atteinte : votre plan "${subscription.plan.name}" autorise ${subscription.plan.maxDoctors} médecin(s) maximum. ` +
            `Vous avez actuellement ${currentDoctors} médecin(s) et ${pendingInvitations} invitation(s) en attente. ` +
            `Passez à un plan supérieur pour inviter plus de médecins.`
          );
        }
      }
    }

    // Check if user already exists with this email
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      // Check if already affiliated
      if (role === 'doctor') {
        const existingDoc = await this.prisma.doctor.findFirst({
          where: { userId: existingUser.id, institutionId },
        });
        if (existingDoc) {
          throw new ConflictException('Ce médecin est déjà affilié à votre institution');
        }
      }
      if (role === 'nurse') {
        const existingNurse = await this.prisma.nurse.findFirst({
          where: { userId: existingUser.id, institutionId },
        });
        if (existingNurse) {
          throw new ConflictException('Cet(te) infirmier(e) est déjà affilié(e) à votre institution');
        }
      }
    }

    // Check for pending invitation
    const existingInvitation = await this.prisma.invitation.findFirst({
      where: { email, institutionId, status: 'pending' },
    });
    if (existingInvitation) {
      throw new ConflictException('Une invitation est déjà en attente pour cet email');
    }

    // Create invitation token
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invitation = await this.prisma.invitation.create({
      data: {
        institutionId,
        email,
        role: role as Role,
        token,
        message,
        invitedById,
        expiresAt,
      },
    });

    // Send invitation email
    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const registerUrl = `${frontendUrl}/register/invitation?token=${token}`;
    const roleLabel = role === 'doctor' ? 'médecin' : 'infirmier(e)';

    await this.sendInvitationEmail(email, institution.name, roleLabel, registerUrl, message);

    return invitation;
  }

  /**
   * Create an invitation from a doctor (for nurses) — bypasses institution requirement.
   */
  async createDoctorInvitation(
    doctorId: string,
    invitedByUserId: string,
    email: string,
    message?: string,
  ) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { id: doctorId },
      include: { user: { select: { firstName: true, lastName: true } } },
    });
    if (!doctor) throw new NotFoundException('Médecin non trouvé');

    // Check subscription is active
    const subscription = await this.prisma.subscription.findFirst({
      where: { userId: invitedByUserId, status: 'active' },
    });
    if (!subscription) {
      throw new ConflictException(
        'Vous devez avoir un abonnement actif pour inviter des infirmier(e)s.',
      );
    }

    // If the nurse already has an account AND is already linked, reject
    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser?.role === 'nurse') {
      const existingNurse = await this.prisma.nurse.findUnique({
        where: { userId: existingUser.id },
      });
      if (existingNurse) {
        const existingGrant = await this.prisma.accessGrant.findFirst({
          where: { patientId: existingNurse.id, doctorId, isActive: true },
        });
        if (existingGrant) {
          throw new ConflictException('Cet(te) infirmier(e) est déjà dans votre équipe.');
        }
      }
    }

    const existingInvitation = await this.prisma.invitation.findFirst({
      where: { email, invitedByDoctorId: doctorId, status: 'pending' },
    });
    if (existingInvitation) {
      throw new ConflictException('Une invitation est déjà en attente pour cet email.');
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await this.prisma.invitation.create({
      data: {
        invitedByDoctorId: doctorId,
        email,
        role: 'nurse' as Role,
        token,
        message,
        invitedById: invitedByUserId,
        expiresAt,
      },
    });

    const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');
    const registerUrl = `${frontendUrl}/register/invitation?token=${token}`;
    const doctorName = `Dr. ${doctor.user?.firstName ?? ''} ${doctor.user?.lastName ?? ''}`.trim();

    await this.sendDoctorInvitationEmail(email, doctorName, registerUrl, message);

    return invitation;
  }

  /**
   * List invitations sent by a specific doctor.
   */
  async getDoctorInvitations(doctorId: string) {
    return this.prisma.invitation.findMany({
      where: { invitedByDoctorId: doctorId },
      orderBy: { createdAt: 'desc' },
      include: {
        invitedBy: { select: { firstName: true, lastName: true } },
      },
    });
  }

  /**
   * Cancel a pending doctor invitation.
   */
  async cancelDoctorInvitation(id: string, doctorId: string) {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id, invitedByDoctorId: doctorId, status: 'pending' },
    });
    if (!invitation) throw new NotFoundException('Invitation non trouvée');

    return this.prisma.invitation.update({
      where: { id },
      data: { status: 'expired' },
    });
  }

  /**
   * List invitations for an institution.
   */
  async getInvitations(institutionId: string) {
    return this.prisma.invitation.findMany({
      where: { institutionId },
      orderBy: { createdAt: 'desc' },
      include: {
        invitedBy: {
          select: { firstName: true, lastName: true },
        },
      },
    });
  }

  /**
   * Validate an invitation token and return its details.
   */
  async validateToken(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: {
        institution: { select: { id: true, name: true, type: true } },
        invitedByDoctor: {
          select: {
            id: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!invitation) {
      throw new NotFoundException('Invitation non trouvée ou invalide');
    }

    if (invitation.status !== 'pending') {
      throw new ConflictException('Cette invitation a déjà été utilisée');
    }

    if (invitation.expiresAt < new Date()) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'expired' },
      });
      throw new ConflictException('Cette invitation a expiré');
    }

    return invitation;
  }

  /**
   * Accept an invitation (called after user registration).
   */
  async acceptInvitation(token: string, userId: string) {
    const invitation = await this.validateToken(token);

    // Mark invitation as accepted
    await this.prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: 'accepted' },
    });

    // Create doctor/nurse profile if it doesn't exist for this user
    const invitedRole = invitation.role as string;
    const institutionId = invitation.institutionId;

    if (invitedRole === 'doctor' && institutionId) {
      const existing = await this.prisma.doctor.findUnique({ where: { userId } });
      if (!existing) {
        const doctor = await this.prisma.doctor.create({
          data: { userId, institutionId, specialty: 'Médecine Générale', licenseNumber: `CM-DOC-${Date.now()}` },
        });
        // Also create DoctorInstitution entry
        await this.prisma.doctorInstitution.upsert({
          where: { doctorId_institutionId: { doctorId: doctor.id, institutionId } },
          create: { doctorId: doctor.id, institutionId, isPrimary: true, role: 'doctor', isActive: true },
          update: {},
        });
      } else {
        // Doctor profile exists — add to this institution
        if (existing.institutionId !== institutionId) {
          await this.prisma.doctorInstitution.upsert({
            where: { doctorId_institutionId: { doctorId: existing.id, institutionId } },
            create: { doctorId: existing.id, institutionId, isPrimary: false, role: 'doctor', isActive: true },
            update: { isActive: true },
          });
        }
      }
    } else if (invitedRole === 'nurse') {
      const existing = await this.prisma.nurse.findUnique({ where: { userId } });
      if (!existing) {
        await this.prisma.nurse.create({
          data: {
            userId,
            ...(institutionId ? { institutionId } : {}),
            specialty: 'Soins généraux',
            licenseNumber: `INF-${Date.now()}`,
          },
        });
      } else if (institutionId && !existing.institutionId) {
        // If invited by institution and nurse has no institution yet, attach her
        await this.prisma.nurse.update({
          where: { id: existing.id },
          data: { institutionId },
        });
      }
    }

    // Add new role to user's availableRoles
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      const roles = new Set(user.availableRoles?.length > 0 ? user.availableRoles : [user.role]);
      roles.add(invitedRole as any);
      await this.prisma.user.update({
        where: { id: userId },
        data: { availableRoles: [...roles] },
      });
    }

    return invitation;
  }

  /**
   * Cancel a pending invitation.
   */
  async cancelInvitation(id: string, institutionId: string) {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id, institutionId, status: 'pending' },
    });
    if (!invitation) {
      throw new NotFoundException('Invitation non trouvée');
    }

    return this.prisma.invitation.update({
      where: { id },
      data: { status: 'expired' },
    });
  }

  private async sendInvitationEmail(
    to: string,
    institutionName: string,
    roleLabel: string,
    registerUrl: string,
    message?: string,
  ) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0066CC;">CARYPASS — Invitation</h2>
        <p>Bonjour,</p>
        <p>Vous avez été invité(e) à rejoindre <strong>${institutionName}</strong> en tant que <strong>${roleLabel}</strong> sur la plateforme CARYPASS.</p>
        ${message ? `<p style="background: #f8f9fa; padding: 12px; border-radius: 8px; border-left: 4px solid #007bff;">"${message}"</p>` : ''}
        <p>Cliquez sur le bouton ci-dessous pour créer votre compte et rejoindre l'institution :</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${registerUrl}" style="background-color: #0066CC; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
            Créer mon compte
          </a>
        </div>
        <p style="color: #6c757d; font-size: 13px;">Ce lien est valable <strong>7 jours</strong>. Après expiration, demandez à l'administrateur de vous renvoyer une invitation.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #888; font-size: 12px;">CARYPASS — Plateforme de santé numérique</p>
      </div>
    `;

    await this.emailService.sendCustomEmail(to, `Invitation à rejoindre ${institutionName} — CARYPASS`, html);
  }

  private async sendDoctorInvitationEmail(
    to: string,
    doctorName: string,
    registerUrl: string,
    message?: string,
  ) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0066CC;">CARYPASS — Invitation</h2>
        <p>Bonjour,</p>
        <p><strong>${doctorName}</strong> vous invite à rejoindre la plateforme CARYPASS en tant qu'<strong>infirmier(e)</strong>.</p>
        ${message ? `<p style="background: #f8f9fa; padding: 12px; border-radius: 8px; border-left: 4px solid #007bff;">"${message}"</p>` : ''}
        <p>Créez votre compte gratuitement en cliquant ci-dessous :</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${registerUrl}" style="background-color: #0066CC; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
            Créer mon compte gratuit
          </a>
        </div>
        <p style="background:#eaf6ff;padding:10px;border-radius:8px;color:#0066CC;font-size:13px;"><strong>Aucun frais d'inscription</strong> — votre compte est entièrement pris en charge.</p>
        <p style="color: #6c757d; font-size: 13px;">Ce lien est valable <strong>7 jours</strong>.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <p style="color: #888; font-size: 12px;">CARYPASS — Plateforme de santé numérique</p>
      </div>
    `;

    await this.emailService.sendCustomEmail(to, `${doctorName} vous invite sur CARYPASS`, html);
  }
}
