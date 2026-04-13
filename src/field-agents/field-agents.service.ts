import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class FieldAgentsService {
  private readonly logger = new Logger(FieldAgentsService.name);

  constructor(private readonly prisma: PrismaClient) {}

  // =========================================================================
  // AGENT PROFILE
  // =========================================================================

  async getAgentProfile(userId: string) {
    const agent = await this.prisma.fieldAgent.findUnique({
      where: { userId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarUrl: true } } },
    });
    if (!agent) throw new NotFoundException('Profil agent non trouvé');
    return agent;
  }

  private async getAgentId(userId: string): Promise<string> {
    const agent = await this.prisma.fieldAgent.findUnique({ where: { userId } });
    if (!agent) throw new NotFoundException('Profil agent non trouvé');
    return agent.id;
  }

  // =========================================================================
  // STATS
  // =========================================================================

  async getStats(userId: string) {
    const agentId = await this.getAgentId(userId);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalVisits,
      monthlyVisits,
      completedVisits,
      totalOnboardings,
      monthlyOnboardings,
      completedOnboardings,
      pendingFollowUps,
    ] = await Promise.all([
      this.prisma.fieldVisit.count({ where: { agentId } }),
      this.prisma.fieldVisit.count({ where: { agentId, createdAt: { gte: startOfMonth } } }),
      this.prisma.fieldVisit.count({ where: { agentId, status: 'completed' } }),
      this.prisma.userOnboarding.count({ where: { agentId } }),
      this.prisma.userOnboarding.count({ where: { agentId, createdAt: { gte: startOfMonth } } }),
      this.prisma.userOnboarding.count({ where: { agentId, status: 'completed' } }),
      this.prisma.fieldVisit.count({ where: { agentId, outcome: 'follow_up', status: { not: 'completed' } } }),
    ]);

    const conversionRate = totalVisits > 0
      ? Math.round((completedOnboardings / totalVisits) * 100)
      : 0;

    // Daily activity for last 14 days
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const [recentVisits, recentOnboardings] = await Promise.all([
      this.prisma.fieldVisit.findMany({
        where: { agentId, createdAt: { gte: fourteenDaysAgo } },
        select: { createdAt: true },
      }),
      this.prisma.userOnboarding.findMany({
        where: { agentId, createdAt: { gte: fourteenDaysAgo } },
        select: { createdAt: true },
      }),
    ]);

    const dailyActivity: { date: string; visits: number; onboardings: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      dailyActivity.push({
        date: dateStr,
        visits: recentVisits.filter((v) => v.createdAt.toISOString().slice(0, 10) === dateStr).length,
        onboardings: recentOnboardings.filter((o) => o.createdAt.toISOString().slice(0, 10) === dateStr).length,
      });
    }

    return {
      totalVisits,
      monthlyVisits,
      completedVisits,
      totalOnboardings,
      monthlyOnboardings,
      completedOnboardings,
      conversionRate,
      pendingFollowUps,
      dailyActivity,
    };
  }

  // =========================================================================
  // PERFORMANCE + RANKING
  // =========================================================================

  async getPerformance(userId: string) {
    const agentId = await this.getAgentId(userId);

    // Get all agents for ranking
    const allAgents = await this.prisma.fieldAgent.findMany({
      where: { isActive: true },
      include: {
        user: { select: { firstName: true, lastName: true } },
        _count: { select: { onboardings: true, fieldVisits: true } },
      },
    });

    const ranked = allAgents
      .map((a) => ({
        id: a.id,
        name: `${a.user.firstName} ${a.user.lastName}`,
        onboardings: a._count.onboardings,
        visits: a._count.fieldVisits,
        conversionRate: a._count.fieldVisits > 0
          ? Math.round((a._count.onboardings / a._count.fieldVisits) * 100)
          : 0,
      }))
      .sort((a, b) => b.onboardings - a.onboardings);

    const myRank = ranked.findIndex((a) => a.id === agentId) + 1;
    const myStats = ranked.find((a) => a.id === agentId);

    return {
      rank: myRank,
      totalAgents: ranked.length,
      myStats,
      topAgents: ranked.slice(0, 10),
    };
  }

  // =========================================================================
  // FIELD VISITS — CRUD
  // =========================================================================

  async getVisits(userId: string, filters: {
    status?: string;
    outcome?: string;
    page?: number;
    limit?: number;
  }) {
    const agentId = await this.getAgentId(userId);
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const where: any = { agentId };
    if (filters.status) where.status = filters.status;
    if (filters.outcome) where.outcome = filters.outcome;

    const [visits, total] = await Promise.all([
      this.prisma.fieldVisit.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          onboardings: {
            select: { id: true, userName: true, userRole: true, status: true },
          },
        },
      }),
      this.prisma.fieldVisit.count({ where }),
    ]);

    return {
      data: visits,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async createVisit(userId: string, dto: {
    targetName: string;
    targetPhone?: string;
    targetRole: string;
    location?: string;
    city?: string;
    notes?: string;
    scheduledAt?: string;
  }) {
    const agentId = await this.getAgentId(userId);

    const visit = await this.prisma.fieldVisit.create({
      data: {
        agentId,
        targetName: dto.targetName,
        targetPhone: dto.targetPhone,
        targetRole: dto.targetRole,
        location: dto.location,
        city: dto.city,
        notes: dto.notes,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
      },
    });

    this.logger.log(`Visite créée: ${visit.id} par agent ${agentId}`);
    return visit;
  }

  async updateVisit(userId: string, visitId: string, dto: {
    status?: string;
    outcome?: string;
    notes?: string;
    checkInLat?: number;
    checkInLng?: number;
    checkOutLat?: number;
    checkOutLng?: number;
  }) {
    const agentId = await this.getAgentId(userId);

    const visit = await this.prisma.fieldVisit.findFirst({
      where: { id: visitId, agentId },
    });
    if (!visit) throw new NotFoundException('Visite non trouvée');

    const data: any = {};
    if (dto.status) data.status = dto.status;
    if (dto.outcome) data.outcome = dto.outcome;
    if (dto.notes !== undefined) data.notes = dto.notes;

    // GPS check-in
    if (dto.checkInLat !== undefined && dto.checkInLng !== undefined) {
      data.checkInLat = dto.checkInLat;
      data.checkInLng = dto.checkInLng;
      data.checkInAt = new Date();
    }

    // GPS check-out
    if (dto.checkOutLat !== undefined && dto.checkOutLng !== undefined) {
      data.checkOutLat = dto.checkOutLat;
      data.checkOutLng = dto.checkOutLng;
      data.checkOutAt = new Date();
    }

    return this.prisma.fieldVisit.update({
      where: { id: visitId },
      data,
    });
  }

  // =========================================================================
  // ONBOARDINGS — CRUD
  // =========================================================================

  async getOnboardings(userId: string, filters: {
    status?: string;
    userRole?: string;
    page?: number;
    limit?: number;
  }) {
    const agentId = await this.getAgentId(userId);
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const where: any = { agentId };
    if (filters.status) where.status = filters.status;
    if (filters.userRole) where.userRole = filters.userRole;

    const [onboardings, total] = await Promise.all([
      this.prisma.userOnboarding.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          vouchers: { select: { id: true, code: true, type: true, isUsed: true } },
          fieldVisit: { select: { id: true, targetName: true, status: true } },
        },
      }),
      this.prisma.userOnboarding.count({ where }),
    ]);

    return {
      data: onboardings,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async createOnboarding(userId: string, dto: {
    userName: string;
    userPhone: string;
    userEmail?: string;
    userRole: string;
    doctorSpecialty?: string;
    city?: string;
    zone?: string;
    fieldVisitId?: string;
  }) {
    const agentId = await this.getAgentId(userId);

    if (dto.userRole === 'doctor' && !dto.doctorSpecialty) {
      throw new BadRequestException('La spécialité est requise pour un médecin');
    }

    const onboarding = await this.prisma.userOnboarding.create({
      data: {
        agentId,
        userName: dto.userName,
        userPhone: dto.userPhone,
        userEmail: dto.userEmail,
        userRole: dto.userRole,
        doctorSpecialty: dto.doctorSpecialty as any,
        city: dto.city,
        zone: dto.zone,
        fieldVisitId: dto.fieldVisitId,
        status: 'in_progress',
      },
    });

    // If linked to a visit, update the visit outcome
    if (dto.fieldVisitId) {
      await this.prisma.fieldVisit.update({
        where: { id: dto.fieldVisitId },
        data: { outcome: 'onboarded', status: 'in_progress' },
      }).catch(() => {}); // Ignore if visit not found
    }

    this.logger.log(`Onboarding créé: ${onboarding.id} — ${dto.userRole} par agent ${agentId}`);
    return onboarding;
  }

  async updateOnboarding(userId: string, onboardingId: string, dto: {
    status?: string;
    appDownloaded?: boolean;
    accountCreated?: boolean;
    voucherRedeemed?: boolean;
    rejectionReason?: string;
  }) {
    const agentId = await this.getAgentId(userId);

    const onboarding = await this.prisma.userOnboarding.findFirst({
      where: { id: onboardingId, agentId },
    });
    if (!onboarding) throw new NotFoundException('Onboarding non trouvé');

    const data: any = {};
    if (dto.status) data.status = dto.status;
    if (dto.appDownloaded !== undefined) data.appDownloaded = dto.appDownloaded;
    if (dto.accountCreated !== undefined) data.accountCreated = dto.accountCreated;
    if (dto.voucherRedeemed !== undefined) data.voucherRedeemed = dto.voucherRedeemed;
    if (dto.rejectionReason !== undefined) data.rejectionReason = dto.rejectionReason;

    // Auto-complete if all steps done
    if (
      (dto.appDownloaded || onboarding.appDownloaded) &&
      (dto.accountCreated || onboarding.accountCreated) &&
      (dto.voucherRedeemed || onboarding.voucherRedeemed)
    ) {
      data.status = 'completed';
      data.completedAt = new Date();
    }

    if (dto.status === 'rejected') {
      data.rejectionReason = dto.rejectionReason || onboarding.rejectionReason;
    }

    return this.prisma.userOnboarding.update({
      where: { id: onboardingId },
      data,
    });
  }

  // =========================================================================
  // ASSIGN VOUCHER — from shared pool
  // =========================================================================

  async assignVoucher(userId: string, onboardingId: string) {
    const agentId = await this.getAgentId(userId);

    const onboarding = await this.prisma.userOnboarding.findFirst({
      where: { id: onboardingId, agentId },
      include: { vouchers: true },
    });
    if (!onboarding) throw new NotFoundException('Onboarding non trouvé');

    if (onboarding.vouchers.length > 0) {
      throw new BadRequestException('Un voucher a déjà été assigné à cet onboarding');
    }

    // Transaction to prevent race conditions between concurrent agents
    const updated = await this.prisma.$transaction(async (tx) => {
      // Pick the next available voucher from the shared pool (inside transaction)
      let voucher = await tx.voucher.findFirst({
        where: {
          type: onboarding.userRole,
          isUsed: false,
          assignedByAgentId: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'asc' },
      });

      // Also try vouchers without expiresAt
      if (!voucher) {
        voucher = await tx.voucher.findFirst({
          where: {
            type: onboarding.userRole,
            isUsed: false,
            assignedByAgentId: null,
            expiresAt: null,
          },
          orderBy: { createdAt: 'asc' },
        });
      }

      if (!voucher) {
        throw new BadRequestException(
          `Aucun voucher disponible pour le type "${onboarding.userRole}". Demandez au super admin d'en générer.`,
        );
      }

      // Assign atomically
      return tx.voucher.update({
        where: { id: voucher.id },
        data: {
          assignedByAgentId: userId,
          onboardingId,
        },
      });
    });

    this.logger.log(
      `Voucher ${updated.code} assigné à onboarding ${onboardingId} par agent ${agentId}`,
    );

    return {
      voucherCode: updated.code,
      voucherType: updated.type,
      durationMonths: updated.durationMonths,
      discountPercent: updated.discountPercent,
    };
  }

  // =========================================================================
  // SUPER ADMIN — Coverage zones (for map)
  // =========================================================================

  /**
   * Returns aggregated coverage data by city for map visualization.
   * Each zone contains the city name, agent count, onboarding count, and approximate coordinates.
   */
  async getCoverageZones() {
    // Coordinates for Cameroon cities + Douala neighborhoods (launch focus)
    const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
      // Douala neighborhoods (launch focus)
      'douala': { lat: 4.0511, lng: 9.7679 },
      'akwa': { lat: 4.0480, lng: 9.7030 },
      'bonanjo': { lat: 4.0477, lng: 9.6943 },
      'bonapriso': { lat: 4.0345, lng: 9.7048 },
      'bonamoussadi': { lat: 4.0838, lng: 9.7530 },
      'bonaberi': { lat: 4.0792, lng: 9.6878 },
      'bonabéri': { lat: 4.0792, lng: 9.6878 },
      'deido': { lat: 4.0683, lng: 9.7161 },
      'bassa': { lat: 4.0325, lng: 9.7517 },
      'new bell': { lat: 4.0486, lng: 9.7244 },
      'new-bell': { lat: 4.0486, lng: 9.7244 },
      'makepe': { lat: 4.0800, lng: 9.7500 },
      'maképé': { lat: 4.0800, lng: 9.7500 },
      'kotto': { lat: 4.0878, lng: 9.7353 },
      'logpom': { lat: 4.0750, lng: 9.7700 },
      'logbessou': { lat: 4.0950, lng: 9.7100 },
      'ndogbong': { lat: 4.0611, lng: 9.7417 },
      'ndogbassi': { lat: 4.0408, lng: 9.7414 },
      'nyalla': { lat: 4.0239, lng: 9.7800 },
      'pk8': { lat: 4.1017, lng: 9.7847 },
      'pk10': { lat: 4.1180, lng: 9.7900 },
      'pk12': { lat: 4.1320, lng: 9.7970 },
      'pk14': { lat: 4.1450, lng: 9.8050 },
      'pk17': { lat: 4.1650, lng: 9.8200 },
      'yassa': { lat: 4.0100, lng: 9.8100 },
      'japoma': { lat: 4.0000, lng: 9.8200 },
      'nkoulouloun': { lat: 4.0567, lng: 9.6997 },
      'village': { lat: 4.0683, lng: 9.7900 },
      // Other Cameroon cities
      'yaounde': { lat: 3.848, lng: 11.5021 },
      'yaoundé': { lat: 3.848, lng: 11.5021 },
      'bafoussam': { lat: 5.4737, lng: 10.4178 },
      'bamenda': { lat: 5.9631, lng: 10.1591 },
      'garoua': { lat: 9.3018, lng: 13.3921 },
      'maroua': { lat: 10.5918, lng: 14.3158 },
      'ngaoundere': { lat: 7.3167, lng: 13.5833 },
      'bertoua': { lat: 4.5833, lng: 13.6833 },
      'edea': { lat: 3.8, lng: 10.1333 },
      'kribi': { lat: 2.9406, lng: 9.9098 },
      'limbe': { lat: 4.0239, lng: 9.1928 },
      'buea': { lat: 4.1553, lng: 9.2925 },
      'dschang': { lat: 5.4439, lng: 10.0581 },
    };

    // Aggregate onboardings by city
    const onboardings = await this.prisma.userOnboarding.groupBy({
      by: ['city'],
      _count: true,
      where: { city: { not: null } },
    });

    // Aggregate visits by city
    const visits = await this.prisma.fieldVisit.groupBy({
      by: ['city'],
      _count: true,
      where: { city: { not: null } },
    });

    // Count unique agents per city (via their visits)
    const agentsByCity = await this.prisma.fieldVisit.findMany({
      where: { city: { not: null } },
      select: { city: true, agentId: true },
      distinct: ['city', 'agentId'],
    });

    const agentCountByCity: Record<string, number> = {};
    for (const row of agentsByCity) {
      if (!row.city) continue;
      agentCountByCity[row.city] = (agentCountByCity[row.city] || 0) + 1;
    }

    // Merge all cities
    const citySet = new Set<string>();
    onboardings.forEach((o) => o.city && citySet.add(o.city));
    visits.forEach((v) => v.city && citySet.add(v.city));

    const zones = Array.from(citySet).map((city) => {
      const onb = onboardings.find((o) => o.city === city)?._count ?? 0;
      const vis = visits.find((v) => v.city === city)?._count ?? 0;
      const key = city.toLowerCase().trim();
      const coords = CITY_COORDS[key] ?? { lat: 5.5, lng: 12.5 }; // center of Cameroon fallback
      return {
        city,
        lat: coords.lat,
        lng: coords.lng,
        onboardings: onb,
        visits: vis,
        agents: agentCountByCity[city] ?? 0,
        hasKnownCoords: !!CITY_COORDS[key],
      };
    });

    return {
      zones,
      total: {
        cities: zones.length,
        onboardings: zones.reduce((a, z) => a + z.onboardings, 0),
        visits: zones.reduce((a, z) => a + z.visits, 0),
      },
    };
  }

  // =========================================================================
  // SUPER ADMIN — Platform metrics
  // =========================================================================

  async getPlatformMetrics() {
    const [
      totalAgents,
      activeAgents,
      totalVisits,
      completedVisits,
      totalOnboardings,
      completedOnboardings,
      patientOnboardings,
      doctorOnboardings,
      nurseOnboardings,
      // Doctor specialties
      dentisteCount,
      gynecologueCount,
      pediatreCount,
      generalisteCount,
      ophtalmologueCount,
      // Voucher stats
      totalVouchers,
      usedVouchers,
      assignedVouchers,
    ] = await Promise.all([
      this.prisma.fieldAgent.count(),
      this.prisma.fieldAgent.count({ where: { isActive: true } }),
      this.prisma.fieldVisit.count(),
      this.prisma.fieldVisit.count({ where: { status: 'completed' } }),
      this.prisma.userOnboarding.count(),
      this.prisma.userOnboarding.count({ where: { status: 'completed' } }),
      this.prisma.userOnboarding.count({ where: { userRole: 'patient', status: 'completed' } }),
      this.prisma.userOnboarding.count({ where: { userRole: 'doctor', status: 'completed' } }),
      this.prisma.userOnboarding.count({ where: { userRole: 'nurse', status: 'completed' } }),
      this.prisma.userOnboarding.count({ where: { userRole: 'doctor', doctorSpecialty: 'dentiste', status: 'completed' } }),
      this.prisma.userOnboarding.count({ where: { userRole: 'doctor', doctorSpecialty: 'gynecologue', status: 'completed' } }),
      this.prisma.userOnboarding.count({ where: { userRole: 'doctor', doctorSpecialty: 'pediatre', status: 'completed' } }),
      this.prisma.userOnboarding.count({ where: { userRole: 'doctor', doctorSpecialty: 'generaliste', status: 'completed' } }),
      this.prisma.userOnboarding.count({ where: { userRole: 'doctor', doctorSpecialty: 'ophtalmologue', status: 'completed' } }),
      this.prisma.voucher.count(),
      this.prisma.voucher.count({ where: { isUsed: true } }),
      this.prisma.voucher.count({ where: { assignedByAgentId: { not: null } } }),
    ]);

    const overallConversionRate = totalVisits > 0
      ? Math.round((completedOnboardings / totalVisits) * 100)
      : 0;

    // Agent performances
    const agents = await this.prisma.fieldAgent.findMany({
      where: { isActive: true },
      include: {
        user: { select: { firstName: true, lastName: true, email: true, phone: true } },
        _count: { select: { onboardings: true, fieldVisits: true } },
      },
    });

    const agentPerformances = agents
      .map((a) => ({
        id: a.id,
        userId: a.userId,
        name: `${a.user.firstName} ${a.user.lastName}`,
        email: a.user.email,
        phone: a.user.phone,
        zone: a.zone,
        city: a.city,
        totalVisits: a._count.fieldVisits,
        totalOnboardings: a._count.onboardings,
        conversionRate: a._count.fieldVisits > 0
          ? Math.round((a._count.onboardings / a._count.fieldVisits) * 100)
          : 0,
      }))
      .sort((a, b) => b.totalOnboardings - a.totalOnboardings);

    return {
      agents: { total: totalAgents, active: activeAgents },
      visits: { total: totalVisits, completed: completedVisits },
      onboardings: {
        total: totalOnboardings,
        completed: completedOnboardings,
        byRole: {
          patient: { completed: patientOnboardings, target: 1000 },
          doctor: {
            completed: doctorOnboardings,
            target: 100,
            bySpecialty: {
              dentiste: { completed: dentisteCount, target: 20 },
              gynecologue: { completed: gynecologueCount, target: 20 },
              pediatre: { completed: pediatreCount, target: 20 },
              generaliste: { completed: generalisteCount, target: 20 },
              ophtalmologue: { completed: ophtalmologueCount, target: 20 },
            },
          },
          nurse: { completed: nurseOnboardings, target: 100 },
        },
        globalTarget: 1200,
        globalCompleted: patientOnboardings + doctorOnboardings + nurseOnboardings,
      },
      vouchers: { total: totalVouchers, used: usedVouchers, assigned: assignedVouchers, available: totalVouchers - assignedVouchers },
      conversionRate: overallConversionRate,
      agentPerformances,
    };
  }

  // =========================================================================
  // SUPER ADMIN — List agents with stats
  // =========================================================================

  async listAgents(filters: { page?: number; limit?: number; isActive?: string }) {
    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 ? Math.min(filters.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.isActive !== undefined && filters.isActive !== '') {
      where.isActive = filters.isActive === 'true';
    }

    const [agents, total] = await Promise.all([
      this.prisma.fieldAgent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarUrl: true, createdAt: true } },
          _count: { select: { fieldVisits: true, onboardings: true } },
        },
      }),
      this.prisma.fieldAgent.count({ where }),
    ]);

    return {
      data: agents,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // =========================================================================
  // SUPER ADMIN — Get single agent details
  // =========================================================================

  async getAgentDetails(agentId: string) {
    const agent = await this.prisma.fieldAgent.findUnique({
      where: { id: agentId },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, avatarUrl: true } },
        _count: { select: { fieldVisits: true, onboardings: true } },
      },
    });
    if (!agent) throw new NotFoundException('Agent non trouvé');

    // Get recent onboardings
    const recentOnboardings = await this.prisma.userOnboarding.findMany({
      where: { agentId },
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        vouchers: { select: { code: true, isUsed: true } },
      },
    });

    // Get onboarding breakdown
    const [patients, doctors, nurses] = await Promise.all([
      this.prisma.userOnboarding.count({ where: { agentId, userRole: 'patient', status: 'completed' } }),
      this.prisma.userOnboarding.count({ where: { agentId, userRole: 'doctor', status: 'completed' } }),
      this.prisma.userOnboarding.count({ where: { agentId, userRole: 'nurse', status: 'completed' } }),
    ]);

    return {
      ...agent,
      recentOnboardings,
      breakdown: { patients, doctors, nurses },
    };
  }

  // =========================================================================
  // SUPER ADMIN — Create agent
  // =========================================================================

  async createAgent(adminUserId: string, dto: {
    firstName: string;
    lastName: string;
    email: string;
    phone?: string;
    password: string;
    zone?: string;
    city?: string;
  }) {
    // Check email uniqueness
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('Un utilisateur avec cet email existe déjà');

    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash(dto.password, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash: hash,
          role: 'field_agent',
          firstName: dto.firstName,
          lastName: dto.lastName,
          phone: dto.phone,
        },
      });

      const agent = await tx.fieldAgent.create({
        data: {
          userId: user.id,
          zone: dto.zone,
          city: dto.city,
        },
      });

      return { user, agent };
    });

    this.logger.log(`Agent créé: ${result.user.email} (${result.agent.id})`);

    return {
      id: result.agent.id,
      userId: result.user.id,
      email: result.user.email,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      zone: result.agent.zone,
      city: result.agent.city,
    };
  }

  // =========================================================================
  // SUPER ADMIN — Toggle agent status
  // =========================================================================

  async toggleAgentStatus(agentId: string) {
    const agent = await this.prisma.fieldAgent.findUnique({ where: { id: agentId } });
    if (!agent) throw new NotFoundException('Agent non trouvé');

    const updated = await this.prisma.fieldAgent.update({
      where: { id: agentId },
      data: { isActive: !agent.isActive },
    });

    // Also toggle user active status
    await this.prisma.user.update({
      where: { id: agent.userId },
      data: { isActive: updated.isActive },
    });

    return updated;
  }
}
