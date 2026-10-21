/**
 * Seed script.
 *
 * Two layers:
 *   1. Reference data (always): the four station categories.
 *   2. Sample/demo data (only when SEED_DEVELOPMENT_DATA=true and NODE_ENV!=="production"):
 *      clearly-labelled demo accounts, clubs, stations, hours and pricing rules.
 *
 * NEVER hardcode production credentials here. Demo accounts are gated and their
 * passwords are read from env vars with safe development defaults.
 */
import { PrismaClient, StationCategoryKey, ClubStatus, Role, UserStatus, MembershipRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEV_PASSWORD = process.env.SEED_DEV_PASSWORD || 'Password123!';

async function seedCategories() {
  const categories: Array<{ key: StationCategoryKey; labelUz: string; labelRu: string; labelEn: string }> = [
    { key: 'PC', labelUz: 'Standart kompyuter', labelRu: 'Стандартный ПК', labelEn: 'Standard PC' },
    { key: 'VIP_PC', labelUz: 'VIP kompyuter', labelRu: 'VIP ПК', labelEn: 'VIP PC' },
    { key: 'BOOTCAMP', labelUz: 'Bootcamp', labelRu: 'Буткемп', labelEn: 'Bootcamp' },
    { key: 'CONSOLE', labelUz: 'Konsol', labelRu: 'Консоль', labelEn: 'Console' },
  ];
  for (const c of categories) {
    await prisma.stationCategory.upsert({
      where: { key: c.key },
      create: c,
      update: { labelUz: c.labelUz, labelRu: c.labelRu, labelEn: c.labelEn },
    });
  }
  console.log(`Seeded ${categories.length} station categories.`);
}

async function seedDevelopment() {
  if (process.env.NODE_ENV === 'production') {
    console.log('NODE_ENV=production — skipping development seed data.');
    return;
  }
  if (process.env.SEED_DEVELOPMENT_DATA !== 'true') {
    console.log('SEED_DEVELOPMENT_DATA not "true" — skipping development seed data.');
    return;
  }

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);

  const accounts: Array<{ email: string; role: Role; displayName: string }> = [
    { email: 'admin@cyberbook.dev', role: Role.ADMIN, displayName: 'Dev Admin' },
    { email: 'owner@cyberbook.dev', role: Role.CLUB_OWNER, displayName: 'Dev Club Owner' },
    { email: 'staff@cyberbook.dev', role: Role.STAFF, displayName: 'Dev Staff' },
    { email: 'player@cyberbook.dev', role: Role.USER, displayName: 'Dev Player' },
  ];

  const users: Record<string, number> = {};
  for (const a of accounts) {
    const user = await prisma.user.upsert({
      where: { email: a.email },
      create: {
        email: a.email,
        passwordHash,
        role: a.role,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        profile: { create: { displayName: a.displayName } },
      },
      update: { role: a.role, status: UserStatus.ACTIVE },
    });
    users[a.email] = user.id;
  }
  console.log(`Seeded ${accounts.length} development accounts (password: ${DEV_PASSWORD}).`);

  const ownerId = users['owner@cyberbook.dev'];
  const staffId = users['staff@cyberbook.dev'];

  const categories = await prisma.stationCategory.findMany();
  const categoryByKey = new Map(categories.map((c) => [c.key, c.id]));

  const sampleClubs = [
    {
      slug: 'sample-cyber-arena-chilonzor',
      name: '[SAMPLE] Cyber Arena Chilonzor',
      district: 'Chilonzor',
      address: 'Chilonzor, Bunyodkor shoh ko\'chasi 12',
      latitude: 41.2856,
      longitude: 69.2034,
      categories: [
        { key: 'PC' as StationCategoryKey, count: 8, price: 25000n },
        { key: 'VIP_PC' as StationCategoryKey, count: 4, price: 40000n },
      ],
    },
    {
      slug: 'sample-pixel-hub-yunusabad',
      name: '[SAMPLE] Pixel Hub Yunusabad',
      district: 'Yunusabad',
      address: 'Yunusabad, Amir Temur shoh ko\'chasi 88',
      latitude: 41.3467,
      longitude: 69.2891,
      categories: [
        { key: 'PC' as StationCategoryKey, count: 10, price: 22000n },
        { key: 'BOOTCAMP' as StationCategoryKey, count: 3, price: 60000n },
      ],
    },
    {
      slug: 'sample-console-lounge-mirzo',
      name: '[SAMPLE] Console Lounge Mirzo Ulugbek',
      district: 'Mirzo Ulugbek',
      address: 'Mirzo Ulugbek, Mustaqillik shoh ko\'chasi 45',
      latitude: 41.3253,
      longitude: 69.3354,
      categories: [
        { key: 'CONSOLE' as StationCategoryKey, count: 4, price: 35000n },
      ],
    },
  ];

  for (const club of sampleClubs) {
    const created = await prisma.club.upsert({
      where: { slug: club.slug },
      create: {
        ownerId,
        name: club.name,
        slug: club.slug,
        description: 'Sample club seeded for local development. Not a real business.',
        city: 'Tashkent',
        district: club.district,
        address: club.address,
        latitude: club.latitude,
        longitude: club.longitude,
        phone: '+998900000000',
        status: ClubStatus.APPROVED,
        timezone: 'Asia/Tashkent',
      },
      update: { status: ClubStatus.APPROVED },
    });

    // Owner membership
    await prisma.clubMembership.upsert({
      where: { clubId_userId: { clubId: created.id, userId: ownerId } },
      create: { clubId: created.id, userId: ownerId, role: MembershipRole.OWNER },
      update: { role: MembershipRole.OWNER },
    });
    await prisma.clubMembership.upsert({
      where: { clubId_userId: { clubId: created.id, userId: staffId } },
      create: { clubId: created.id, userId: staffId, role: MembershipRole.STAFF },
      update: { role: MembershipRole.STAFF },
    });

    // Weekly hours: Mon–Sun 10:00–02:00 (overnight).
    for (let day = 0; day < 7; day++) {
      await prisma.operatingHours.upsert({
        where: { clubId_dayOfWeek: { clubId: created.id, dayOfWeek: day } },
        create: { clubId: created.id, dayOfWeek: day, closed: false, opensAt: '10:00', closesAt: '02:00' },
        update: { closed: false, opensAt: '10:00', closesAt: '02:00' },
      });
    }

    // Stations for each category in the club.
    let sortOrder = 0;
    for (const cat of club.categories) {
      const categoryId = categoryByKey.get(cat.key);
      if (!categoryId) continue;
      for (let i = 1; i <= cat.count; i++) {
        const label = `${cat.key === 'CONSOLE' ? 'Console' : 'PC'}-${String(i).padStart(2, '0')}`;
        const existing = await prisma.station.findFirst({
          where: { clubId: created.id, label },
        });
        if (existing) {
          await prisma.station.update({
            where: { id: existing.id },
            data: { categoryId, pricePerHour: cat.price, status: 'ACTIVE', sortOrder },
          });
        } else {
          await prisma.station.create({
            data: {
              clubId: created.id,
              categoryId,
              label,
              pricePerHour: cat.price,
              status: 'ACTIVE',
              sortOrder,
              specs: { note: 'Sample station' },
            },
          });
        }
        sortOrder += 1;
      }
    }

    // Happy-hour pricing rule example (18:00–22:00, higher priority).
    const existingRule = await prisma.pricingRule.findFirst({
      where: { clubId: created.id, name: 'Sample Happy Hour' },
    });
    if (!existingRule) {
      await prisma.pricingRule.create({
        data: {
          clubId: created.id,
          name: 'Sample Happy Hour',
          priority: 10,
          dayOfWeeks: [],
          startsAtTime: '18:00',
          endsAtTime: '22:00',
          unit: 'PER_HOUR',
          amount: 20000n,
          active: true,
        },
      });
    }
  }

  console.log(`Seeded ${sampleClubs.length} sample clubs with stations, hours and pricing.`);
}

async function main() {
  await seedCategories();
  await seedDevelopment();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('Seed failed:', error);
    await prisma.$disconnect();
    process.exit(1);
  });
