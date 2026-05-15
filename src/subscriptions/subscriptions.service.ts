import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  Optional,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaClient, Prisma } from '@prisma/client';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

const PLANS_CACHE_KEY = 'subscriptions:plans:active';
const PLANS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// TODO: Integrer Pawapay pour le traitement des paiements

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaClient,
    @Optional() @Inject(CACHE_MANAGER) private readonly cache?: Cache,
  ) {}

  /**
   * Invalidate the cached active-plans list. Called after any mutation
   * that could affect the public plan catalog.
   */
  private async invalidatePlansCache(): Promise<void> {
    try {
      await this.cache?.del(PLANS_CACHE_KEY);
    } catch (err: any) {
      this.logger.warn(`Plans cache invalidation failed: ${err?.message || err}`);
    }
  }

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
   * Liste de tous les plans actifs. Mise en cache 1 heure (Redis si
   * disponible, sinon cache memoire). Invalidee par create/update plan.
   */
  async findAllPlans() {
    if (this.cache) {
      try {
        const cached = await this.cache.get<any[]>(PLANS_CACHE_KEY);
        if (cached) {
          return { success: true, data: cached, cached: true };
        }
      } catch (err: any) {
        this.logger.warn(`Plans cache read failed: ${err?.message || err}`);
      }
    }

    const data = await this.prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { priceMonthly: 'asc' },
    });

    if (this.cache) {
      try {
        await this.cache.set(PLANS_CACHE_KEY, data, PLANS_CACHE_TTL_MS);
      } catch (err: any) {
        this.logger.warn(`Plans cache write failed: ${err?.message || err}`);
      }
    }

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

    await this.invalidatePlansCache();

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

    await this.invalidatePlansCache();

    return { success: true, data: updated };
  }

  // ===================== SUBSCRIPTION EXPIRY =====================

  /**
   * Check and expire subscriptions past their endDate.
   * Called daily via a controller endpoint or interval.
   *
   * Also self-heals: any row marked 'expired' whose endDate is still in
   * the future is restored to 'active' — this corrects rows that were
   * prematurely stamped by an older buggy version of the renewal cron.
   */
  async expireSubscriptions() {
    const now = new Date();

    const expired = await this.prisma.subscription.updateMany({
      where: {
        status: 'active',
        endDate: { lt: now },
      },
      data: { status: 'expired' },
    });

    if (expired.count > 0) {
      this.logger.log(`${expired.count} abonnement(s) expirés automatiquement`);
    }

    // Bulk-heal wrongly-expired rows (status=expired but endDate still in
    // the future). This was caused by a prior version of the wallet
    // renewal cron flipping subs at endDate-1day instead of endDate.
    const healed = await this.prisma.subscription.updateMany({
      where: {
        status: 'expired',
        endDate: { gte: now },
      },
      data: { status: 'active' },
    });

    if (healed.count > 0) {
      this.logger.warn(
        `${healed.count} abonnement(s) restaurés (étaient 'expired' mais endDate encore dans le futur)`,
      );
    }

    return { expired: expired.count, healed: healed.count };
  }

  /**
   * Check subscription status for a specific user.
   *
   * Priority: if the user has ANY truly-active subscription (status active
   * AND endDate >= now), we return that one — even if an older expired row
   * exists on the same account. This avoids false-positive "expired" gates
   * when a sub got incorrectly stamped expired in DB (e.g. by a buggy
   * renewal cron) while a valid one still exists.
   *
   * Fallback: if no active row exists, return the most recently created
   * one (could be a recently expired sub the user needs to renew, or none).
   */
  async checkUserSubscriptionStatus(userId: string) {
    const now = new Date();

    // 1. Prefer any genuinely active subscription
    const activeSub = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: 'active',
        endDate: { gte: now },
      },
      orderBy: { endDate: 'desc' },
      include: { plan: true },
    });

    if (activeSub) {
      return {
        hasSubscription: true,
        isExpired: false,
        isActive: true,
        subscription: {
          id: activeSub.id,
          status: activeSub.status,
          startDate: activeSub.startDate,
          endDate: activeSub.endDate,
          plan: activeSub.plan,
        },
      };
    }

    // 2. No active sub. Look for a row whose endDate is still in the future
    //    but whose status got wrongly stamped 'expired'. Self-heal it.
    const wronglyExpired = await this.prisma.subscription.findFirst({
      where: {
        userId,
        status: 'expired',
        endDate: { gte: now },
      },
      orderBy: { endDate: 'desc' },
      include: { plan: true },
    });

    if (wronglyExpired) {
      const healed = await this.prisma.subscription.update({
        where: { id: wronglyExpired.id },
        data: { status: 'active' },
        include: { plan: true },
      });
      this.logger.warn(
        `Self-healed subscription ${healed.id} for user ${userId}: was 'expired' but endDate ${healed.endDate.toISOString()} is still in the future`,
      );
      return {
        hasSubscription: true,
        isExpired: false,
        isActive: true,
        subscription: {
          id: healed.id,
          status: healed.status,
          startDate: healed.startDate,
          endDate: healed.endDate,
          plan: healed.plan,
        },
      };
    }

    // 3. Fallback to the most recent subscription (could be expired or none)
    const latest = await this.prisma.subscription.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { plan: true },
    });

    if (!latest) {
      return {
        hasSubscription: false,
        isExpired: false,
        isActive: false,
        subscription: null,
      };
    }

    // Auto-expire if still marked active but past endDate (defensive)
    if (latest.status === 'active' && new Date(latest.endDate) < now) {
      await this.prisma.subscription.update({
        where: { id: latest.id },
        data: { status: 'expired' },
      });
    }

    return {
      hasSubscription: true,
      isExpired: true,
      isActive: false,
      subscription: {
        id: latest.id,
        status: latest.status,
        startDate: latest.startDate,
        endDate: latest.endDate,
        plan: latest.plan,
      },
    };
  }
}
