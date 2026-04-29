import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { PushService } from '../push/push.service';
import { IncidentStatus } from '@prisma/client';

const INCIDENT_INCLUDE = {
  issueType: true,
  device: true,
  restroom: {
    include: {
      floor: {
        include: {
          building: true,
        },
      },
    },
  },
  actions: {
    include: { user: { select: { id: true, name: true, idNumber: true } } },
    orderBy: { performedAt: 'asc' as const },
  },
  assignedCleaner: { select: { id: true, name: true, idNumber: true } },
};

@Injectable()
export class IncidentsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsGateway,
    private push: PushService,
  ) {}

  async create(dto: {
    restroomId: string;
    issueTypeId: string;
    deviceId: string;
    reportedAt: string;
    clientId: string;
  }) {
    // Idempotency: if same clientId exists, return it (offline dedup)
    const existing = await this.prisma.incident.findUnique({
      where: { clientId: dto.clientId },
      include: INCIDENT_INCLUDE,
    });
    if (existing) return existing;

    // Rate limiting: prevent duplicates, but allow re-reporting once IN_PROGRESS for 5+ min
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Block if OPEN and reported within the last 5 min
    const recentOpen = await this.prisma.incident.findFirst({
      where: {
        restroomId: dto.restroomId,
        issueTypeId: dto.issueTypeId,
        status: 'OPEN',
        reportedAt: { gte: fiveMinAgo },
      },
    });
    if (recentOpen) throw new ConflictException('A recent report for this issue already exists');

    // Block if IN_PROGRESS and acknowledged within the last 5 min (team just dispatched)
    const recentInProgress = await this.prisma.incident.findFirst({
      where: {
        restroomId: dto.restroomId,
        issueTypeId: dto.issueTypeId,
        status: 'IN_PROGRESS',
        acknowledgedAt: { gte: fiveMinAgo },
      },
    });
    if (recentInProgress) throw new ConflictException('A team member is already handling this');
    // If IN_PROGRESS but 5+ min have passed — allow new report (issue may have recurred)

    // Check if this is positive feedback — auto-resolve immediately (no action needed)
    const issueType = await this.prisma.issueType.findUnique({ where: { id: dto.issueTypeId } });
    const isPositiveFeedback = issueType?.code === 'positive_feedback';

    const incident = await this.prisma.incident.create({
      data: {
        clientId: dto.clientId,
        restroomId: dto.restroomId,
        issueTypeId: dto.issueTypeId,
        deviceId: dto.deviceId,
        reportedAt: new Date(dto.reportedAt),
        ...(isPositiveFeedback && {
          status: 'RESOLVED',
          resolvedAt: new Date(dto.reportedAt),
        }),
        actions: {
          create: {
            actionType: 'REPORTED',
            performedAt: new Date(dto.reportedAt),
          },
        },
      },
      include: INCIDENT_INCLUDE,
    });

    // Get orgId from restroom hierarchy for WebSocket broadcasting
    const orgId = incident.restroom.floor.building.orgId;
    const buildingId = incident.restroom.floor.buildingId;
    const issueName = incident.issueType?.nameI18n as any;
    const issueLabel = issueName?.he ?? issueName?.en ?? 'תקלה חדשה';
    const issueIcon = (incident.issueType as any)?.icon ?? '📋';
    const location = [
      incident.restroom.floor.building.name,
      incident.restroom.floor.name,
      incident.restroom.name,
    ].filter(Boolean).join(' › ');

    // Push to CLEANERs only — SHIFT_SUPERVISORs get notified via escalation
    this.push.sendToBuilding(orgId, buildingId, {
      title: isPositiveFeedback ? '😊 משוב חיובי' : '🚾 ToiletMon — תקלה חדשה',
      body: `${issueIcon} ${issueLabel} — ${location}`,
      url: '/cleaner',
      tag: isPositiveFeedback ? 'positive-feedback' : `incident-${incident.id}`,
    }, ['CLEANER']).catch(() => {});

    if (!isPositiveFeedback) {
      this.events.broadcastToOrg(orgId, 'incident:created', incident);
      this.events.broadcastToRestroom(dto.restroomId, 'incident:created', incident);
    }

    return incident;
  }

  async syncBatch(dto: {
    deviceId: string;
    incidents: Array<{ restroomId: string; issueTypeId: string; deviceId: string; reportedAt: string; clientId: string }>;
    actions: Array<{ clientId?: string; incidentClientId: string; actionType: string; cleanerIdNumber?: string; notes?: string; performedAt: string }>;
  }) {
    let synced = 0;
    const errors: string[] = [];

    for (const inc of dto.incidents) {
      try {
        await this.create(inc);
        synced++;
      } catch (e: any) {
        if (e instanceof ConflictException) synced++; // already exists = success
        else errors.push(`Incident ${inc.clientId}: ${e.message}`);
      }
    }

    for (const action of dto.actions) {
      try {
        await this.applyOfflineAction(action);
        synced++;
      } catch (e: any) {
        errors.push(`Action ${action.clientId}: ${e.message}`);
      }
    }

    return { synced, failed: errors.length, errors };
  }

  private async applyOfflineAction(action: any) {
    if (action.clientId) {
      const exists = await this.prisma.incidentAction.findUnique({ where: { clientId: action.clientId } });
      if (exists) return exists;
    }

    const incident = await this.prisma.incident.findUnique({
      where: { clientId: action.incidentClientId },
    });
    if (!incident) throw new NotFoundException(`Incident ${action.incidentClientId} not found`);

    let userId: string | undefined;
    if (action.cleanerIdNumber) {
      const cleaner = await this.prisma.user.findFirst({
        where: { idNumber: action.cleanerIdNumber, isActive: true },
      });
      userId = cleaner?.id;
    }

    return this.prisma.incidentAction.create({
      data: {
        clientId: action.clientId,
        incidentId: incident.id,
        userId,
        actionType: action.actionType,
        notes: action.notes,
        performedAt: new Date(action.performedAt),
      },
    });
  }

  async findAll(orgId: string, filters: {
    status?: IncidentStatus;
    buildingId?: string;
    floorId?: string;
    restroomId?: string;
    assignedCleanerId?: string;
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {
      restroom: { floor: { building: { orgId } } },
    };
    if (filters.status) where.status = filters.status;
    if (filters.restroomId) where.restroomId = filters.restroomId;
    if (filters.assignedCleanerId) where.assignedCleanerId = filters.assignedCleanerId;
    if (filters.floorId) where.restroom = { ...where.restroom, floorId: filters.floorId };
    if (filters.buildingId) where.restroom = { ...where.restroom, floor: { buildingId: filters.buildingId } };
    if (filters.from || filters.to) {
      where.reportedAt = {};
      if (filters.from) where.reportedAt.gte = new Date(filters.from);
      if (filters.to) where.reportedAt.lte = new Date(filters.to);
    }

    const [items, total] = await Promise.all([
      this.prisma.incident.findMany({
        where,
        include: INCIDENT_INCLUDE,
        orderBy: { reportedAt: 'desc' },
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
      }),
      this.prisma.incident.count({ where }),
    ]);

    return { items, total };
  }

  async findByRestroom(restroomId: string) {
    return this.prisma.incident.findMany({
      where: { restroomId, status: { in: ['OPEN', 'IN_PROGRESS'] } },
      include: INCIDENT_INCLUDE,
      orderBy: { reportedAt: 'asc' },
    });
  }

  async acknowledge(incidentId: string, cleanerIdNumber: string) {
    const cleaner = await this.prisma.user.findFirst({
      where: { idNumber: cleanerIdNumber, isActive: true },
    });
    if (!cleaner) throw new NotFoundException('Cleaner not found');

    const incident = await this.prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: 'IN_PROGRESS',
        acknowledgedAt: new Date(),
        assignedCleanerId: cleaner.id,
        actions: {
          create: {
            actionType: 'ACKNOWLEDGED',
            userId: cleaner.id,
            performedAt: new Date(),
          },
        },
      },
      include: INCIDENT_INCLUDE,
    });

    const orgId = incident.restroom.floor.building.orgId;
    this.events.broadcastToOrg(orgId, 'incident:updated', incident);
    return incident;
  }

  async returnToQueue(incidentId: string, cleanerIdNumber: string) {
    const cleaner = await this.prisma.user.findFirst({
      where: { idNumber: cleanerIdNumber, isActive: true },
    });

    const incident = await this.prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: 'OPEN',
        acknowledgedAt: null,
        assignedCleanerId: null,
        actions: {
          create: {
            actionType: 'ESCALATED',
            userId: cleaner?.id,
            notes: 'הוחזר לתור',
            performedAt: new Date(),
          },
        },
      },
      include: INCIDENT_INCLUDE,
    });

    const orgId = incident.restroom.floor.building.orgId;
    this.events.broadcastToOrg(orgId, 'incident:updated', incident);
    return incident;
  }

  async adminUpdate(incidentId: string, adminUserId: string, dto: { status?: string; assignedCleanerId?: string; note?: string }) {
    const data: any = {};
    if (dto.status) {
      data.status = dto.status;
      if (dto.status === 'IN_PROGRESS') data.acknowledgedAt = new Date();
      if (dto.status === 'RESOLVED') data.resolvedAt = new Date();
    }
    if (dto.assignedCleanerId) data.assignedCleanerId = dto.assignedCleanerId;

    data.actions = {
      create: {
        actionType: 'ACKNOWLEDGED',
        userId: adminUserId,
        notes: dto.note,
        performedAt: new Date(),
      },
    };

    const incident = await this.prisma.incident.update({
      where: { id: incidentId },
      data,
      include: INCIDENT_INCLUDE,
    });

    const orgId = incident.restroom.floor.building.orgId;
    this.events.broadcastToOrg(orgId, 'incident:updated', incident);
    return incident;
  }

  async deleteBulk(orgId: string, scope: 'resolved' | 'older' | 'all', olderThanDays?: number) {
    const baseWhere: any = { restroom: { floor: { building: { orgId } } } };

    let where: any;
    if (scope === 'resolved') {
      where = { ...baseWhere, status: 'RESOLVED' };
    } else if (scope === 'older') {
      const cutoff = new Date(Date.now() - (olderThanDays ?? 30) * 24 * 60 * 60 * 1000);
      where = { ...baseWhere, reportedAt: { lte: cutoff } };
    } else {
      where = baseWhere;
    }

    // Archive stats before deleting
    const toArchive = await this.prisma.incident.findMany({
      where: { ...where, status: 'RESOLVED' },
      select: {
        restroomId: true,
        issueTypeId: true,
        reportedAt: true,
        resolvedAt: true,
        restroom: {
          select: {
            floor: {
              select: {
                buildingId: true,
                building: { select: { orgId: true } },
              },
            },
          },
        },
      },
    });

    // Group by month and upsert stats
    const buckets = new Map<string, {
      orgId: string; buildingId: string; restroomId: string;
      issueTypeId: string; month: Date; total: number;
      resolved: number; totalMinutes: number;
    }>();

    for (const inc of toArchive) {
      const bOrgId = inc.restroom.floor.building.orgId;
      const buildingId = inc.restroom.floor.buildingId;
      const monthStart = new Date(inc.reportedAt.getFullYear(), inc.reportedAt.getMonth(), 1);
      const key = `${bOrgId}|${buildingId}|${inc.restroomId}|${inc.issueTypeId}|${monthStart.toISOString()}`;
      const bucket = buckets.get(key) ?? {
        orgId: bOrgId, buildingId, restroomId: inc.restroomId,
        issueTypeId: inc.issueTypeId, month: monthStart,
        total: 0, resolved: 0, totalMinutes: 0,
      };
      bucket.total++;
      if (inc.resolvedAt) {
        bucket.resolved++;
        bucket.totalMinutes += (inc.resolvedAt.getTime() - inc.reportedAt.getTime()) / 60000;
      }
      buckets.set(key, bucket);
    }

    for (const b of buckets.values()) {
      await this.prisma.monthlyStats.upsert({
        where: {
          orgId_buildingId_restroomId_issueTypeId_month: {
            orgId: b.orgId, buildingId: b.buildingId,
            restroomId: b.restroomId, issueTypeId: b.issueTypeId,
            month: b.month,
          },
        },
        create: {
          orgId: b.orgId, buildingId: b.buildingId,
          restroomId: b.restroomId, issueTypeId: b.issueTypeId,
          month: b.month, totalIncidents: b.total,
          resolvedCount: b.resolved,
          avgResolutionMinutes: b.resolved > 0 ? b.totalMinutes / b.resolved : 0,
        },
        update: {
          totalIncidents: b.total,
          resolvedCount: b.resolved,
          avgResolutionMinutes: b.resolved > 0 ? b.totalMinutes / b.resolved : 0,
        },
      });
    }

    // Delete actions first (FK constraint)
    const incidents = await this.prisma.incident.findMany({ where, select: { id: true } });
    const ids = incidents.map(i => i.id);
    await this.prisma.incidentAction.deleteMany({ where: { incidentId: { in: ids } } });
    const { count } = await this.prisma.incident.deleteMany({ where });
    return { deleted: count, archived: buckets.size };
  }

  async getPositiveFeedback(orgId: string, buildingId?: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const buildingFilter = buildingId
      ? { floor: { buildingId } }
      : { floor: { building: { orgId } } };

    return this.prisma.incident.findMany({
      where: {
        restroom: buildingFilter,
        issueType: { code: 'positive_feedback' },
        reportedAt: { gte: todayStart },
      },
      include: {
        restroom: { include: { floor: { include: { building: true } } } },
        issueType: true,
      },
      orderBy: { reportedAt: 'desc' },
      take: 20,
    });
  }

  async getUrgent(orgId: string) {
    const org = await this.prisma.organization.findUnique({ where: { id: orgId }, select: { settings: true } });
    const s = (org?.settings ?? {}) as any;
    const interval: number = s.cleanerReminderMinutes ?? 5;

    const incidents = await this.prisma.incident.findMany({
      where: {
        restroom: { floor: { building: { orgId } } },
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        reportedAt: { lte: new Date(Date.now() - interval * 60 * 1000) },
      },
      include: INCIDENT_INCLUDE,
      orderBy: { reportedAt: 'asc' },
    });

    return incidents.map(inc => {
      const minutesOpen = Math.floor((Date.now() - inc.reportedAt.getTime()) / 60000);
      const escalationRound = inc.actions.filter(a => a.actionType === 'ESCALATED').length;
      return { ...inc, minutesOpen, escalationRound };
    });
  }

  async resolve(incidentId: string, cleanerIdNumber: string, notes?: string) {
    const cleaner = await this.prisma.user.findFirst({
      where: { idNumber: cleanerIdNumber, isActive: true },
    });
    if (!cleaner) throw new NotFoundException('Cleaner not found');

    // Auto check-in if the cleaner resolved without having checked in
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const activeArrival = await this.prisma.cleanerArrival.findFirst({
      where: { userId: cleaner.id, leftAt: null, arrivedAt: { gte: todayStart } },
    });
    if (!activeArrival) {
      await this.prisma.cleanerArrival.create({
        data: {
          userId: cleaner.id,
          buildingId: cleaner.buildingId ?? undefined,
          arrivedAt: new Date(),
          note: 'auto-checkin',
        },
      });
    }

    // Resolve the primary incident
    const incident = await this.prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        assignedCleanerId: cleaner.id,
        actions: {
          create: {
            actionType: 'RESOLVED',
            userId: cleaner.id,
            notes,
            performedAt: new Date(),
          },
        },
      },
      include: INCIDENT_INCLUDE,
    });

    const orgId = incident.restroom.floor.building.orgId;
    this.events.broadcastToOrg(orgId, 'incident:resolved', incident);
    this.events.broadcastToRestroom(incident.restroomId, 'incident:resolved', incident);

    // Resolve all other open/in-progress incidents of the same type in the same restroom
    const siblings = await this.prisma.incident.findMany({
      where: {
        id: { not: incidentId },
        restroomId: incident.restroomId,
        issueTypeId: incident.issueTypeId,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
      },
      select: { id: true },
    });

    if (siblings.length > 0) {
      const now = new Date();
      for (const sib of siblings) {
        await this.prisma.incident.update({
          where: { id: sib.id },
          data: {
            status: 'RESOLVED',
            resolvedAt: now,
            assignedCleanerId: cleaner.id,
            actions: {
              create: {
                actionType: 'RESOLVED',
                userId: cleaner.id,
                notes: notes ?? 'resolved with parent incident',
                performedAt: now,
              },
            },
          },
        });
      }
      // Broadcast removal of sibling incidents
      const resolved = await this.prisma.incident.findMany({
        where: { id: { in: siblings.map(s => s.id) } },
        include: INCIDENT_INCLUDE,
      });
      for (const r of resolved) {
        this.events.broadcastToOrg(orgId, 'incident:resolved', r);
        this.events.broadcastToRestroom(r.restroomId, 'incident:resolved', r);
      }
    }

    return incident;
  }
}
