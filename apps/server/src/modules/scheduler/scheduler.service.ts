import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { PushService } from '../push/push.service';
import { readAlertSettings } from '../../common/alert-mode';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger(SchedulerService.name);
  private escalationTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private prisma: PrismaService,
    private events: EventsGateway,
    private push: PushService,
  ) {}

  onModuleInit() {
    this.escalationTimer = setInterval(() => this.runEscalation(), 60_000);
    this.cleanupTimer = setInterval(() => this.runCleanup(), 60 * 60 * 1000);
    // Run cleanup once on startup (deferred)
    setTimeout(() => this.runCleanup(), 10_000);
  }

  onModuleDestroy() {
    if (this.escalationTimer) clearInterval(this.escalationTimer);
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  /**
   * Two-track reminder system — both tracks count from incident creation
   * (reportedAt) and run independently:
   *
   * Track 1 — Cleaner reminders:
   *   At t = cleanerInterval * 1, cleanerInterval * 2, … → push to CLEANER
   *   SKIPPED for batched-alert (Option 2) properties — there the cleaners are
   *   notified by the grouped per-property pulse (runBatchedPulses) instead.
   *
   * Track 2 — Supervisor escalation:
   *   At t = supervisorInterval * 1, supervisorInterval * 2, … → push to SHIFT_SUPERVISOR
   *   Runs in BOTH alert modes — batching only changes how cleaners are alerted.
   */
  private async runEscalation() {
    try {
      const orgs = await this.prisma.organization.findMany({ select: { id: true, settings: true } });

      for (const org of orgs) {
        const s = (org.settings ?? {}) as any;
        // The escalation on/off toggle governs ONLY the old cleaner-reminder and
        // supervisor-escalation tracks below — NOT the per-property batched pulse,
        // which is a property's own chosen notification mechanism and must keep
        // firing even when the legacy escalation machinery is switched off.
        const escalationEnabled = s.escalationEnabled !== false;
        const cleanerInterval: number = s.cleanerReminderMinutes ?? 5;
        const supervisorInterval: number = s.supervisorEscalationMinutes ?? 10;

        // Per-property alert policy (Option 1 immediate vs Option 2 batched).
        // Buildings with no property default to immediate.
        const properties = await this.prisma.property.findMany({
          where: { orgId: org.id },
          select: { id: true, name: true, settings: true },
        });
        const batchedPropIds = new Set<string>();
        const batchedProps: Array<{ id: string; name: string; settings: any; interval: number }> = [];
        for (const p of properties) {
          const cfg = readAlertSettings(p.settings);
          if (cfg.alertMode !== 'batched') continue;
          batchedPropIds.add(p.id);
          batchedProps.push({ id: p.id, name: p.name, settings: (p.settings ?? {}) as any, interval: cfg.batchIntervalMinutes });
        }
        const isBatched = (propertyId: string | null | undefined) => !!propertyId && batchedPropIds.has(propertyId);

        // Nothing to do for this org only when there are no batched properties AND
        // the legacy escalation tracks are disabled.
        if (batchedProps.length === 0 && !escalationEnabled) continue;

        const openIncidents = await this.prisma.incident.findMany({
          where: {
            restroom: { floor: { building: { orgId: org.id } } },
            status: { in: ['OPEN', 'IN_PROGRESS'] },
          },
          include: {
            actions: { select: { actionType: true, notes: true } },
            restroom: { include: { floor: { include: { building: true } } } },
            issueType: true,
          },
        });

        // ── Batched-alert pulse (Option 2): one grouped push per property ──
        // Runs regardless of the escalation toggle (see note above).
        if (batchedProps.length > 0) await this.runBatchedPulses(org.id, openIncidents, batchedProps);

        // Everything below is the LEGACY escalation machinery, gated by the toggle.
        if (!escalationEnabled) continue;

        // One reminder per real-world problem: when several open incidents share
        // the same type + restroom (visitors re-reporting the same issue), only
        // the FIRST (earliest) one drives reminders/escalations — resolving it
        // auto-resolves the siblings anyway.
        const firstPerGroup = new Map<string, (typeof openIncidents)[number]>();
        for (const inc of openIncidents) {
          const key = `${inc.restroomId}:${inc.issueTypeId}`;
          const current = firstPerGroup.get(key);
          if (!current || inc.reportedAt < current.reportedAt) firstPerGroup.set(key, inc);
        }

        for (const incident of firstPerGroup.values()) {
          const minutesOpen = (Date.now() - incident.reportedAt.getTime()) / 60000;
          const escalations = incident.actions.filter(a => a.actionType === 'ESCALATED');
          const cleanerReminders = escalations.filter(a => a.notes?.startsWith('cleaner:')).length;
          const supervisorReminders = escalations.filter(a => a.notes?.startsWith('supervisor:')).length;

          const issueName = (incident.issueType?.nameI18n as any);
          const issueLabel = issueName?.he ?? issueName?.en ?? 'תקלה';
          const location = [
            incident.restroom.floor.building.name,
            incident.restroom.floor.name,
            incident.restroom.name,
          ].filter(Boolean).join(' › ');
          const buildingId = incident.restroom.floor.buildingId;
          const batchedProperty = isBatched(incident.restroom.floor.building.propertyId);

          // Escalation clock — a layer that follows the property's alert option.
          // Batched (Option 2): escalation counts from the issue's FIRST grouped
          // announcement (notifiedAt), the same moment its response time starts —
          // NOT from report time; until that first pulse the issue hasn't been
          // announced, so escalation holds entirely. Immediate (Option 1):
          // counts from reportedAt as usual.
          const notYetAnnounced = batchedProperty && !incident.notifiedAt;
          const escalationStart = incident.notifiedAt ?? incident.reportedAt;
          const minutesSinceEscalationStart = (Date.now() - escalationStart.getTime()) / 60000;

          // ── Cleaner reminder track (immediate-alert properties only) ──
          if (cleanerInterval > 0 && !batchedProperty) {
            const nextCleanerAt = cleanerInterval * (cleanerReminders + 1);
            if (minutesOpen >= nextCleanerAt) {
              const round = cleanerReminders + 1;
              await this.prisma.incidentAction.create({
                data: {
                  incidentId: incident.id,
                  actionType: 'ESCALATED',
                  notes: `cleaner:${round} — ${nextCleanerAt} min`,
                  performedAt: new Date(),
                },
              });

              this.push.sendToBuilding(org.id, buildingId, {
                title: `🔔 תזכורת #${round}`,
                body: `${(incident.issueType as any)?.icon ?? '📋'} ${issueLabel} — ${location}`,
                url: '/cleaner',
                tag: `cleaner-reminder-${incident.id}-${round}`,
              }, ['CLEANER']).catch(() => {});

              this.events.broadcastToOrg(org.id, 'incident:escalated', {
                ...incident, escalationType: 'cleaner', escalationRound: round,
              });
              this.logger.log(`Cleaner reminder #${round} for incident ${incident.id} (${nextCleanerAt}min)`);
            }
          }

          // ── Supervisor escalation track ──
          // Follows the alert option's clock (see escalationStart above) and
          // holds until a batched issue has had its first grouped announcement.
          if (supervisorInterval > 0 && !notYetAnnounced) {
            const nextSupervisorAt = supervisorInterval * (supervisorReminders + 1);
            if (minutesSinceEscalationStart >= nextSupervisorAt) {
              const round = supervisorReminders + 1;
              await this.prisma.incidentAction.create({
                data: {
                  incidentId: incident.id,
                  actionType: 'ESCALATED',
                  notes: `supervisor:${round} — ${nextSupervisorAt} min`,
                  performedAt: new Date(),
                },
              });

              this.push.sendToBuilding(org.id, buildingId, {
                title: `⚠️ אסקלציה #${round}`,
                body: `${(incident.issueType as any)?.icon ?? '📋'} ${issueLabel} — ${location}`,
                url: '/supervisor',
                tag: `supervisor-escalation-${incident.id}-${round}`,
              }, ['SHIFT_SUPERVISOR']).catch(() => {});

              this.events.broadcastToOrg(org.id, 'incident:escalated', {
                ...incident, escalationType: 'supervisor', escalationRound: round,
              });
              this.logger.log(`Supervisor escalation #${round} for incident ${incident.id} (${nextSupervisorAt}min)`);
            }
          }
        }
      }
    } catch (err) {
      this.logger.error('Escalation cron error', err);
    }
  }

  /**
   * Option 2 (batched alerts): for every property in "batched" mode, hold newly
   * reported issues silently and — while any issue is open — send ONE grouped
   * push to that property's cleaners every `interval` minutes ("you have N open
   * issues to handle"). Each issue the pulse announces for the FIRST time is
   * stamped with `notifiedAt`; that stamp is where its response-time stopwatch
   * starts (see responseStartAt), so the wait for the next pulse is never
   * charged against the property. Already-announced issues keep their original
   * stamp — the recurring pulse just keeps reminding, it does not reset clocks.
   *
   * The pulse cadence is anchored on `settings.lastBatchPulseAt`: the wait is
   * measured from the previous pulse, or (on the first pulse, or after the queue
   * emptied and refilled) from when the oldest still-open issue was reported —
   * so a fresh issue always gets its full quiet window before it is announced.
   *
   * `openIncidents` are all OPEN/IN_PROGRESS incidents of the org (already
   * loaded by the caller); only status OPEN issues count as "to handle".
   */
  private async runBatchedPulses(
    orgId: string,
    openIncidents: Array<{
      id: string;
      status: string;
      reportedAt: Date;
      notifiedAt: Date | null;
      restroom: { floor: { buildingId: string; building: { propertyId: string | null } } };
    }>,
    batchedProps: Array<{ id: string; name: string; settings: any; interval: number }>,
  ) {
    const now = new Date();
    const nowMs = now.getTime();

    // Bucket OPEN issues by their (batched) property.
    const openByProp = new Map<string, typeof openIncidents>();
    for (const inc of openIncidents) {
      if (inc.status !== 'OPEN') continue;
      const propertyId = inc.restroom.floor.building.propertyId;
      if (!propertyId) continue;
      const arr = openByProp.get(propertyId) ?? [];
      arr.push(inc);
      openByProp.set(propertyId, arr);
    }

    for (const prop of batchedProps) {
      const open = openByProp.get(prop.id);
      if (!open || open.length === 0) continue;

      const intervalMs = prop.interval * 60_000;
      const oldestReportedMs = Math.min(...open.map(i => i.reportedAt.getTime()));
      const lastPulseMs = prop.settings?.lastBatchPulseAt ? new Date(prop.settings.lastBatchPulseAt).getTime() : null;
      // Count the wait from the previous pulse when it preceded these issues;
      // otherwise from when the oldest still-open issue was reported (fresh cohort).
      const anchorMs = lastPulseMs !== null && lastPulseMs >= oldestReportedMs ? lastPulseMs : oldestReportedMs;
      if (nowMs - anchorMs < intervalMs) continue;

      // Start the response clock for issues announced here for the first time.
      const firstTimeIds = open.filter(i => !i.notifiedAt).map(i => i.id);
      if (firstTimeIds.length > 0) {
        await this.prisma.incident.updateMany({ where: { id: { in: firstTimeIds } }, data: { notifiedAt: now } });
      }

      // Persist the pulse time so the next reminder is one interval later.
      await this.prisma.property.update({
        where: { id: prop.id },
        data: { settings: { ...(prop.settings ?? {}), lastBatchPulseAt: now.toISOString() } },
      });

      const count = open.length;
      const buildingIds = [...new Set(open.map(i => i.restroom.floor.buildingId))];
      await this.push.sendToBuildings(orgId, buildingIds, {
        title: `🔔 ${count} ${count === 1 ? 'תקלה ממתינה' : 'תקלות ממתינות'}`,
        body: `יש ${count === 1 ? 'תקלה אחת' : `${count} תקלות`} לטיפול — ${prop.name}`,
        url: '/cleaner',
        tag: `batch-${prop.id}`,
      }, ['CLEANER']).catch(() => {});

      this.events.broadcastToOrg(orgId, 'incident:batch-notified', { propertyId: prop.id, count });
      this.logger.log(`Batched alert — property "${prop.name}": ${count} open issue(s), ${firstTimeIds.length} newly announced`);
    }
  }

  private async runCleanup() {
    try {
      const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days

      const oldIncidents = await this.prisma.incident.findMany({
        where: { reportedAt: { lt: cutoff } },
        select: { id: true },
      });

      if (oldIncidents.length > 0) {
        const ids = oldIncidents.map(i => i.id);
        const { count: actionsDeleted } = await this.prisma.incidentAction.deleteMany({
          where: { incidentId: { in: ids } },
        });
        const { count: incidentsDeleted } = await this.prisma.incident.deleteMany({
          where: { id: { in: ids } },
        });
        this.logger.log(`Cleanup: deleted ${incidentsDeleted} incidents + ${actionsDeleted} actions older than 60 days`);
      }

      const { count: arrivalsDeleted } = await this.prisma.cleanerArrival.deleteMany({
        where: { arrivedAt: { lt: cutoff } },
      });
      if (arrivalsDeleted > 0) {
        this.logger.log(`Cleanup: deleted ${arrivalsDeleted} arrivals older than 60 days`);
      }
    } catch (err) {
      this.logger.error('Cleanup cron error', err);
    }
  }
}
