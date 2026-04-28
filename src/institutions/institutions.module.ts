import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { InstitutionsController } from './institutions.controller';
import { InstitutionsService } from './institutions.service';
import { InvitationsService } from './invitations.service';
import { CloudinaryService } from '../common/services/cloudinary.service';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    EmailModule,
    NotificationsModule,
    // JwtModule needed by InvitationsService.registerViaInvitation to issue tokens
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '15m') as any },
      }),
    }),
  ],
  controllers: [InstitutionsController],
  providers: [InstitutionsService, InvitationsService, CloudinaryService],
  exports: [InstitutionsService, InvitationsService],
})
export class InstitutionsModule {}
