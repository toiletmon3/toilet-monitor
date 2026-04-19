import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Resolve org name and slug from env, fall back to generic defaults.
  const orgName = process.env.ORG_NAME ?? 'ארגון ראשי';
  const orgSlug = process.env.ORG_SLUG ?? 'main-org';
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@admin.com';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin123!';

  const org = await prisma.organization.upsert({
    where: { slug: orgSlug },
    update: {},
    create: {
      name: orgName,
      slug: orgSlug,
      settings: {
        defaultLanguage: 'he',
        rateLimit: 300,
        autoResolveAfterHours: 24,
      },
    },
  });
  console.log(`✅ Organization: ${org.name}`);

  const adminHash = await bcrypt.hash(adminPassword, 12);
  const admin = await prisma.user.upsert({
    where: { orgId_idNumber: { orgId: org.id, idNumber: adminEmail } },
    update: {},
    create: {
      orgId: org.id,
      idNumber: adminEmail,
      email: adminEmail,
      name: 'מנהל מערכת',
      role: 'ORG_ADMIN',
      passwordHash: adminHash,
      preferredLang: 'he',
    },
  });
  console.log(`✅ Admin: ${admin.email}`);

  // Default issue types (org-scoped)
  const issueTypes = [
    { code: 'toilet_paper',      nameI18n: { he: 'החלפת נייר טואלט', en: 'Toilet Paper' },    icon: '🧻', priority: 1 },
    { code: 'floor_cleaning',    nameI18n: { he: 'ניקוי רצפה',        en: 'Floor Cleaning' },   icon: '🧹', priority: 2 },
    { code: 'toilet_cleaning',   nameI18n: { he: 'ניקוי אסלה',        en: 'Toilet Cleaning' },  icon: '🚽', priority: 2 },
    { code: 'trash_empty',       nameI18n: { he: 'ריקון פח',           en: 'Empty Trash' },      icon: '🗑️', priority: 3 },
    { code: 'soap_refill',       nameI18n: { he: 'מילוי סבון',         en: 'Soap Refill' },      icon: '🧴', priority: 3 },
    { code: 'fault_report',      nameI18n: { he: 'דיווח על תקלה',     en: 'Fault Report' },     icon: '🔧', priority: 1 },
    { code: 'positive_feedback', nameI18n: { he: 'משוב חיובי',         en: 'Positive Feedback' }, icon: '😊', priority: 5 },
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
  console.log(`Admin login: ${adminEmail} / ${adminPassword}`);
  console.log(`Org slug: ${orgSlug}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
