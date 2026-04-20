/**
 * Update the existing "Médecin Premium / indépendant" plan(s) in DB:
 *   priceYearly = 10 000 FCFA (was 20 000)
 *   priceMonthly = 0          (system is yearly-only)
 *
 * Run with: npx ts-node scripts/update-doctor-plan-price.ts
 */
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();

  const plans = await prisma.plan.findMany({
    where: {
      OR: [
        { slug: 'medecin-premium' },
        { slug: 'doctor_premium' },
      ],
    },
  });

  if (plans.length === 0) {
    console.log('No doctor plan found. Seeding one.');
    await prisma.plan.create({
      data: {
        name: 'Médecin indépendant',
        slug: 'medecin-premium',
        description: 'Outils avancés pour les professionnels de santé',
        priceMonthly: 0,
        priceYearly: 10000,
        maxDoctors: 1,
        features: [
          'Gestion illimitée de patients',
          'Consultations & ordonnances',
          'Hospitalisations',
          'Agenda & rendez-vous',
          "Invitations d'infirmiers illimitées",
          'Support prioritaire',
        ],
        isActive: true,
      },
    });
    console.log('Created default doctor plan.');
    await prisma.$disconnect();
    return;
  }

  for (const p of plans) {
    const updated = await prisma.plan.update({
      where: { id: p.id },
      data: {
        name: 'Médecin indépendant',
        priceMonthly: 0,
        priceYearly: 10000,
        description: 'Outils avancés pour les professionnels de santé',
      },
    });
    console.log(`[updated] ${updated.slug} → ${updated.name} | ${updated.priceYearly} FCFA/an`);
  }

  console.log(`Done. ${plans.length} plan(s) updated.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
