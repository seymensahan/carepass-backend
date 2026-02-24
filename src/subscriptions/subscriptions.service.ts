import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

// TODO: Integrer Pawapay pour le traitement des paiements

@Injectable()
export class SubscriptionsService {
  constructor(private readonly prisma: PrismaClient) {}

  // ===================== SUBSCRIPTIONS =====================

  /**
   * Liste paginee des abonnements.
   * super_admin voit tous les abonnements, les autres voient les leurs.
   */
  async findAll(user: any, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const where: Prisma.SubscriptionWhereInput = {};

    if (user.role !== 'super_admin') {
      where.userId = user.id;
    }

    const [data, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startDate: 'desc' },
        include: {
          plan: true,
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
          },
        },
      }),
      this.prisma.subscription.count({ where }),
    ]);

    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Obtenir un abonnement par ID.
   */
  async findOne(id: string) {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        plan: true,
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarUrl: true },
        },
      },
    });

    if (!subscription) {
      throw new NotFoundException('Abonnement non trouve');
    }

    return { success: true, data: subscription };
  }

  /**
   * Creer un abonnement.
   * Calcule endDate = startDate + 1 mois.
   */
  async create(userId: string, dto: CreateSubscriptionDto) {
    // Verifier que le plan existe et est actif
    const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan) {
      throw new NotFoundException('Plan non trouve');
    }
    if (!plan.isActive) {
      throw new BadRequestException('Ce plan n\'est plus disponible');
    }

    // Verifier que l'utilisateur n'a pas deja un abonnement actif
    const existingActive = await this.prisma.subscription.findFirst({
      where: { userId, status: 'active' },
    });
    if (existingActive) {
      throw new BadRequestException('L\'utilisateur a deja un abonnement actif');
    }

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    const subscription = await this.prisma.subscription.create({
      data: {
        userId,
        planId: dto.planId,
        status: 'active',
        startDate,
        endDate,
        autoRenew: dto.autoRenew !== undefined ? dto.autoRenew : true,
      },
      include: {
        plan: true,
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
        },
      },
    });

    return { success: true, data: subscription };
  }

  /**
   * Mettre a jour un abonnement (autoRenew).
   */
  async update(id: string, dto: UpdateSubscriptionDto) {
    const subscription = await this.prisma.subscription.findUnique({ where: { id } });

    if (!subscription) {
      throw new NotFoundException('Abonnement non trouve');
    }

    const updated = await this.prisma.subscription.update({
      where: { id },
      data: {
        ...(dto.autoRenew !== undefined && { autoRenew: dto.autoRenew }),
      },
      include: {
        plan: true,
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
        },
      },
    });

    return { success: true, data: updated };
  }

  /**
   * Annuler un abonnement (status = cancelled).
   */
  async cancel(id: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { id } });

    if (!subscription) {
      throw new NotFoundException('Abonnement non trouve');
    }

    if (subscription.status === 'cancelled') {
      throw new BadRequestException('Cet abonnement est deja annule');
    }

    const updated = await this.prisma.subscription.update({
      where: { id },
      data: { status: 'cancelled' },
      include: {
        plan: true,
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true },
        },
      },
    });

    return { success: true, data: updated, message: 'Abonnement annule avec succes' };
  }

  // ===================== PLANS =====================

  /**
   * Liste de tous les plans actifs.
   */
  async findAllPlans() {
    const data = await this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: 'asc' },
    });

    return { success: true, data };
  }

  /**
   * Obtenir un plan par ID.
   */
  async findOnePlan(id: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: {
        _count: {
          select: { subscriptions: true },
        },
      },
    });

    if (!plan) {
      throw new NotFoundException('Plan non trouve');
    }

    return { success: true, data: plan };
  }

  /**
   * Creer un plan. Reserve au super_admin.
   */
  async createPlan(dto: CreatePlanDto) {
    // Verifier l'unicite du slug
    const existing = await this.prisma.plan.findUnique({ where: { slug: dto.slug } });
    if (existing) {
      throw new BadRequestException('Un plan avec ce slug existe deja');
    }

    const plan = await this.prisma.plan.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description,
        priceMonthly: dto.priceMonthly,
        priceYearly: dto.priceYearly,
        features: dto.features ? (dto.features as any) : undefined,
        maxPatients: dto.maxPatients,
        maxDoctors: dto.maxDoctors,
      },
    });

    return { success: true, data: plan };
  }

  /**
   * Mettre a jour un plan. Reserve au super_admin.
   */
  async updatePlan(id: string, dto: UpdatePlanDto) {
    const plan = await this.prisma.plan.findUnique({ where: { id } });

    if (!plan) {
      throw new NotFoundException('Plan non trouve');
    }

    // Verifier l'unicite du slug si modifie
    if (dto.slug && dto.slug !== plan.slug) {
      const existing = await this.prisma.plan.findUnique({ where: { slug: dto.slug } });
      if (existing) {
        throw new BadRequestException('Un plan avec ce slug existe deja');
      }
    }

    const updated = await this.prisma.plan.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.priceMonthly !== undefined && { priceMonthly: dto.priceMonthly }),
        ...(dto.priceYearly !== undefined && { priceYearly: dto.priceYearly }),
        ...(dto.features !== undefined && { features: dto.features as any }),
        ...(dto.maxPatients !== undefined && { maxPatients: dto.maxPatients }),
        ...(dto.maxDoctors !== undefined && { maxDoctors: dto.maxDoctors }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    return { success: true, data: updated };
  }
}
