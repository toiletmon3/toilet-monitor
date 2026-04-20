import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private logger = new Logger(SchedulerService.name);
  private escalationTimer: ReturnType<typeof setInterval> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private prisma: PrismaService,
    private events: EventsGateway,
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

  private async runEscalation() {
    try {
      const orgs = await this.prisma.organization.findMany({ select: { id: true, settings: true } });

      for (const org of orgs) {
        const s = (org.settings ?? {}) as any;
        if (s.escalationEnabled === false) continue;
        const levels: number[] = s.escalationLevels ?? [5, 10, 15];
        if (levels.length === 0) continue;

        const openIncidents = await this.prisma.incident.findMany({
          where: {
            restroom: { floor: { building: { orgId: org.id } } },
            status: { in: ['OPEN', 'IN_PROGRESS'] },
          },
          include: {
            actions: { select: { actionType: true, notes: true } },
            restroom: { include: { floor: { include: { building: true } } } },
            issueType: true,
            assignedCleaner: { select: { id: true, name: true } },
          },
        });

        for (const incident of openIncidents) {
          const minutesOpen = (Date.now() - incident.reportedAt.getTime()) / 60000;
          const existingEscalations = incident.actions
            .filter(a => a.actionType === 'ESCALATED')
            .map(a => {
              const match = a.notes?.match(/level:(\d+)/);
              return match ? parseInt(match[1]) : 0;
            });
          const maxEscalated = existingEscalations.length > 0 ? Math.max(...existingEscalations) : 0;

          for (let i = 0; i < levels.length; i++) {
            const level = i + 1;
            if (level <= maxEscalated) continue;
            if (minutesOpen >= levels[i]) {
              await this.prisma.incidentAction.create({
                data: {
                  incidentId: incident.id,
                  actionType: 'ESCALATED',
                  notes: `level:${level} — ${levels[i]} min`,
                  performedAt: new Date(),
                },
              });
              this.events.broadcastToOrg(org.id, 'incident:escalated', {
                ...incident,
                escalationLevel: level,
                escalationMinutes: levels[i],
              });
              this.logger.log(`Escalated incident ${incident.id} to level ${level} (${levels[i]}min)`);
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
