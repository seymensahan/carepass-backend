import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';

@Injectable()
export class TokenBlacklistService implements OnModuleDestroy {
  private readonly logger = new Logger(TokenBlacklistService.name);
  private blacklist = new Map<string, number>(); // token -> expiry timestamp
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired tokens every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  add(token: string, expiresInMs: number) {
    this.blacklist.set(token, Date.now() + expiresInMs);
    this.logger.debug(`Token blacklisted (${this.blacklist.size} total)`);
  }

  isBlacklisted(token: string): boolean {
    const expiry = this.blacklist.get(token);
    if (!expiry) return false;
    if (Date.now() > expiry) {
      this.blacklist.delete(token);
      return false;
    }
    return true;
  }

  private cleanup() {
    const now = Date.now();
    let cleaned = 0;
    for (const [token, expiry] of this.blacklist.entries()) {
      if (now > expiry) {
        this.blacklist.delete(token);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      this.logger.debug(`Cleaned ${cleaned} expired tokens from blacklist`);
    }
  }

  onModuleDestroy() {
    clearInterval(this.cleanupInterval);
  }
}
