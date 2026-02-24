import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Recuperer tous les parametres systeme.
   * Super_admin uniquement.
   */
  async getSystemSettings() {
    const settings = await this.prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
      include: {
        updatedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    return { success: true, data: settings };
  }

  /**
   * Mettre a jour plusieurs parametres systeme (upsert).
   * Super_admin uniquement.
   */
  async updateSystemSettings(userId: string, dto: UpdateSettingsDto) {
    const upsertOperations = dto.settings.map((setting) =>
      this.prisma.systemSetting.upsert({
        where: { key: setting.key },
        update: {
          value: setting.value,
          updatedById: userId,
          updatedAt: new Date(),
        },
        create: {
          key: setting.key,
          value: setting.value,
          updatedById: userId,
        },
      }),
    );

    await this.prisma.$transaction(upsertOperations);

    const updatedSettings = await this.prisma.systemSetting.findMany({
      where: { key: { in: dto.settings.map((s) => s.key) } },
      include: {
        updatedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    return {
      success: true,
      data: updatedSettings,
      message: 'Parametres systeme mis a jour avec succes',
    };
  }

  /**
   * Recuperer les preferences utilisateur.
   * Retourne les valeurs par defaut si aucune preference n'existe.
   */
  async getUserPreferences(userId: string) {
    const prefix = `user_pref_${userId}_`;

    const settings = await this.prisma.systemSetting.findMany({
      where: { key: { startsWith: prefix } },
    });

    // Construire l'objet de preferences a partir des parametres
    const prefs: Record<string, string> = {};
    for (const setting of settings) {
      const key = setting.key.replace(prefix, '');
      prefs[key] = setting.value;
    }

    // Retourner les preferences avec les valeurs par defaut
    const defaults = {
      language: 'fr',
      notifications: 'true',
      theme: 'light',
    };

    return {
      success: true,
      data: {
        language: prefs.language || defaults.language,
        notifications: (prefs.notifications || defaults.notifications) === 'true',
        theme: prefs.theme || defaults.theme,
      },
    };
  }

  /**
   * Mettre a jour les preferences utilisateur.
   */
  async updateUserPreferences(userId: string, dto: UpdateUserPreferencesDto) {
    const prefix = `user_pref_${userId}_`;
    const operations: any[] = [];

    if (dto.language !== undefined) {
      operations.push(
        this.prisma.systemSetting.upsert({
          where: { key: `${prefix}language` },
          update: { value: dto.language, updatedById: userId, updatedAt: new Date() },
          create: { key: `${prefix}language`, value: dto.language, updatedById: userId },
        }),
      );
    }

    if (dto.notifications !== undefined) {
      operations.push(
        this.prisma.systemSetting.upsert({
          where: { key: `${prefix}notifications` },
          update: { value: String(dto.notifications), updatedById: userId, updatedAt: new Date() },
          create: { key: `${prefix}notifications`, value: String(dto.notifications), updatedById: userId },
        }),
      );
    }

    if (dto.theme !== undefined) {
      operations.push(
        this.prisma.systemSetting.upsert({
          where: { key: `${prefix}theme` },
          update: { value: dto.theme, updatedById: userId, updatedAt: new Date() },
          create: { key: `${prefix}theme`, value: dto.theme, updatedById: userId },
        }),
      );
    }

    if (operations.length > 0) {
      await this.prisma.$transaction(operations);
    }

    // Retourner les preferences mises a jour
    return this.getUserPreferences(userId);
  }
}
