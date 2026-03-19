import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';
import { DatabaseModule } from './database/database.module';
import { EmailModule } from './email/email.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PatientsModule } from './patients/patients.module';
import { DoctorsModule } from './doctors/doctors.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { LabResultsModule } from './lab-results/lab-results.module';
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
        EMAIL_FROM: Joi.string().default('CAREPASS <noreply@carepass.cm>'),
        FRONTEND_URL: Joi.string().default('http://localhost:3000'),

        APPWRITE_ENDPOINT: Joi.string().optional().allow(''),
        APPWRITE_PROJECT_ID: Joi.string().optional().allow(''),
        APPWRITE_API_KEY: Joi.string().optional().allow(''),
        APPWRITE_BUCKET_ID: Joi.string().default('carepass-files'),

        PAWAPAY_API_URL: Joi.string().default('https://api.sandbox.pawapay.io'),
        PAWAPAY_API_KEY: Joi.string().optional().allow(''),

        CORS_ORIGINS: Joi.string().default('http://localhost:3000,http://localhost:8081'),
        THROTTLE_TTL: Joi.number().default(60000),
        THROTTLE_LIMIT: Joi.number().default(100),
      }),
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),

    // Rate limiting
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    // Infrastructure
    DatabaseModule,
    EmailModule,

    // Feature modules
    AuthModule,
    UsersModule,
    PatientsModule,
    DoctorsModule,
    ConsultationsModule,
    PrescriptionsModule,
    LabResultsModule,
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
  ],
})
export class AppModule {}
