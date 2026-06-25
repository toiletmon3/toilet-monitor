/**
 * One-off maintenance: purge historical statistics for a single building
 * before a cutoff date.
 *
 * SAFE BY DEFAULT — this is a DRY RUN unless PURGE_CONFIRM=1 is set. On a
 * confirmed run it ALWAYS takes a full pg_dump backup first and aborts if the
 * backup fails, so the deletion is recoverable.
 *
 * Configuration (env vars):
 *   PURGE_BEFORE            ISO date, e.g. "2026-06-22". Interpreted as midnight
 *                           Asia/Jerusalem (UTC+3 in summer / IDT). Everything
 *                           strictly BEFORE this instant is purged.
 *   PURGE_BUILDING_ID       Target building id. Preferred (unambiguous).
 *   PURGE_BUILDING_NAME     Alternatively match by exact building name.
 *   PURGE_INCLUDE_ARRIVALS  "1" → also delete CleanerArrival rows for the building.
 *   PURGE_CONFIRM           "1" → actually delete. Otherwise dry-run only.
 *
 * With neither id nor name set, it lists all buildings (id + name + how much
 * each would lose) so you can pick the id for the real run.
 *
 * Run on the server:
 *   cd /opt/toilet-monitor/apps/server && pnpm exec ts-node prisma/purge-building-stats.ts
 */
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as fs from 'fs';

const prisma = new PrismaClient();

function israelMidnight(dateStr: string): Date {
  // June is IDT (UTC+3). Anchor the cutoff at local midnight, explicitly.
  const d = new Date(`${dateStr}T00:00:00+03:00`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid PURGE_BEFORE date: "${dateStr}"`);
  return d;
}

function backupDatabase(): string {
  const dbUrl = process.env.DATABASE_URL;
  const dir = '/var/log/toilet/backups';
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = `${dir}/pre_purge_${stamp}.sql`;

  // Try a direct pg_dump first, then fall back to the dockerised Postgres
  // (mirrors scripts/deploy.sh). Abort the whole purge if neither works.
  try {
    execSync(`pg_dump "${dbUrl}" > "${file}"`, { stdio: 'pipe', shell: '/bin/bash' });
  } catch {
    execSync(`docker exec toilet_postgres pg_dump -U postgres toilet_monitor > "${file}"`, {
      stdio: 'pipe',
      shell: '/bin/bash',
    });
  }
  const bytes = fs.statSync(file).size;
  if (bytes < 1000) throw new Error(`Backup looks empty (${bytes} bytes) — aborting before any delete`);
  return `${file} (${(bytes / 1024).toFixed(0)} KB)`;
}

async function main() {
  const beforeStr = process.env.PURGE_BEFORE;
  if (!beforeStr) throw new Error('PURGE_BEFORE is required (e.g. PURGE_BEFORE=2026-06-22)');
  const cutoff = israelMidnight(beforeStr);
  const includeArrivals = process.env.PURGE_INCLUDE_ARRIVALS === '1';
  const confirm = process.env.PURGE_CONFIRM === '1';

  console.log('================ PURGE BUILDING STATS ================');
  console.log(`Cutoff       : before ${cutoff.toISOString()} (= ${beforeStr} 00:00 Israel time)`);
  console.log(`Mode         : ${confirm ? '*** CONFIRM — WILL DELETE ***' : 'DRY RUN (nothing will be deleted)'}`);
  console.log(`Arrivals     : ${includeArrivals ? 'included' : 'excluded'}`);

  const buildingId = process.env.PURGE_BUILDING_ID;
  const buildingName = process.env.PURGE_BUILDING_NAME;

  // No target → discovery mode: list every building and what it would lose.
  if (!buildingId && !buildingName) {
    const buildings = await prisma.building.findMany({ select: { id: true, name: true, orgId: true } });
    console.log(`\nNo PURGE_BUILDING_ID / PURGE_BUILDING_NAME set — listing all ${buildings.length} building(s):\n`);
    for (const b of buildings) {
      const incidents = await prisma.incident.count({
        where: { reportedAt: { lt: cutoff }, restroom: { floor: { buildingId: b.id } } },
      });
      const arrivals = await prisma.cleanerArrival.count({ where: { buildingId: b.id, arrivedAt: { lt: cutoff } } });
      console.log(`  • "${b.name}"  id=${b.id}  →  ${incidents} incident(s), ${arrivals} arrival(s) before cutoff`);
    }
    console.log('\nRe-run with PURGE_BUILDING_ID=<id> (and PURGE_CONFIRM=1 when ready).');
    return;
  }

  // Resolve the target building.
  const building = buildingId
    ? await prisma.building.findUnique({ where: { id: buildingId }, select: { id: true, name: true } })
    : (await prisma.building.findMany({ where: { name: buildingName }, select: { id: true, name: true } }));

  const matches = Array.isArray(building) ? building : building ? [building] : [];
  if (matches.length === 0) throw new Error(`No building matched (${buildingId ?? buildingName})`);
  if (matches.length > 1) {
    console.log('\nMultiple buildings matched that name — re-run with PURGE_BUILDING_ID:');
    matches.forEach(m => console.log(`  • "${m.name}"  id=${m.id}`));
    return;
  }
  const target = matches[0];
  console.log(`Building     : "${target.name}" (id=${target.id})`);

  // Gather what is in scope.
  const incidents = await prisma.incident.findMany({
    where: { reportedAt: { lt: cutoff }, restroom: { floor: { buildingId: target.id } } },
    select: { id: true, reportedAt: true },
    orderBy: { reportedAt: 'asc' },
  });
  const incidentIds = incidents.map(i => i.id);
  const actionsCount = incidentIds.length
    ? await prisma.incidentAction.count({ where: { incidentId: { in: incidentIds } } })
    : 0;
  const arrivalsCount = includeArrivals
    ? await prisma.cleanerArrival.count({ where: { buildingId: target.id, arrivedAt: { lt: cutoff } } })
    : 0;

  console.log('\n---------------- WHAT WILL BE PURGED ----------------');
  console.log(`Incidents        : ${incidents.length}`);
  if (incidents.length) {
    console.log(`  earliest       : ${incidents[0].reportedAt.toISOString()}`);
    console.log(`  latest         : ${incidents[incidents.length - 1].reportedAt.toISOString()}`);
  }
  console.log(`Incident actions : ${actionsCount}`);
  console.log(`Cleaner arrivals : ${includeArrivals ? arrivalsCount : '(excluded)'}`);
  console.log('-----------------------------------------------------');

  if (incidents.length === 0 && arrivalsCount === 0) {
    console.log('\nNothing to purge before the cutoff. Done.');
    return;
  }

  if (!confirm) {
    console.log('\nDRY RUN complete — NOTHING was deleted. Set PURGE_CONFIRM=1 to perform the deletion.');
    return;
  }

  // ---- CONFIRMED DELETE: back up first, then delete in a transaction. ----
  console.log('\nTaking a database backup before deleting...');
  const backup = backupDatabase();
  console.log(`Backup saved : ${backup}`);

  const result = await prisma.$transaction(async tx => {
    const delActions = incidentIds.length
      ? await tx.incidentAction.deleteMany({ where: { incidentId: { in: incidentIds } } })
      : { count: 0 };
    const delIncidents = incidentIds.length
      ? await tx.incident.deleteMany({ where: { id: { in: incidentIds } } })
      : { count: 0 };
    const delArrivals = includeArrivals
      ? await tx.cleanerArrival.deleteMany({ where: { buildingId: target.id, arrivedAt: { lt: cutoff } } })
      : { count: 0 };
    return { delActions, delIncidents, delArrivals };
  });

  console.log('\n================ DELETED ================');
  console.log(`Incident actions : ${result.delActions.count}`);
  console.log(`Incidents        : ${result.delIncidents.count}`);
  console.log(`Cleaner arrivals : ${result.delArrivals.count}`);
  console.log(`Backup           : ${backup}`);
  console.log('========================================');
}

main()
  .catch(err => {
    console.error('PURGE FAILED:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
