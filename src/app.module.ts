import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module';
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

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({ isGlobal: true }),

    // Rate limiting
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),

    // Infrastructure
    DatabaseModule,

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
  ],
})
export class AppModule {}
