import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
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

    // Rate limiting: prevent duplicate reports per issue type per restroom within 5 min
    const recentSame = await this.prisma.incident.findFirst({
      where: {
        restroomId: dto.restroomId,
        issueTypeId: dto.issueTypeId,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        reportedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
      },
    });
    if (recentSame) {
      throw new ConflictException('A recent report for this issue already exists');
    }

    const incident = await this.prisma.incident.create({
      data: {
        clientId: dto.clientId,
        restroomId: dto.restroomId,
        issueTypeId: dto.issueTypeId,
        deviceId: dto.deviceId,
        reportedAt: new Date(dto.reportedAt),
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
    this.events.broadcastToOrg(orgId, 'incident:created', incident);
    this.events.broadcastToRestroom(dto.restroomId, 'incident:created', incident);

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

  async resolve(incidentId: string, cleanerIdNumber: string, notes?: string) {
    const cleaner = await this.prisma.user.findFirst({
      where: { idNumber: cleanerIdNumber, isActive: true },
    });
    if (!cleaner) throw new NotFoundException('Cleaner not found');

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
    return incident;
  }
}
