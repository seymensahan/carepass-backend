/**
 * Active (or extends) subscriptions for the seeded test accounts so the
 * "Abonnement expiré" gate doesn't block the demo.
 *
 * Run with: npx ts-node scripts/fix-test-subscriptions.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TEST_EMAILS = [
  'admin@carypass.cm',
  'admin@hopital-central.cm',
  'dr.nkoulou@carypass.cm',
  'dr.fotso@carypass.cm',
  'dr.kamga@carypass.cm',
  'amina.bello@gmail.com',
  'eric.tchinda@gmail.com',
  'grace.ngono@gmail.com',
  'labo@analytica.cm',
  'agent@activa-assurance.cm',
  'infirmiere.test@carypass.cm',
  'alica.magnetto@gmail.com',
  'thegoat@gmail.com',
  'dradrien1@gmail.com',
  'dradrien2@gmail.com',
];

async function main() {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setFullYear(endDate.getFullYear() + 1);

  let plan = await prisma.plan.findFirst({ where: { slug: 'standard' } });
  if (!plan) plan = await prisma.plan.findFirst({ where: { isActive: true } });
  if (!plan) {
    console.log('No active plan found. Creating one...');
    plan = await prisma.plan.create({
      data: {
        name: 'Standard',
        slug: 'standard',
        description: 'Plan de démo',
        priceMonthly: 5000,
        priceYearly: 50000,
        isActive: true,
      },
    });
  }

  console.log(`Using plan: ${plan.name} (${plan.id})`);

  for (const email of TEST_EMAILS) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log(`  ✗ ${email} — user not found, skipped`);
      continue;
    }

    const existing = await prisma.subscription.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      await prisma.subscription.update({
        where: { id: existing.id },
        data: { status: 'active', startDate, endDate, autoRenew: true, planId: plan.id },
      });
      console.log(`  ✓ ${email} — subscription extended until ${endDate.toISOString().split('T')[0]}`);
    } else {
      await prisma.subscription.create({
        data: {
          userId: user.id,
          planId: plan.id,
          status: 'active',
          startDate,
          endDate,
          autoRenew: true,
        },
      });
      console.log(`  ✓ ${email} — subscription created`);
    }
  }

  console.log('\nDone. All test accounts now have an active subscription.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
