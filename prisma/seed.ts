// ============================================================================
// CAREPASS Digital Health Platform - Database Seed
// Generates realistic demo data for the Cameroon-based health platform
// ============================================================================

import { PrismaClient } from '@prisma/client';

const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding CAREPASS database...');

  // ==========================================================================
  // CLEAN EXISTING DATA (reverse dependency order)
  // ==========================================================================
  console.log('🧹 Cleaning existing data...');

  await prisma.auditLog.deleteMany();
  await prisma.systemSetting.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.insuranceClaim.deleteMany();
  await prisma.insuranceCompany.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.accessRequest.deleteMany();
  await prisma.accessGrant.deleteMany();
  await prisma.emergencyContact.deleteMany();
  await prisma.vaccination.deleteMany();
  await prisma.medicalCondition.deleteMany();
  await prisma.allergy.deleteMany();
  await prisma.child.deleteMany();
  await prisma.labResultItem.deleteMany();
  await prisma.labResult.deleteMany();
  await prisma.prescriptionItem.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.consultation.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.institution.deleteMany();
  await prisma.user.deleteMany();

  // ==========================================================================
  // HASH PASSWORD
  // ==========================================================================
  const hashedPassword = await bcrypt.hash('Password123!', 12);

  // ==========================================================================
  // 1. USERS
  // ==========================================================================
  console.log('👤 Creating users...');

  // -- Super Admin --
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@carepass.cm',
      passwordHash: hashedPassword,
      role: 'super_admin',
      firstName: 'Jean-Pierre',
      lastName: 'Mbarga',
      phone: '+237 699 000 001',
      isActive: true,
      emailVerifiedAt: new Date('2024-01-01'),
    },
  });

  // -- Doctors --
  const doctorUser1 = await prisma.user.create({
    data: {
      email: 'dr.nkoulou@carepass.cm',
      passwordHash: hashedPassword,
      role: 'doctor',
      firstName: 'Alain',
      lastName: 'Nkoulou',
      phone: '+237 699 100 001',
      isActive: true,
      emailVerifiedAt: new Date('2024-02-01'),
    },
  });

  const doctorUser2 = await prisma.user.create({
    data: {
      email: 'dr.fotso@carepass.cm',
      passwordHash: hashedPassword,
      role: 'doctor',
      firstName: 'Marie',
      lastName: 'Fotso',
      phone: '+237 699 100 002',
      isActive: true,
      emailVerifiedAt: new Date('2024-03-15'),
    },
  });

  const doctorUser3 = await prisma.user.create({
    data: {
      email: 'dr.kamga@carepass.cm',
      passwordHash: hashedPassword,
      role: 'doctor',
      firstName: 'Paul',
      lastName: 'Kamga',
      phone: '+237 699 100 003',
      isActive: true,
      emailVerifiedAt: new Date('2024-06-01'),
    },
  });

  // -- Patients --
  const patientUser1 = await prisma.user.create({
    data: {
      email: 'amina.bello@gmail.com',
      passwordHash: hashedPassword,
      role: 'patient',
      firstName: 'Amina',
      lastName: 'Bello',
      phone: '+237 699 200 001',
      isActive: true,
      emailVerifiedAt: new Date('2024-12-15'),
    },
  });

  const patientUser2 = await prisma.user.create({
    data: {
      email: 'eric.tchinda@gmail.com',
      passwordHash: hashedPassword,
      role: 'patient',
      firstName: 'Eric',
      lastName: 'Tchinda',
      phone: '+237 699 200 002',
      isActive: true,
      emailVerifiedAt: new Date('2025-01-10'),
    },
  });

  const patientUser3 = await prisma.user.create({
    data: {
      email: 'grace.ngono@gmail.com',
      passwordHash: hashedPassword,
      role: 'patient',
      firstName: 'Grace',
      lastName: 'Ngono',
      phone: '+237 699 200 003',
      isActive: true,
      emailVerifiedAt: new Date('2025-02-05'),
    },
  });

  // -- Institution Admin --
  const institutionAdminUser = await prisma.user.create({
    data: {
      email: 'admin@hopital-central.cm',
      passwordHash: hashedPassword,
      role: 'institution_admin',
      firstName: 'Pierre',
      lastName: 'Ndjock',
      phone: '+237 699 300 001',
      isActive: true,
      emailVerifiedAt: new Date('2024-01-15'),
    },
  });

  // -- Lab User --
  const labUser = await prisma.user.create({
    data: {
      email: 'labo@analytica.cm',
      passwordHash: hashedPassword,
      role: 'lab',
      firstName: 'Sylvie',
      lastName: 'Mbouda',
      phone: '+237 699 300 002',
      isActive: true,
      emailVerifiedAt: new Date('2024-04-01'),
    },
  });

  // -- Insurance User --
  const insuranceUser = await prisma.user.create({
    data: {
      email: 'agent@activa-assurance.cm',
      passwordHash: hashedPassword,
      role: 'insurance',
      firstName: 'Christian',
      lastName: 'Eyinga',
      phone: '+237 699 300 003',
      isActive: true,
      emailVerifiedAt: new Date('2024-05-01'),
    },
  });

  // ==========================================================================
  // 7. INSTITUTIONS
  // ==========================================================================
  console.log('🏥 Creating institutions...');

  const institution1 = await prisma.institution.create({
    data: {
      name: 'Hôpital Central de Yaoundé',
      type: 'hospital',
      registrationNumber: 'HOS-CMR-2020-001',
      address: 'Rue Henri Dunant, Centre-ville',
      city: 'Yaoundé',
      region: 'Centre',
      phone: '+237 222 231 000',
      email: 'contact@hopital-central.cm',
      isVerified: true,
      adminUserId: institutionAdminUser.id,
    },
  });

  const institution2 = await prisma.institution.create({
    data: {
      name: 'Laboratoire Analytica',
      type: 'laboratory',
      registrationNumber: 'LAB-CMR-2021-015',
      address: 'Boulevard de la Liberté, Akwa',
      city: 'Douala',
      region: 'Littoral',
      phone: '+237 233 420 100',
      email: 'contact@analytica.cm',
      isVerified: true,
    },
  });

  // ==========================================================================
  // 3. DOCTOR PROFILES
  // ==========================================================================
  console.log('🩺 Creating doctor profiles...');

  const doctor1 = await prisma.doctor.create({
    data: {
      userId: doctorUser1.id,
      specialty: 'Médecine Générale',
      licenseNumber: 'CM-MED-2020-001',
      institutionId: institution1.id,
      bio: 'Médecin généraliste avec plus de 10 ans d\'expérience dans la prise en charge des pathologies tropicales.',
      city: 'Yaoundé',
      region: 'Centre',
      isVerified: true,
      verifiedAt: new Date('2024-02-15'),
    },
  });

  const doctor2 = await prisma.doctor.create({
    data: {
      userId: doctorUser2.id,
      specialty: 'Pédiatrie',
      licenseNumber: 'CM-MED-2019-042',
      bio: 'Pédiatre spécialisée en néonatologie et suivi de l\'enfant.',
      city: 'Douala',
      region: 'Littoral',
      isVerified: true,
      verifiedAt: new Date('2024-03-20'),
    },
  });

  const doctor3 = await prisma.doctor.create({
    data: {
      userId: doctorUser3.id,
      specialty: 'Cardiologie',
      licenseNumber: 'CM-MED-2021-015',
      bio: 'Cardiologue, spécialiste en échocardiographie et maladies cardiovasculaires.',
      city: 'Yaoundé',
      region: 'Centre',
      isVerified: false,
    },
  });

  // ==========================================================================
  // 2. PATIENT PROFILES
  // ==========================================================================
  console.log('🧑‍⚕️ Creating patient profiles...');

  const patient1 = await prisma.patient.create({
    data: {
      userId: patientUser1.id,
      carepassId: 'CP-2025-00001',
      dateOfBirth: new Date('1990-03-15'),
      gender: 'F',
      bloodGroup: 'O+',
      genotype: 'AA',
      address: 'Quartier Bastos, Yaoundé',
      city: 'Yaoundé',
      region: 'Centre',
      emergencyToken: 'EMG-AMINA-2025-TOKEN',
    },
  });

  const patient2 = await prisma.patient.create({
    data: {
      userId: patientUser2.id,
      carepassId: 'CP-2025-00002',
      dateOfBirth: new Date('1985-07-22'),
      gender: 'M',
      bloodGroup: 'A+',
      genotype: 'AS',
      address: 'Quartier Bonapriso, Douala',
      city: 'Douala',
      region: 'Littoral',
    },
  });

  const patient3 = await prisma.patient.create({
    data: {
      userId: patientUser3.id,
      carepassId: 'CP-2025-00003',
      dateOfBirth: new Date('1998-11-08'),
      gender: 'F',
      bloodGroup: 'B+',
      genotype: 'AA',
      address: 'Commercial Avenue, Bamenda',
      city: 'Bamenda',
      region: 'Nord-Ouest',
    },
  });

  // ==========================================================================
  // 8. CONSULTATIONS
  // ==========================================================================
  console.log('📋 Creating consultations...');

  const consultation1 = await prisma.consultation.create({
    data: {
      patientId: patient1.id,
      doctorId: doctor1.id,
      date: new Date('2025-01-15T10:00:00Z'),
      type: 'consultation',
      motif: 'Fièvre persistante et maux de tête',
      symptoms: 'Fièvre 38.5°C, céphalées, fatigue',
      diagnosis: 'Paludisme simple',
      notes: 'Patiente présentant un tableau typique de paludisme non compliqué. Traitement ACT prescrit.',
      severity: 'moderee',
      vitalSigns: {
        temperature: 38.5,
        heartRate: 88,
        bloodPressure: '120/80',
        weight: 62,
        height: 165,
      },
      status: 'terminee',
    },
  });

  const consultation2 = await prisma.consultation.create({
    data: {
      patientId: patient1.id,
      doctorId: doctor1.id,
      date: new Date('2025-02-20T09:30:00Z'),
      type: 'suivi',
      motif: 'Contrôle post-traitement paludisme',
      symptoms: null,
      diagnosis: 'Guérison confirmée',
      notes: 'La goutte épaisse de contrôle est négative. NFS normalisée. Patiente en bonne santé.',
      severity: 'legere',
      vitalSigns: {
        temperature: 36.8,
        heartRate: 72,
        bloodPressure: '118/75',
        weight: 63,
        height: 165,
      },
      status: 'terminee',
    },
  });

  const consultation3 = await prisma.consultation.create({
    data: {
      patientId: patient1.id,
      doctorId: doctor1.id,
      date: new Date('2025-04-10T14:00:00Z'),
      type: 'consultation',
      motif: 'Douleurs abdominales',
      symptoms: 'Douleurs épigastriques, nausées',
      diagnosis: 'Gastrite aiguë',
      notes: 'Douleurs épigastriques depuis 5 jours, aggravées par les repas épicés. Pas de signes d\'alarme.',
      severity: 'moderee',
      vitalSigns: {
        temperature: 37.0,
        heartRate: 76,
        bloodPressure: '122/78',
        weight: 62,
        height: 165,
      },
      status: 'terminee',
    },
  });

  const consultation4 = await prisma.consultation.create({
    data: {
      patientId: patient1.id,
      doctorId: doctor1.id,
      date: new Date('2025-06-01T08:30:00Z'),
      type: 'consultation',
      motif: 'Bilan annuel de santé',
      symptoms: null,
      diagnosis: null,
      notes: null,
      severity: 'legere',
      status: 'en_cours',
    },
  });

  // ==========================================================================
  // 9. PRESCRIPTIONS
  // ==========================================================================
  console.log('💊 Creating prescriptions...');

  const prescription1 = await prisma.prescription.create({
    data: {
      consultationId: consultation1.id,
      patientId: patient1.id,
      doctorId: doctor1.id,
      notes: 'Traitement antipaludéen de première intention. Contrôle à J7.',
      status: 'completed',
      items: {
        create: [
          {
            medication: 'Artéméther-Luméfantrine 80/480mg',
            dosage: '2 comprimés',
            frequency: '2 fois par jour',
            duration: '3 jours',
            instructions: 'Prendre avec un repas riche en graisses',
          },
          {
            medication: 'Paracétamol 500mg',
            dosage: '1 comprimé',
            frequency: '3 fois par jour',
            duration: '5 jours',
            instructions: 'En cas de fièvre ou douleur',
          },
        ],
      },
    },
  });

  const prescription2 = await prisma.prescription.create({
    data: {
      consultationId: consultation3.id,
      patientId: patient1.id,
      doctorId: doctor1.id,
      notes: 'Régime alimentaire recommandé : éviter les aliments épicés, acides et les boissons gazeuses.',
      status: 'active',
      items: {
        create: [
          {
            medication: 'Oméprazole 20mg',
            dosage: '1 gélule',
            frequency: '1 fois par jour',
            duration: '4 semaines',
            instructions: 'Le matin à jeun, 30 min avant le petit-déjeuner',
          },
          {
            medication: 'Alginate de sodium',
            dosage: '1 sachet',
            frequency: '3 fois par jour',
            duration: '2 semaines',
            instructions: 'Après les repas',
          },
        ],
      },
    },
  });

  // ==========================================================================
  // 10. LAB RESULTS
  // ==========================================================================
  console.log('🔬 Creating lab results...');

  const labResult1 = await prisma.labResult.create({
    data: {
      patientId: patient1.id,
      uploadedById: labUser.id,
      institutionId: institution2.id,
      title: 'Goutte épaisse — Recherche de Plasmodium',
      category: 'hematologie',
      fileUrl: '/uploads/lab/goutte-epaisse-amina-2025.pdf',
      date: new Date('2025-01-15'),
      notes: 'Prélèvement effectué en urgence. Résultat disponible en 2h.',
      status: 'validated',
      items: {
        create: [
          {
            name: 'Plasmodium falciparum',
            value: 'Positif',
            unit: '',
            referenceRange: '',
            isAbnormal: true,
          },
          {
            name: 'Parasitémie',
            value: '2500',
            unit: 'parasites/\u00B5L',
            referenceRange: '<200',
            isAbnormal: true,
          },
          {
            name: 'Taux d\'hémoglobine',
            value: '11.2',
            unit: 'g/dL',
            referenceRange: '12.0 - 16.0',
            isAbnormal: true,
          },
        ],
      },
    },
  });

  const labResult2 = await prisma.labResult.create({
    data: {
      patientId: patient1.id,
      uploadedById: labUser.id,
      institutionId: institution2.id,
      title: 'Numération Formule Sanguine (NFS)',
      category: 'hematologie',
      fileUrl: '/uploads/lab/nfs-amina-2025.pdf',
      date: new Date('2025-02-20'),
      notes: 'Contrôle post-traitement antipaludéen. Valeurs normalisées.',
      status: 'validated',
      items: {
        create: [
          {
            name: 'Globules rouges',
            value: '4.5',
            unit: 'M/\u00B5L',
            referenceRange: '4.0 - 5.5',
            isAbnormal: false,
          },
          {
            name: 'Globules blancs',
            value: '7200',
            unit: '/\u00B5L',
            referenceRange: '4000 - 10000',
            isAbnormal: false,
          },
          {
            name: 'Plaquettes',
            value: '250000',
            unit: '/\u00B5L',
            referenceRange: '150000 - 400000',
            isAbnormal: false,
          },
          {
            name: 'Hémoglobine',
            value: '12.8',
            unit: 'g/dL',
            referenceRange: '12.0 - 16.0',
            isAbnormal: false,
          },
        ],
      },
    },
  });

  // ==========================================================================
  // 11. VACCINATIONS
  // ==========================================================================
  console.log('💉 Creating vaccinations...');

  await prisma.vaccination.create({
    data: {
      patientId: patient1.id,
      name: 'COVID-19 (Pfizer-BioNTech)',
      date: new Date('2023-06-15'),
      lot: 'FC3456',
      location: 'Hôpital Central de Yaoundé',
      status: 'done',
      notes: 'Première dose, aucun effet secondaire signalé.',
    },
  });

  await prisma.vaccination.create({
    data: {
      patientId: patient1.id,
      name: 'Fièvre Jaune',
      date: new Date('2020-01-10'),
      lot: 'YF2020-CM',
      location: 'Centre de vaccination Yaoundé',
      status: 'done',
      notes: 'Certificat international de vaccination délivré.',
    },
  });

  await prisma.vaccination.create({
    data: {
      patientId: patient1.id,
      name: 'Hépatite B (Rappel)',
      date: new Date('2025-08-01'),
      status: 'scheduled',
      notes: 'Rappel prévu dans le cadre du calendrier vaccinal.',
    },
  });

  // ==========================================================================
  // 12. ALLERGIES
  // ==========================================================================
  console.log('⚠️ Creating allergies...');

  await prisma.allergy.create({
    data: {
      patientId: patient1.id,
      name: 'Pénicilline',
      severity: 'severe',
      reaction: 'Choc anaphylactique',
      diagnosedAt: new Date('2015-03-20'),
      notes: 'Contre-indication absolue à toute la famille des bêta-lactamines.',
    },
  });

  await prisma.allergy.create({
    data: {
      patientId: patient1.id,
      name: 'Arachides',
      severity: 'moderee',
      reaction: 'Urticaire et démangeaisons',
      diagnosedAt: new Date('2018-11-05'),
      notes: 'Réaction cutanée, pas d\'atteinte respiratoire.',
    },
  });

  // ==========================================================================
  // 13. MEDICAL CONDITIONS
  // ==========================================================================
  console.log('🏥 Creating medical conditions...');

  await prisma.medicalCondition.create({
    data: {
      patientId: patient1.id,
      name: 'Asthme léger',
      diagnosedAt: new Date('2010-09-01'),
      status: 'managed',
      treatment: 'Ventoline en cas de crise',
      notes: 'Asthme intermittent, bien contrôlé sous traitement de secours uniquement.',
    },
  });

  // ==========================================================================
  // 14. CHILDREN
  // ==========================================================================
  console.log('👶 Creating children...');

  await prisma.child.create({
    data: {
      parentId: patient1.id,
      firstName: 'Yannick',
      lastName: 'Bello',
      dateOfBirth: new Date('2022-05-20'),
      gender: 'M',
      bloodGroup: 'O+',
    },
  });

  // ==========================================================================
  // 15. EMERGENCY CONTACTS
  // ==========================================================================
  console.log('🆘 Creating emergency contacts...');

  await prisma.emergencyContact.create({
    data: {
      patientId: patient1.id,
      name: 'Ibrahim Bello',
      relationship: 'Époux',
      phone: '+237 699 112 233',
      isPrimary: true,
    },
  });

  // ==========================================================================
  // 16. ACCESS GRANTS
  // ==========================================================================
  console.log('🔑 Creating access grants...');

  await prisma.accessGrant.create({
    data: {
      patientId: patient1.id,
      doctorId: doctor1.id,
      scope: 'full',
      isActive: true,
    },
  });

  await prisma.accessGrant.create({
    data: {
      patientId: patient1.id,
      doctorId: doctor2.id,
      scope: 'consultation',
      isActive: true,
    },
  });

  // ==========================================================================
  // 17. ACCESS REQUESTS
  // ==========================================================================
  console.log('📨 Creating access requests...');

  await prisma.accessRequest.create({
    data: {
      doctorId: doctor3.id,
      patientId: patient2.id,
      patientCarepassId: patient2.carepassId,
      reason: 'Suivi cardiologique suite à référence',
      status: 'pending',
    },
  });

  // ==========================================================================
  // 18. APPOINTMENTS
  // ==========================================================================
  console.log('📅 Creating appointments...');

  await prisma.appointment.create({
    data: {
      patientId: patient1.id,
      doctorId: doctor1.id,
      date: new Date('2025-07-15T09:00:00Z'),
      duration: 30,
      type: 'Suivi',
      reason: 'Suivi post-gastrite et bilan général',
      status: 'scheduled',
    },
  });

  await prisma.appointment.create({
    data: {
      patientId: patient2.id,
      doctorId: doctor2.id,
      date: new Date('2025-07-20T14:00:00Z'),
      duration: 45,
      type: 'Consultation',
      reason: 'Première consultation pédiatrique pour enfant',
      status: 'confirmed',
    },
  });

  // ==========================================================================
  // 19. INSURANCE COMPANY
  // ==========================================================================
  console.log('🛡️ Creating insurance company...');

  const insuranceCompany = await prisma.insuranceCompany.create({
    data: {
      userId: insuranceUser.id,
      name: 'Activa Assurances',
      registrationNumber: 'INS-CMR-2015-003',
      address: 'Rue Joss, Bonanjo',
      city: 'Douala',
      phone: '+237 233 430 500',
      email: 'contact@activa-assurance.cm',
      isVerified: true,
    },
  });

  // ==========================================================================
  // 20. INSURANCE CLAIMS
  // ==========================================================================
  console.log('📄 Creating insurance claims...');

  await prisma.insuranceClaim.create({
    data: {
      insuranceCompanyId: insuranceCompany.id,
      patientId: patient1.id,
      consultationId: consultation1.id,
      amount: 35000,
      description: 'Consultation et traitement paludisme',
      status: 'approved',
      processedAt: new Date('2025-01-20'),
    },
  });

  // ==========================================================================
  // 21. PLANS
  // ==========================================================================
  console.log('📦 Creating plans...');

  const planGratuit = await prisma.plan.create({
    data: {
      name: 'Gratuit',
      slug: 'gratuit',
      description: 'Accès de base à la plateforme CarePass avec des fonctionnalités limitées.',
      priceMonthly: 0,
      priceYearly: null,
      features: {
        consultations: 2,
        labResults: 1,
        storage: '100MB',
      },
      maxPatients: 1,
      maxDoctors: null,
      isActive: true,
    },
  });

  const planStandard = await prisma.plan.create({
    data: {
      name: 'Standard',
      slug: 'standard',
      description: 'Plan idéal pour un usage régulier avec accès élargi aux fonctionnalités.',
      priceMonthly: 2500,
      priceYearly: 25000,
      features: {
        consultations: 'illimité',
        labResults: 10,
        storage: '5GB',
        priority_support: false,
      },
      maxPatients: 5,
      maxDoctors: null,
      isActive: true,
    },
  });

  const planPremium = await prisma.plan.create({
    data: {
      name: 'Premium',
      slug: 'premium',
      description: 'Accès complet à toutes les fonctionnalités CarePass avec support prioritaire et API.',
      priceMonthly: 7500,
      priceYearly: 75000,
      features: {
        consultations: 'illimité',
        labResults: 'illimité',
        storage: '50GB',
        priority_support: true,
        api_access: true,
      },
      maxPatients: null,
      maxDoctors: null,
      isActive: true,
    },
  });

  // ==========================================================================
  // 22. SUBSCRIPTIONS
  // ==========================================================================
  console.log('💳 Creating subscriptions...');

  await prisma.subscription.create({
    data: {
      userId: patientUser1.id,
      planId: planStandard.id,
      status: 'active',
      startDate: new Date('2025-01-01'),
      endDate: new Date('2026-01-01'),
      autoRenew: true,
    },
  });

  // ==========================================================================
  // 23. NOTIFICATIONS
  // ==========================================================================
  console.log('🔔 Creating notifications...');

  await prisma.notification.create({
    data: {
      userId: patientUser1.id,
      title: 'Résultat disponible',
      message: 'Votre résultat de Goutte épaisse est disponible.',
      type: 'success',
      isRead: true,
      link: `/patient/lab-results/${labResult1.id}`,
    },
  });

  await prisma.notification.create({
    data: {
      userId: patientUser1.id,
      title: 'Rendez-vous confirmé',
      message: 'Votre rendez-vous avec Dr. Nkoulou le 15/07/2025 est confirmé.',
      type: 'info',
      isRead: false,
      link: '/patient/appointments',
    },
  });

  await prisma.notification.create({
    data: {
      userId: patientUser1.id,
      title: 'Rappel vaccination',
      message: 'Rappel : votre vaccination Hépatite B est prévue le 01/08/2025.',
      type: 'warning',
      isRead: false,
      link: '/patient/vaccinations',
    },
  });

  // ==========================================================================
  // 24. SYSTEM SETTINGS
  // ==========================================================================
  console.log('⚙️ Creating system settings...');

  await prisma.systemSetting.create({
    data: {
      key: 'maintenance_mode',
      value: 'false',
      description: 'Active/désactive le mode maintenance',
      updatedById: adminUser.id,
    },
  });

  await prisma.systemSetting.create({
    data: {
      key: 'max_file_size_mb',
      value: '10',
      description: 'Taille maximale des fichiers en Mo',
      updatedById: adminUser.id,
    },
  });

  await prisma.systemSetting.create({
    data: {
      key: 'carepass_id_counter',
      value: '3',
      description: 'Compteur pour la génération des CarePass ID',
      updatedById: adminUser.id,
    },
  });

  await prisma.systemSetting.create({
    data: {
      key: 'default_language',
      value: 'fr',
      description: 'Langue par défaut de la plateforme',
      updatedById: adminUser.id,
    },
  });

  // ==========================================================================
  // 25. AUDIT LOGS
  // ==========================================================================
  console.log('📝 Creating audit logs...');

  await prisma.auditLog.create({
    data: {
      userId: adminUser.id,
      action: 'SEED_DATABASE',
      resource: 'system',
      details: {
        message: 'Base de données initialisée avec les données de démonstration',
      },
      ipAddress: '127.0.0.1',
      userAgent: 'prisma-seed/1.0',
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: adminUser.id,
      action: 'CREATE_INSTITUTION',
      resource: 'institution',
      resourceId: institution1.id,
      details: {
        institutionName: 'Hôpital Central de Yaoundé',
        message: 'Institution créée lors de l\'initialisation',
      },
      ipAddress: '127.0.0.1',
      userAgent: 'prisma-seed/1.0',
    },
  });

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n============================================');
  console.log('✅ Seed completed successfully!');
  console.log('============================================');
  console.log('Created:');
  console.log('  - 10 Users (1 admin, 3 doctors, 3 patients, 1 institution admin, 1 lab, 1 insurance)');
  console.log('  - 3 Doctor profiles');
  console.log('  - 3 Patient profiles');
  console.log('  - 2 Institutions');
  console.log('  - 4 Consultations');
  console.log('  - 2 Prescriptions (with 4 items)');
  console.log('  - 2 Lab Results (with 7 items)');
  console.log('  - 3 Vaccinations');
  console.log('  - 2 Allergies');
  console.log('  - 1 Medical Condition');
  console.log('  - 1 Child');
  console.log('  - 1 Emergency Contact');
  console.log('  - 2 Access Grants');
  console.log('  - 1 Access Request');
  console.log('  - 2 Appointments');
  console.log('  - 1 Insurance Company');
  console.log('  - 1 Insurance Claim');
  console.log('  - 3 Plans (Gratuit, Standard, Premium)');
  console.log('  - 1 Subscription');
  console.log('  - 3 Notifications');
  console.log('  - 4 System Settings');
  console.log('  - 2 Audit Logs');
  console.log('============================================');
  console.log('\n📧 Demo accounts (password: Password123!):');
  console.log('  Admin:       admin@carepass.cm');
  console.log('  Doctor:      dr.nkoulou@carepass.cm');
  console.log('  Patient:     amina.bello@gmail.com');
  console.log('  Lab:         labo@analytica.cm');
  console.log('  Insurance:   agent@activa-assurance.cm');
  console.log('============================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
