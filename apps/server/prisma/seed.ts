import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create organization
  const org = await prisma.organization.upsert({
    where: { slug: 'demo-mall' },
    update: {},
    create: {
      name: 'קניון דמו',
      slug: 'demo-mall',
      settings: {
        defaultLanguage: 'he',
        rateLimit: 300,
        autoResolveAfterHours: 24,
      },
    },
  });
  console.log(`✅ Organization: ${org.name}`);

  // Create admin user
  const adminHash = await bcrypt.hash('Admin123!', 12);
  const admin = await prisma.user.upsert({
    where: { orgId_idNumber: { orgId: org.id, idNumber: 'admin@demo.com' } },
    update: {},
    create: {
      orgId: org.id,
      idNumber: 'admin@demo.com',
      email: 'admin@demo.com',
      name: 'מנהל מערכת',
      role: 'ORG_ADMIN',
      passwordHash: adminHash,
      preferredLang: 'he',
    },
  });
  console.log(`✅ Admin: ${admin.email}`);

  // Create cleaners
  const cleaners = [
    { name: 'אחמד ח\'אלד', idNumber: '123456789' },
    { name: 'מרים כהן', idNumber: '234567890' },
    { name: 'יוסף לוי', idNumber: '345678901' },
  ];

  for (const c of cleaners) {
    await prisma.user.upsert({
      where: { orgId_idNumber: { orgId: org.id, idNumber: c.idNumber } },
      update: {},
      create: { orgId: org.id, ...c, role: 'CLEANER', preferredLang: 'he' },
    });
  }
  console.log(`✅ ${cleaners.length} cleaners created`);

  // Create building + floors + restrooms
  const building = await prisma.building.upsert({
    where: { id: 'bld-demo-001' },
    update: {},
    create: {
      id: 'bld-demo-001',
      orgId: org.id,
      name: 'בניין ראשי',
      address: 'רחוב הדמו 1, תל אביב',
    },
  });

  for (let f = 1; f <= 3; f++) {
    const floor = await prisma.floor.upsert({
      where: { buildingId_floorNumber: { buildingId: building.id, floorNumber: f } },
      update: {},
      create: { buildingId: building.id, floorNumber: f, name: `קומה ${f}` },
    });

    for (const gender of ['MALE', 'FEMALE'] as const) {
      const label = gender === 'MALE' ? 'גברים' : 'נשים';
      const restroom = await prisma.restroom.upsert({
        where: { id: `rst-demo-${f}-${gender.toLowerCase()}` },
        update: {},
        create: {
          id: `rst-demo-${f}-${gender.toLowerCase()}`,
          floorId: floor.id,
          name: `שירותי ${label} - קומה ${f}`,
          gender,
        },
      });

      // Register a device per restroom
      await prisma.device.upsert({
        where: { deviceCode: `KIOSK-F${f}-${gender[0]}` },
        update: {},
        create: {
          restroomId: restroom.id,
          deviceCode: `KIOSK-F${f}-${gender[0]}`,
          type: 'KIOSK',
        },
      });
    }
  }
  console.log(`✅ 3 floors × 2 restrooms = 6 restrooms with devices`);

  // Create default issue types
  const issueTypes = [
    { code: 'toilet_paper', nameI18n: { he: 'החלפת נייר טואלט', en: 'Toilet Paper' }, icon: '🧻', priority: 1 },
    { code: 'floor_cleaning', nameI18n: { he: 'ניקוי רצפה', en: 'Floor Cleaning' }, icon: '🧹', priority: 2 },
    { code: 'toilet_cleaning', nameI18n: { he: 'ניקוי אסלה', en: 'Toilet Cleaning' }, icon: '🚽', priority: 2 },
    { code: 'trash_empty', nameI18n: { he: 'ריקון פח', en: 'Empty Trash' }, icon: '🗑️', priority: 3 },
    { code: 'soap_refill', nameI18n: { he: 'מילוי סבון', en: 'Soap Refill' }, icon: '🧴', priority: 3 },
    { code: 'fault_report', nameI18n: { he: 'דיווח על תקלה', en: 'Fault Report' }, icon: '🔧', priority: 1 },
    { code: 'positive_feedback', nameI18n: { he: 'משוב חיובי', en: 'Positive Feedback' }, icon: '😊', priority: 5 },
  ];

  for (const it of issueTypes) {
    await prisma.issueType.upsert({
      where: { orgId_code: { orgId: org.id, code: it.code } },
      update: {},
      create: { orgId: org.id, ...it },
    });
  }
  console.log(`✅ ${issueTypes.length} issue types created`);

  console.log('\n🎉 Seed complete!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Admin login: admin@demo.com / Admin123!`);
  console.log(`Org ID: ${org.id}`);
  console.log(`Kiosk codes: KIOSK-F1-M, KIOSK-F1-F, KIOSK-F2-M, etc.`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
