import { Module, Global, Logger } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * Global cache module.
 *
 * - If REDIS_HOST is set, uses Redis via cache-manager-redis-yet.
 * - Otherwise falls back to the default in-memory store.
 * - Default TTL: 5 minutes.
 * - Never throws at startup — graceful degradation if Redis is unavailable.
 */
@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const logger = new Logger('AppCacheModule');
        const defaultTtl = 5 * 60 * 1000; // 5 minutes (ms)
        const host = configService.get<string>('REDIS_HOST');

        if (!host) {
          logger.warn('REDIS_HOST not set — using in-memory cache (not shared across instances)');
          return { ttl: defaultTtl };
        }

        try {
          // Lazy import so the app can boot even if the package is absent.
          const { redisStore } = await import('cache-manager-redis-yet');
          const port = parseInt(configService.get<string>('REDIS_PORT', '6379'), 10);
          const password = configService.get<string>('REDIS_PASSWORD') || undefined;

          logger.log(`Initializing Redis cache store at ${host}:${port}`);

          const store = await redisStore({
            socket: { host, port },
            password,
            ttl: defaultTtl,
          });

          return {
            store: store as any,
            ttl: defaultTtl,
          };
        } catch (err: any) {
          logger.error(
            `Failed to initialize Redis cache — falling back to in-memory: ${err?.message || err}`,
          );
          return { ttl: defaultTtl };
        }
      },
    }),
  ],
  exports: [NestCacheModule],
})
export class AppCacheModule {}
