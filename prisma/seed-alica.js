// ============================================================================
// CAREPASS - Seed Alica Magnetto (compte féminin avec données riches pour mockups)
// Usage: node prisma/seed-alica.js
// ============================================================================

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Creating Alica Magnetto account with mock data...\n');

  const hashedPassword = await bcrypt.hash('Password123!', 12);

  // Check if user already exists
  const existing = await prisma.user.findUnique({ where: { email: 'alica.magnetto@gmail.com' } });
  if (existing) {
    console.log('⚠️  User alica.magnetto@gmail.com already exists. Deleting and recreating...');
    const existingPatient = await prisma.patient.findUnique({ where: { userId: existing.id } });
    if (existingPatient) {
      await prisma.pregnancyAppointment.deleteMany({ where: { pregnancy: { patientId: existingPatient.id } } });
      await prisma.pregnancy.deleteMany({ where: { patientId: existingPatient.id } });
      await prisma.menstrualCycle.deleteMany({ where: { patientId: existingPatient.id } });
      await prisma.emergencyContact.deleteMany({ where: { patientId: existingPatient.id } });
      await prisma.child.deleteMany({ where: { parentId: existingPatient.id } });
      await prisma.allergy.deleteMany({ where: { patientId: existingPatient.id } });
      await prisma.medicalCondition.deleteMany({ where: { patientId: existingPatient.id } });
      await prisma.vaccination.deleteMany({ where: { patientId: existingPatient.id } });
      await prisma.labResultItem.deleteMany({ where: { labResult: { patientId: existingPatient.id } } });
      await prisma.labResult.deleteMany({ where: { patientId: existingPatient.id } });
      await prisma.prescriptionItem.deleteMany({ where: { prescription: { patientId: existingPatient.id } } });
      await prisma.prescription.deleteMany({ where: { patientId: existingPatient.id } });
      await prisma.consultation.deleteMany({ where: { patientId: existingPatient.id } });
      await prisma.appointment.deleteMany({ where: { patientId: existingPatient.id } });
      await prisma.accessGrant.deleteMany({ where: { patientId: existingPatient.id } });
      await prisma.notification.deleteMany({ where: { userId: existing.id } });
      await prisma.subscription.deleteMany({ where: { userId: existing.id } });
      await prisma.patient.delete({ where: { id: existingPatient.id } });
    }
    await prisma.user.delete({ where: { id: existing.id } });
  }

  // =========================================================================
  // 1. USER + PATIENT
  // =========================================================================
  console.log('👤 Creating user...');
  const user = await prisma.user.create({
    data: {
      email: 'alica.magnetto@gmail.com',
      passwordHash: hashedPassword,
      role: 'patient',
      firstName: 'Alica',
      lastName: 'Magnetto',
      phone: '+237 691 234 567',
      isActive: true,
      emailVerifiedAt: new Date('2025-10-01'),
    },
  });

  console.log('🧑‍⚕️ Creating patient profile...');
  const patient = await prisma.patient.create({
    data: {
      userId: user.id,
      carepassId: 'CP-2025-00010',
      dateOfBirth: new Date('1995-08-14'),
      gender: 'F',
      bloodGroup: 'A+',
      genotype: 'AA',
      address: 'Quartier Bonamoussadi, Douala',
      city: 'Douala',
      region: 'Littoral',
      emergencyToken: 'EMG-ALICA-2025-TOKEN',
    },
  });

  // =========================================================================
  // 2. EMERGENCY CONTACTS
  // =========================================================================
  console.log('🆘 Creating emergency contacts...');
  await prisma.emergencyContact.createMany({
    data: [
      {
        patientId: patient.id,
        name: 'Marc Magnetto',
        relationship: 'Époux',
        phone: '+237 699 876 543',
        isPrimary: true,
      },
      {
        patientId: patient.id,
        name: 'Jeanne Magnetto',
        relationship: 'Mère',
        phone: '+237 677 112 233',
        isPrimary: false,
      },
    ],
  });

  // =========================================================================
  // 3. CHILDREN (2 enfants)
  // =========================================================================
  console.log('👶 Creating children...');
  const child1 = await prisma.child.create({
    data: {
      parentId: patient.id,
      firstName: 'Léa',
      lastName: 'Magnetto',
      dateOfBirth: new Date('2021-03-22'),
      gender: 'F',
      bloodGroup: 'A+',
    },
  });

  const child2 = await prisma.child.create({
    data: {
      parentId: patient.id,
      firstName: 'Nathan',
      lastName: 'Magnetto',
      dateOfBirth: new Date('2023-11-10'),
      gender: 'M',
      bloodGroup: 'O+',
    },
  });

  // =========================================================================
  // 4. ALLERGIES (3 allergies variées)
  // =========================================================================
  console.log('⚠️ Creating allergies...');
  await prisma.allergy.createMany({
    data: [
      {
        patientId: patient.id,
        name: 'Pénicilline',
        severity: 'severe',
        reaction: 'Éruption cutanée généralisée, œdème',
        diagnosedAt: new Date('2016-05-10'),
        notes: 'Contre-indication absolue aux bêta-lactamines.',
      },
      {
        patientId: patient.id,
        name: 'Pollen',
        severity: 'legere',
        reaction: 'Rhinite allergique saisonnière',
        diagnosedAt: new Date('2019-09-01'),
        notes: 'Symptômes de mars à juin. Antihistaminique au besoin.',
      },
      {
        patientId: patient.id,
        name: 'Fruits de mer',
        severity: 'moderee',
        reaction: 'Urticaire, nausées',
        diagnosedAt: new Date('2020-12-15'),
        notes: 'Éviter crevettes, crabes et homards.',
      },
    ],
  });

  // =========================================================================
  // 5. MEDICAL CONDITIONS (2 conditions)
  // =========================================================================
  console.log('🏥 Creating medical conditions...');
  await prisma.medicalCondition.createMany({
    data: [
      {
        patientId: patient.id,
        name: 'Asthme léger intermittent',
        diagnosedAt: new Date('2012-06-15'),
        status: 'managed',
        treatment: 'Salbutamol (Ventoline) en cas de crise',
        notes: 'Crises rares, déclenchées par l\'effort ou le froid. Bien contrôlé.',
      },
      {
        patientId: patient.id,
        name: 'Anémie ferriprive',
        diagnosedAt: new Date('2024-09-01'),
        status: 'active',
        treatment: 'Fer oral 200mg/jour + acide folique',
        notes: 'Hémoglobine à 10.2 g/dL. Contrôle dans 3 mois.',
      },
    ],
  });

  // =========================================================================
  // 6. VACCINATIONS (5 vaccins)
  // =========================================================================
  console.log('💉 Creating vaccinations...');
  await prisma.vaccination.createMany({
    data: [
      {
        patientId: patient.id,
        name: 'COVID-19 (Johnson & Johnson)',
        date: new Date('2022-03-10'),
        lot: 'JJ-CM-2022-156',
        location: 'Hôpital Laquintinie, Douala',
        status: 'done',
        notes: 'Dose unique. Légère fatigue 24h.',
      },
      {
        patientId: patient.id,
        name: 'Fièvre Jaune',
        date: new Date('2018-01-20'),
        lot: 'YF-2018-CMR',
        location: 'Centre de vaccination de Douala',
        status: 'done',
        notes: 'Certificat international délivré. Valable à vie.',
      },
      {
        patientId: patient.id,
        name: 'Hépatite B (3 doses)',
        date: new Date('2017-06-15'),
        lot: 'HB-2017-034',
        location: 'Clinique Fouda, Yaoundé',
        status: 'done',
        notes: 'Schéma complet 0-1-6 mois.',
      },
      {
        patientId: patient.id,
        name: 'Tétanos (Rappel)',
        date: new Date('2024-02-10'),
        lot: 'TET-2024-078',
        location: 'Hôpital Laquintinie, Douala',
        status: 'done',
        notes: 'Rappel décennal effectué.',
      },
      {
        patientId: patient.id,
        name: 'Grippe saisonnière 2026',
        date: new Date('2026-10-01'),
        status: 'scheduled',
        notes: 'Recommandé en raison de l\'asthme.',
      },
      // Vaccins enfants
      {
        patientId: patient.id,
        childId: child1.id,
        name: 'ROR (Rougeole-Oreillons-Rubéole)',
        date: new Date('2022-04-15'),
        lot: 'ROR-2022-CMR',
        location: 'PMI Bonamoussadi',
        status: 'done',
        notes: 'Première dose à 12 mois.',
      },
      {
        patientId: patient.id,
        childId: child2.id,
        name: 'BCG (Tuberculose)',
        date: new Date('2023-11-15'),
        lot: 'BCG-2023-045',
        location: 'Hôpital Laquintinie, Douala',
        status: 'done',
        notes: 'Vaccination à la naissance.',
      },
    ],
  });

  // =========================================================================
  // 7. Find existing doctors for consultations
  // =========================================================================
  const doctor1 = await prisma.doctor.findFirst({ where: { user: { email: 'dr.nkoulou@carepass.cm' } } });
  const doctor2 = await prisma.doctor.findFirst({ where: { user: { email: 'dr.fotso@carepass.cm' } } });

  if (!doctor1 || !doctor2) {
    console.log('⚠️  No doctors found. Run the main seed first: npx prisma db seed');
    await prisma.$disconnect();
    return;
  }

  // =========================================================================
  // 8. CONSULTATIONS (5 consultations variées)
  // =========================================================================
  console.log('📋 Creating consultations...');

  const consult1 = await prisma.consultation.create({
    data: {
      patientId: patient.id,
      doctorId: doctor1.id,
      date: new Date('2025-06-10T09:00:00Z'),
      type: 'consultation',
      motif: 'Fatigue persistante et vertiges',
      symptoms: 'Fatigue intense depuis 3 semaines, vertiges positionnels, pâleur',
      diagnosis: 'Anémie ferriprive',
      notes: 'Patiente présentant une asthénie marquée avec pâleur des conjonctives. Bilan sanguin demandé.',
      severity: 'moderee',
      vitalSigns: { temperature: 36.9, heartRate: 92, bloodPressure: '105/65', weight: 58, height: 163 },
      status: 'terminee',
    },
  });

  const consult2 = await prisma.consultation.create({
    data: {
      patientId: patient.id,
      doctorId: doctor1.id,
      date: new Date('2025-09-15T10:30:00Z'),
      type: 'suivi',
      motif: 'Contrôle anémie + suivi grossesse',
      symptoms: 'Nausées matinales, retard de règles de 6 semaines',
      diagnosis: 'Grossesse confirmée — 8 SA. Anémie en amélioration.',
      notes: 'Test de grossesse positif. Hémoglobine remontée à 11.0 g/dL. Supplémentation en fer et acide folique maintenue. Orientation vers suivi obstétrical.',
      severity: 'legere',
      vitalSigns: { temperature: 37.0, heartRate: 80, bloodPressure: '112/72', weight: 59, height: 163 },
      status: 'terminee',
    },
  });

  const consult3 = await prisma.consultation.create({
    data: {
      patientId: patient.id,
      doctorId: doctor2.id,
      date: new Date('2025-11-20T14:00:00Z'),
      type: 'consultation',
      motif: 'Consultation pédiatrique — Léa (fièvre)',
      symptoms: 'Fièvre 39°C chez Léa depuis 2 jours, toux sèche',
      diagnosis: 'Bronchite aiguë virale',
      notes: 'Enfant de 4 ans avec tableau de bronchite virale. Pas de signes de gravité. Traitement symptomatique.',
      severity: 'moderee',
      vitalSigns: { temperature: 38.7, heartRate: 110, bloodPressure: null, weight: 16, height: 102 },
      status: 'terminee',
    },
  });

  const consult4 = await prisma.consultation.create({
    data: {
      patientId: patient.id,
      doctorId: doctor1.id,
      date: new Date('2026-01-10T09:00:00Z'),
      type: 'suivi',
      motif: 'Suivi grossesse — 2e trimestre',
      symptoms: null,
      diagnosis: 'Grossesse évolutive normale — 24 SA',
      notes: 'Échographie T2 normale. Croissance fœtale harmonieuse. Sexe : garçon. Tension artérielle stable. Prise de poids normale (+6kg).',
      severity: 'legere',
      vitalSigns: { temperature: 36.8, heartRate: 78, bloodPressure: '115/70', weight: 64, height: 163 },
      status: 'terminee',
    },
  });

  const consult5 = await prisma.consultation.create({
    data: {
      patientId: patient.id,
      doctorId: doctor1.id,
      date: new Date('2026-03-20T08:30:00Z'),
      type: 'suivi',
      motif: 'Suivi grossesse — 3e trimestre',
      symptoms: null,
      diagnosis: null,
      notes: null,
      severity: 'legere',
      status: 'en_cours',
    },
  });

  // =========================================================================
  // 9. PRESCRIPTIONS
  // =========================================================================
  console.log('💊 Creating prescriptions...');

  await prisma.prescription.create({
    data: {
      consultationId: consult1.id,
      patientId: patient.id,
      doctorId: doctor1.id,
      notes: 'Traitement de l\'anémie ferriprive. Contrôle NFS dans 3 mois.',
      status: 'completed',
      items: {
        create: [
          { medication: 'Fer fumarate 200mg', dosage: '1 comprimé', frequency: '2 fois par jour', duration: '3 mois', instructions: 'Prendre à jeun avec du jus d\'orange (vitamine C)' },
          { medication: 'Acide folique 5mg', dosage: '1 comprimé', frequency: '1 fois par jour', duration: '3 mois', instructions: 'Le matin au petit-déjeuner' },
        ],
      },
    },
  });

  await prisma.prescription.create({
    data: {
      consultationId: consult2.id,
      patientId: patient.id,
      doctorId: doctor1.id,
      notes: 'Supplémentation grossesse. Suivi mensuel recommandé.',
      status: 'active',
      items: {
        create: [
          { medication: 'Fer + Acide folique (Tardyferon B9)', dosage: '1 comprimé', frequency: '1 fois par jour', duration: '6 mois', instructions: 'Pendant toute la grossesse' },
          { medication: 'Vitamine D3 100000 UI', dosage: '1 ampoule', frequency: 'Dose unique', duration: '1 jour', instructions: 'À prendre immédiatement' },
          { medication: 'Paracétamol 500mg', dosage: '1 à 2 comprimés', frequency: 'Si besoin', duration: 'Au besoin', instructions: 'Maximum 3g/jour. Éviter l\'ibuprofène.' },
        ],
      },
    },
  });

  await prisma.prescription.create({
    data: {
      consultationId: consult3.id,
      patientId: patient.id,
      doctorId: doctor2.id,
      notes: 'Traitement symptomatique pour Léa. Consulter si fièvre persiste >3 jours.',
      status: 'completed',
      items: {
        create: [
          { medication: 'Paracétamol sirop (Doliprane) 2.4%', dosage: '5 mL', frequency: '3 fois par jour', duration: '5 jours', instructions: 'Toutes les 6-8h si fièvre >38.5°C' },
          { medication: 'Sirop antitussif (Toplexil)', dosage: '5 mL', frequency: '3 fois par jour', duration: '5 jours', instructions: 'Avant les repas' },
        ],
      },
    },
  });

  // =========================================================================
  // 10. LAB RESULTS
  // =========================================================================
  console.log('🔬 Creating lab results...');

  const labUser = await prisma.user.findFirst({ where: { role: 'lab' } });
  const labInstitution = await prisma.institution.findFirst({ where: { type: 'laboratory' } });

  await prisma.labResult.create({
    data: {
      patientId: patient.id,
      uploadedById: labUser?.id || user.id,
      institutionId: labInstitution?.id || undefined,
      title: 'Numération Formule Sanguine (NFS)',
      category: 'hematologie',
      fileUrl: '/uploads/lab/nfs-alica-2025-06.pdf',
      date: new Date('2025-06-12'),
      notes: 'Bilan prescrit pour asthénie. Anémie ferriprive confirmée.',
      status: 'validated',
      items: {
        create: [
          { name: 'Hémoglobine', value: '10.2', unit: 'g/dL', referenceRange: '12.0 - 16.0', isAbnormal: true },
          { name: 'Hématocrite', value: '32', unit: '%', referenceRange: '36 - 46', isAbnormal: true },
          { name: 'VGM', value: '72', unit: 'fL', referenceRange: '80 - 100', isAbnormal: true },
          { name: 'Globules blancs', value: '6800', unit: '/µL', referenceRange: '4000 - 10000', isAbnormal: false },
          { name: 'Plaquettes', value: '285000', unit: '/µL', referenceRange: '150000 - 400000', isAbnormal: false },
          { name: 'Ferritine', value: '8', unit: 'ng/mL', referenceRange: '20 - 200', isAbnormal: true },
        ],
      },
    },
  });

  await prisma.labResult.create({
    data: {
      patientId: patient.id,
      uploadedById: labUser?.id || user.id,
      institutionId: labInstitution?.id || undefined,
      title: 'Bilan prénatal complet',
      category: 'biochimie',
      fileUrl: '/uploads/lab/bilan-prenatal-alica-2025-09.pdf',
      date: new Date('2025-09-20'),
      notes: 'Bilan du premier trimestre de grossesse.',
      status: 'validated',
      items: {
        create: [
          { name: 'Groupe sanguin', value: 'A+', unit: '', referenceRange: '', isAbnormal: false },
          { name: 'Glycémie à jeun', value: '0.85', unit: 'g/L', referenceRange: '0.70 - 1.10', isAbnormal: false },
          { name: 'Toxoplasmose IgG', value: 'Négatif', unit: '', referenceRange: '', isAbnormal: false },
          { name: 'Rubéole IgG', value: 'Positif (immunisée)', unit: '', referenceRange: '', isAbnormal: false },
          { name: 'HIV', value: 'Négatif', unit: '', referenceRange: '', isAbnormal: false },
          { name: 'Hépatite B (AgHBs)', value: 'Négatif', unit: '', referenceRange: '', isAbnormal: false },
          { name: 'Hémoglobine', value: '11.0', unit: 'g/dL', referenceRange: '11.0 - 14.0', isAbnormal: false },
          { name: 'ECBU', value: 'Stérile', unit: '', referenceRange: '', isAbnormal: false },
        ],
      },
    },
  });

  await prisma.labResult.create({
    data: {
      patientId: patient.id,
      uploadedById: labUser?.id || user.id,
      institutionId: labInstitution?.id || undefined,
      title: 'Échographie obstétricale T2',
      category: 'imagerie',
      fileUrl: '/uploads/lab/echo-t2-alica-2026-01.pdf',
      date: new Date('2026-01-08'),
      notes: 'Échographie morphologique du 2e trimestre.',
      status: 'validated',
      items: {
        create: [
          { name: 'Âge gestationnel', value: '24', unit: 'SA', referenceRange: '', isAbnormal: false },
          { name: 'Poids fœtal estimé', value: '650', unit: 'g', referenceRange: '500 - 800', isAbnormal: false },
          { name: 'Sexe', value: 'Masculin', unit: '', referenceRange: '', isAbnormal: false },
          { name: 'Liquide amniotique', value: 'Normal', unit: '', referenceRange: '', isAbnormal: false },
          { name: 'Placenta', value: 'Antérieur, non prævia', unit: '', referenceRange: '', isAbnormal: false },
          { name: 'Morphologie', value: 'Normale, sans anomalie détectée', unit: '', referenceRange: '', isAbnormal: false },
        ],
      },
    },
  });

  // =========================================================================
  // 11. MENSTRUAL CYCLES (historique avant grossesse)
  // =========================================================================
  console.log('🌸 Creating menstrual cycles...');
  await prisma.menstrualCycle.createMany({
    data: [
      {
        patientId: patient.id,
        startDate: new Date('2025-05-02'),
        endDate: new Date('2025-05-07'),
        cycleLength: 28,
        periodLength: 5,
        flow: 'medium',
        symptoms: JSON.stringify(['crampes', 'fatigue', 'maux de tête']),
        notes: 'Cycle régulier',
        ovulationDate: new Date('2025-05-16'),
        fertileWindowStart: new Date('2025-05-13'),
        fertileWindowEnd: new Date('2025-05-18'),
        nextPeriodDate: new Date('2025-05-30'),
      },
      {
        patientId: patient.id,
        startDate: new Date('2025-05-30'),
        endDate: new Date('2025-06-04'),
        cycleLength: 28,
        periodLength: 5,
        flow: 'medium',
        symptoms: JSON.stringify(['crampes', 'ballonnements']),
        notes: 'Cycle régulier',
        ovulationDate: new Date('2025-06-13'),
        fertileWindowStart: new Date('2025-06-10'),
        fertileWindowEnd: new Date('2025-06-15'),
        nextPeriodDate: new Date('2025-06-27'),
      },
      {
        patientId: patient.id,
        startDate: new Date('2025-06-27'),
        endDate: new Date('2025-07-02'),
        cycleLength: 29,
        periodLength: 5,
        flow: 'heavy',
        symptoms: JSON.stringify(['crampes intenses', 'fatigue', 'irritabilité']),
        notes: 'Flux plus abondant que d\'habitude',
        ovulationDate: new Date('2025-07-11'),
        fertileWindowStart: new Date('2025-07-08'),
        fertileWindowEnd: new Date('2025-07-13'),
        nextPeriodDate: new Date('2025-07-26'),
      },
      {
        patientId: patient.id,
        startDate: new Date('2025-07-26'),
        endDate: new Date('2025-07-30'),
        cycleLength: 28,
        periodLength: 4,
        flow: 'light',
        symptoms: JSON.stringify(['légères crampes']),
        notes: 'Dernières règles avant grossesse',
        ovulationDate: new Date('2025-08-09'),
        fertileWindowStart: new Date('2025-08-06'),
        fertileWindowEnd: new Date('2025-08-11'),
        nextPeriodDate: new Date('2025-08-23'),
      },
    ],
  });

  // =========================================================================
  // 12. PREGNANCY
  // =========================================================================
  console.log('🤰 Creating pregnancy...');
  const pregnancy = await prisma.pregnancy.create({
    data: {
      patientId: patient.id,
      startDate: new Date('2025-08-09'),
      expectedDueDate: new Date('2026-05-16'),
      status: 'en_cours',
      weeksCurrent: 30,
      notes: 'Grossesse normale. 3e grossesse, 2 enfants vivants. Sexe : garçon.',
      complications: JSON.stringify([]),
      bloodPressureLog: JSON.stringify([
        { date: '2025-09-15', systolic: 112, diastolic: 72 },
        { date: '2025-10-15', systolic: 110, diastolic: 70 },
        { date: '2025-11-15', systolic: 115, diastolic: 73 },
        { date: '2025-12-15', systolic: 118, diastolic: 75 },
        { date: '2026-01-10', systolic: 115, diastolic: 70 },
        { date: '2026-02-10', systolic: 120, diastolic: 78 },
        { date: '2026-03-05', systolic: 118, diastolic: 74 },
      ]),
      weightLog: JSON.stringify([
        { date: '2025-09-15', weight: 59 },
        { date: '2025-10-15', weight: 60 },
        { date: '2025-11-15', weight: 61.5 },
        { date: '2025-12-15', weight: 63 },
        { date: '2026-01-10', weight: 64 },
        { date: '2026-02-10', weight: 66 },
        { date: '2026-03-05', weight: 67.5 },
      ]),
    },
  });

  // =========================================================================
  // 13. PREGNANCY APPOINTMENTS
  // =========================================================================
  console.log('📅 Creating pregnancy appointments...');
  await prisma.pregnancyAppointment.createMany({
    data: [
      {
        pregnancyId: pregnancy.id,
        title: '1re consultation prénatale',
        date: new Date('2025-09-15T10:30:00Z'),
        type: 'Consultation',
        notes: 'Confirmation grossesse, bilan prénatal prescrit',
        completed: true,
      },
      {
        pregnancyId: pregnancy.id,
        title: 'Échographie T1 (datation)',
        date: new Date('2025-10-20T09:00:00Z'),
        type: 'Échographie',
        notes: 'Datation confirmée : 12 SA. Grossesse mono-fœtale évolutive.',
        completed: true,
      },
      {
        pregnancyId: pregnancy.id,
        title: '2e consultation prénatale',
        date: new Date('2025-11-15T14:00:00Z'),
        type: 'Consultation',
        notes: 'Bilan normal. Prise de poids correcte.',
        completed: true,
      },
      {
        pregnancyId: pregnancy.id,
        title: 'Échographie T2 (morphologie)',
        date: new Date('2026-01-08T10:00:00Z'),
        type: 'Échographie',
        notes: 'Morphologie normale. Sexe : garçon. Croissance harmonieuse.',
        completed: true,
      },
      {
        pregnancyId: pregnancy.id,
        title: '4e consultation prénatale',
        date: new Date('2026-02-10T09:00:00Z'),
        type: 'Consultation',
        notes: 'Tout est normal. Préparation à l\'accouchement recommandée.',
        completed: true,
      },
      {
        pregnancyId: pregnancy.id,
        title: 'Échographie T3',
        date: new Date('2026-03-20T10:00:00Z'),
        type: 'Échographie',
        notes: 'Échographie du 3e trimestre à venir',
        completed: false,
      },
      {
        pregnancyId: pregnancy.id,
        title: '5e consultation prénatale',
        date: new Date('2026-04-05T09:00:00Z'),
        type: 'Consultation',
        completed: false,
      },
      {
        pregnancyId: pregnancy.id,
        title: 'Date prévue d\'accouchement',
        date: new Date('2026-05-16T00:00:00Z'),
        type: 'Accouchement',
        notes: 'DPA estimée',
        completed: false,
      },
    ],
  });

  // =========================================================================
  // 14. APPOINTMENTS
  // =========================================================================
  console.log('📅 Creating upcoming appointments...');
  await prisma.appointment.createMany({
    data: [
      {
        patientId: patient.id,
        doctorId: doctor1.id,
        date: new Date('2026-03-20T08:30:00Z'),
        duration: 45,
        type: 'Suivi grossesse',
        reason: 'Suivi 3e trimestre + échographie T3',
        status: 'confirmed',
      },
      {
        patientId: patient.id,
        doctorId: doctor2.id,
        date: new Date('2026-04-02T14:00:00Z'),
        duration: 30,
        type: 'Pédiatrie',
        reason: 'Visite annuelle Nathan — vaccins de rappel',
        status: 'scheduled',
      },
    ],
  });

  // =========================================================================
  // 15. ACCESS GRANTS
  // =========================================================================
  console.log('🔑 Creating access grants...');
  await prisma.accessGrant.createMany({
    data: [
      { patientId: patient.id, doctorId: doctor1.id, scope: 'full', isActive: true },
      { patientId: patient.id, doctorId: doctor2.id, scope: 'consultation', isActive: true },
    ],
  });

  // =========================================================================
  // 16. NOTIFICATIONS
  // =========================================================================
  console.log('🔔 Creating notifications...');
  await prisma.notification.createMany({
    data: [
      {
        userId: user.id,
        title: 'Rendez-vous confirmé',
        message: 'Votre suivi grossesse avec Dr. Nkoulou le 20/03/2026 est confirmé.',
        type: 'info',
        isRead: false,
      },
      {
        userId: user.id,
        title: 'Résultat disponible',
        message: 'Votre échographie T2 est disponible dans vos résultats.',
        type: 'success',
        isRead: true,
      },
      {
        userId: user.id,
        title: 'Rappel vaccination',
        message: 'Rappel : vaccination grippe prévue le 01/10/2026.',
        type: 'warning',
        isRead: false,
      },
      {
        userId: user.id,
        title: 'Rappel médicament',
        message: 'N\'oubliez pas votre Tardyferon B9 aujourd\'hui.',
        type: 'info',
        isRead: false,
      },
    ],
  });

  // =========================================================================
  // 17. SUBSCRIPTION (Premium)
  // =========================================================================
  console.log('💳 Creating subscription...');
  const premiumPlan = await prisma.plan.findFirst({ where: { slug: 'premium' } });
  if (premiumPlan) {
    await prisma.subscription.create({
      data: {
        userId: user.id,
        planId: premiumPlan.id,
        status: 'active',
        startDate: new Date('2025-10-01'),
        endDate: new Date('2026-10-01'),
        autoRenew: true,
      },
    });
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n============================================');
  console.log('✅ Alica Magnetto account created!');
  console.log('============================================');
  console.log('📧 Email:     alica.magnetto@gmail.com');
  console.log('🔑 Password:  Password123!');
  console.log('🆔 CarePass:  CP-2025-00010');
  console.log('============================================');
  console.log('Data created:');
  console.log('  - 1 Patient (F, 30 ans, A+, AA)');
  console.log('  - 2 Emergency contacts');
  console.log('  - 2 Children (Léa 4 ans, Nathan 2 ans)');
  console.log('  - 3 Allergies (Pénicilline, Pollen, Fruits de mer)');
  console.log('  - 2 Medical conditions (Asthme, Anémie)');
  console.log('  - 7 Vaccinations (+ 2 enfants)');
  console.log('  - 5 Consultations');
  console.log('  - 3 Prescriptions');
  console.log('  - 3 Lab results (NFS, Bilan prénatal, Écho T2)');
  console.log('  - 4 Menstrual cycles');
  console.log('  - 1 Pregnancy (en cours, 30 SA, garçon)');
  console.log('  - 8 Pregnancy appointments');
  console.log('  - 2 Upcoming appointments');
  console.log('  - 4 Notifications');
  console.log('  - 1 Subscription Premium');
  console.log('============================================\n');
}

main()
  .catch((e) => {
    console.error('❌ Failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
