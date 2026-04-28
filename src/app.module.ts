import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { SentryModule, SentryGlobalFilter } from '@sentry/nestjs/setup';
import * as Joi from 'joi';
import { DatabaseModule } from './database/database.module';
import { AppCacheModule } from './common/cache/cache.module';
import { QueueModule } from './common/queue/queue.module';
import { EmailModule } from './email/email.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PatientsModule } from './patients/patients.module';
import { DoctorsModule } from './doctors/doctors.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { LabResultsModule } from './lab-results/lab-results.module';
import { LabOrdersModule } from './lab-orders/lab-orders.module';
import { VaccinationsModule } from './vaccinations/vaccinations.module';
import { AllergiesModule } from './allergies/allergies.module';
import { MedicalConditionsModule } from './medical-conditions/medical-conditions.module';
import { ChildrenModule } from './children/children.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { AccessGrantsModule } from './access-grants/access-grants.module';
import { AccessRequestsModule } from './access-requests/access-requests.module';
import { InstitutionsModule } from './institutions/institutions.module';
import { InsuranceModule } from './insurance/insurance.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { NotificationsModule } from './notifications/notifications.module';
import { EmergencyModule } from './emergency/emergency.module';
import { SearchModule } from './search/search.module';
import { ExportModule } from './export/export.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SettingsModule } from './settings/settings.module';
import { MenstrualCycleModule } from './menstrual-cycle/menstrual-cycle.module';
import { PregnancyModule } from './pregnancy/pregnancy.module';
import { PaymentsModule } from './payments/payments.module';
import { HospitalisationsModule } from './hospitalisations/hospitalisations.module';
import { NursesModule } from './nurses/nurses.module';
import { GatewayModule } from './gateway/gateway.module';
// import { MessagingModule } from './messaging/messaging.module'; // TODO: messaging disabled — standalone feature not integrated into care flow
import { SmsModule } from './sms/sms.module';
import { VouchersModule } from './vouchers/vouchers.module';
import { FieldAgentsModule } from './field-agents/field-agents.module';
import { WalletModule } from './wallet/wallet.module';
import { ReferralModule } from './referral/referral.module';
import { CronJobsModule } from './cron-jobs/cron-jobs.module';

@Module({
  imports: [
    // Configuration with validation
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        // Required
        PORT: Joi.number().default(8000),
        NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
        DATABASE_URL: Joi.string().required(),
        JWT_SECRET: Joi.string().required(),
        JWT_EXPIRES_IN: Joi.string().default('15m'),
        JWT_REFRESH_SECRET: Joi.string().required(),
        JWT_REFRESH_EXPIRES_IN: Joi.string().default('7d'),

        // Optional — services degrade gracefully if not set
        RESEND_API_KEY: Joi.string().optional().allow(''),
        EMAIL_FROM: Joi.string().default('CARYPASS <noreply@carypass.cm>'),
        FRONTEND_URL: Joi.string().default('http://localhost:3000'),

        APPWRITE_ENDPOINT: Joi.string().optional().allow(''),
        APPWRITE_PROJECT_ID: Joi.string().optional().allow(''),
        APPWRITE_API_KEY: Joi.string().optional().allow(''),
        APPWRITE_BUCKET_ID: Joi.string().default('carypass-files'),

        PAWAPAY_API_URL: Joi.string().default('https://api.sandbox.pawapay.io'),
        PAWAPAY_API_KEY: Joi.string().optional().allow(''),

        ORANGE_SMS_CLIENT_ID: Joi.string().optional().allow(''),
        ORANGE_SMS_CLIENT_SECRET: Joi.string().optional().allow(''),
        ORANGE_SMS_SENDER: Joi.string().default('tel:+237XXXXXXXXX'),

        CORS_ORIGINS: Joi.string().default('http://localhost:3000,http://localhost:8081'),
        THROTTLE_TTL: Joi.number().default(60000),
        THROTTLE_LIMIT: Joi.number().default(100),
      }),
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),

    // Rate limiting — three named throttlers provide layered protection:
    //   - short: burst protection (3 req/s)
    //   - medium: 20 req/10s
    //   - long: 100 req/min
    // Endpoints can opt into stricter limits via @Throttle({ short: ... }).
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 3 },
      { name: 'medium', ttl: 10000, limit: 20 },
      { name: 'long', ttl: 60000, limit: 100 },
    ]),

    // Sentry — no-op if SENTRY_DSN is not set (see src/instrument.ts).
    SentryModule.forRoot(),

    // Scheduled tasks — doctor subscription auto-renewal runs daily at 02:00.
    ScheduleModule.forRoot(),

    // Infrastructure
    DatabaseModule,
    AppCacheModule,
    QueueModule.register(),
    EmailModule,
    SmsModule,

    // Feature modules
    AuthModule,
    UsersModule,
    PatientsModule,
    DoctorsModule,
    ConsultationsModule,
    PrescriptionsModule,
    LabResultsModule,
    LabOrdersModule,
    VaccinationsModule,
    AllergiesModule,
    MedicalConditionsModule,
    ChildrenModule,
    AppointmentsModule,
    AccessGrantsModule,
    AccessRequestsModule,
    InstitutionsModule,
    InsuranceModule,
    SubscriptionsModule,
    NotificationsModule,
    EmergencyModule,
    SearchModule,
    ExportModule,
    DashboardModule,
    SettingsModule,
    MenstrualCycleModule,
    PregnancyModule,
    PaymentsModule,
    HospitalisationsModule,
    NursesModule,
    GatewayModule,
    // MessagingModule, // disabled
    VouchersModule,
    FieldAgentsModule,
    CronJobsModule,
    WalletModule,
    ReferralModule,
  ],
  providers: [
    // Global Sentry exception filter. Safe to register even when Sentry
    // is disabled — it falls through to the next filter in that case.
    {
      provide: APP_FILTER,
      useClass: SentryGlobalFilter,
    },
    // Global throttler guard. Endpoints can override per-route limits
    // with @Throttle({ ... }) or skip with @SkipThrottle().
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
