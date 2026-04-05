/**
 * Seed plans matching the landing page pricing.
 * Run: node prisma/seed-plans.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding plans...');

  const plans = [
    {
      name: 'Cliniques & Petits Centres',
      tier: 'clinic-small',
      description: "Jusqu'à 5 médecins + 10 infirmiers",
      priceMonthly: 5000,
      priceYearly: 50000,
      maxDoctors: 5,
      maxNurses: 10,
      features: [
        "Jusqu'à 5 médecins + 10 infirmiers",
        "Dossiers patients illimités",
        "Saisie de consultations & ordonnances",
        "Accès urgence QR",
        "Rapports de base",
      ],
      isActive: true,
    },
    {
      name: 'Hôpitaux Moyens',
      tier: 'hospital-medium',
      description: '10 à 30 médecins + 60 infirmiers',
      priceMonthly: 10000,
      priceYearly: 100000,
      maxDoctors: 30,
      maxNurses: 60,
      features: [
        "10 à 30 médecins + 60 infirmiers",
        "Gestion des hospitalisations",
        "Upload résultats de labo",
        "Journaux d'audit & rapports avancés",
        "Support prioritaire",
      ],
      isActive: true,
    },
    {
      name: 'Grands Hôpitaux',
      tier: 'hospital-large',
      description: 'Médecins & infirmiers illimités',
      priceMonthly: 25000,
      priceYearly: 250000,
      maxDoctors: 999,
      maxNurses: 999,
      features: [
        "Médecins & infirmiers illimités",
        "Intégration complète",
        "Rapports personnalisés",
        "Support dédié & SLA",
        "Account Manager dédié",
      ],
      isActive: true,
    },
    {
      name: 'Laboratoires',
      tier: 'laboratory',
      description: 'Upload et gestion des résultats',
      priceMonthly: 7500,
      priceYearly: 75000,
      maxDoctors: 0,
      maxNurses: 0,
      features: [
        "Upload résultats d'analyses",
        "Liaison aux consultations",
        "Notifications patients",
        "Intégration hôpitaux",
        "Rapports de base",
      ],
      isActive: true,
    },
    {
      name: 'Patient',
      tier: 'patient',
      description: 'Accès complet au dossier médical numérique',
      priceMonthly: 0,
      priceYearly: 1000,
      maxDoctors: 0,
      maxNurses: 0,
      features: [
        "Dossier médical numérique complet",
        "QR code d'urgence",
        "Historique illimité",
        "Gestion des enfants",
        "Export PDF",
        "Rappels vaccins",
        "Partage sécurisé avec médecins",
      ],
      isActive: true,
    },
    {
      name: 'Médecin Premium',
      tier: 'medecin-premium',
      description: 'Outils avancés pour les professionnels de santé',
      priceMonthly: 2000,
      priceYearly: 20000,
      maxDoctors: 1,
      maxNurses: 0,
      features: [
        "Gestion illimitée de patients",
        "Consultations & ordonnances",
        "Hospitalisations",
        "Agenda & rendez-vous",
        "Analytics avancés",
        "Support prioritaire",
      ],
      isActive: true,
    },
  ];

  for (const plan of plans) {
    const slug = plan.tier;
    const existing = await prisma.plan.findFirst({ where: { slug } });
    if (existing) {
      await prisma.plan.update({
        where: { id: existing.id },
        data: {
          name: plan.name,
          description: plan.description,
          priceMonthly: plan.priceMonthly,
          priceYearly: plan.priceYearly,
          maxDoctors: plan.maxDoctors,
          features: plan.features,
          isActive: plan.isActive,
        },
      });
      console.log(`  Updated: ${plan.name} (${slug})`);
    } else {
      await prisma.plan.create({
        data: {
          name: plan.name,
          slug,
          description: plan.description,
          priceMonthly: plan.priceMonthly,
          priceYearly: plan.priceYearly,
          maxDoctors: plan.maxDoctors,
          features: plan.features,
          isActive: plan.isActive,
        },
      });
      console.log(`  Created: ${plan.name} (${slug})`);
    }
  }

  console.log('Done! Plans seeded successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
