import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { PushService } from '../push/push.service';

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
   *
   * Track 2 — Supervisor escalation:
   *   At t = supervisorInterval * 1, supervisorInterval * 2, … → push to SHIFT_SUPERVISOR
   */
  private async runEscalation() {
    try {
      const orgs = await this.prisma.organization.findMany({ select: { id: true, settings: true } });

      for (const org of orgs) {
        const s = (org.settings ?? {}) as any;
        if (s.escalationEnabled === false) continue;
        const cleanerInterval: number = s.cleanerReminderMinutes ?? 5;
        const supervisorInterval: number = s.supervisorEscalationMinutes ?? 10;

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

        for (const incident of openIncidents) {
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

          // ── Cleaner reminder track ──
          if (cleanerInterval > 0) {
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
          // Counts from incident creation, independent of the cleaner track.
          if (supervisorInterval > 0) {
            const nextSupervisorAt = supervisorInterval * (supervisorReminders + 1);
            if (minutesOpen >= nextSupervisorAt) {
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
