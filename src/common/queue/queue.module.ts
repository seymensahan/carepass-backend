import { DynamicModule, Module, Global, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * Global queue module backed by BullMQ + Redis.
 *
 * Only activates if REDIS_HOST is set. Otherwise the module loads an empty
 * shell — services should treat queue injections as optional and fall back
 * to synchronous execution.
 */
@Global()
@Module({})
export class QueueModule {
  private static readonly logger = new Logger(QueueModule.name);

  static register(): DynamicModule {
    const host = process.env.REDIS_HOST;

    if (!host) {
      QueueModule.logger.warn(
        'REDIS_HOST not set — BullMQ queues disabled (services will run synchronously)',
      );
      return {
        module: QueueModule,
        imports: [],
        exports: [],
      };
    }

    const rootModule = BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: parseInt(configService.get<string>('REDIS_PORT', '6379'), 10),
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
          maxRetriesPerRequest: null,
        },
      }),
    });

    const queues = BullModule.registerQueue(
      { name: 'emails' },
      { name: 'notifications' },
    );

    return {
      module: QueueModule,
      imports: [rootModule, queues],
      exports: [queues],
    };
  }
}
