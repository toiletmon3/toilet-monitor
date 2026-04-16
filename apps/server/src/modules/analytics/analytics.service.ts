import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getSummary(orgId: string) {
    const [total, resolved, open, inProgress] = await Promise.all([
      this.prisma.incident.count({ where: { restroom: { floor: { building: { orgId } } } } }),
      this.prisma.incident.count({ where: { restroom: { floor: { building: { orgId } } }, status: 'RESOLVED' } }),
      this.prisma.incident.count({ where: { restroom: { floor: { building: { orgId } } }, status: 'OPEN' } }),
      this.prisma.incident.count({ where: { restroom: { floor: { building: { orgId } } }, status: 'IN_PROGRESS' } }),
    ]);

    const resolved30d = await this.prisma.incident.findMany({
      where: {
        restroom: { floor: { building: { orgId } } },
        status: 'RESOLVED',
        resolvedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      select: { reportedAt: true, resolvedAt: true },
    });

    const avgMinutes = resolved30d.length > 0
      ? resolved30d.reduce((sum, i) => {
          const diff = (i.resolvedAt!.getTime() - i.reportedAt.getTime()) / 60000;
          return sum + diff;
        }, 0) / resolved30d.length
      : 0;

    const [activeCleaners, onlineDevices] = await Promise.all([
      this.prisma.user.count({
        where: { orgId, role: 'CLEANER', isActive: true },
      }),
      this.prisma.device.count({
        where: { restroom: { floor: { building: { orgId } } }, isOnline: true },
      }),
    ]);

    return {
      totalIncidents: total,
      resolvedIncidents: resolved,
      openIncidents: open,
      inProgressIncidents: inProgress,
      avgResolutionMinutes: Math.round(avgMinutes),
      activeCleaners,
      onlineDevices,
    };
  }

  async getIssueFrequency(orgId: string, days = 30) {
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const incidents = await this.prisma.incident.findMany({
      where: {
        restroom: { floor: { building: { orgId } } },
        reportedAt: { gte: from },
      },
      include: { issueType: true },
      select: { issueTypeId: true, issueType: true, reportedAt: true, resolvedAt: true },
    });

    const map = new Map<string, { name: string; count: number; totalMinutes: number }>();
    for (const inc of incidents) {
      const existing = map.get(inc.issueTypeId) ?? {
        name: (inc.issueType as any).nameI18n,
        count: 0,
        totalMinutes: 0,
      };
      existing.count++;
      if ((inc as any).resolvedAt) {
        existing.totalMinutes += ((inc as any).resolvedAt.getTime() - inc.reportedAt.getTime()) / 60000;
      }
      map.set(inc.issueTypeId, existing);
    }

    return Array.from(map.entries()).map(([id, data]) => ({
      issueTypeId: id,
      nameI18n: data.name,
      count: data.count,
      avgResolutionMinutes: data.count > 0 ? Math.round(data.totalMinutes / data.count) : 0,
    })).sort((a, b) => b.count - a.count);
  }

  async getHourlyStats(orgId: string, days = 7) {
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const incidents = await this.prisma.incident.findMany({
      where: {
        restroom: { floor: { building: { orgId } } },
        reportedAt: { gte: from },
      },
      select: { reportedAt: true },
    });

    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
    for (const inc of incidents) {
      hours[inc.reportedAt.getHours()].count++;
    }
    return hours;
  }

  async getFloorHeatmap(orgId: string, days = 30) {
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return this.prisma.incident.groupBy({
      by: ['restroomId'],
      where: {
        restroom: { floor: { building: { orgId } } },
        reportedAt: { gte: from },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
  }

  async getCleanerPerformance(orgId: string, days = 30) {
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const cleaners = await this.prisma.user.findMany({
      where: { orgId, role: 'CLEANER', isActive: true },
      select: {
        id: true, name: true, idNumber: true,
        incidentActions: {
          where: { actionType: 'RESOLVED', performedAt: { gte: from } },
          select: { performedAt: true },
        },
        assignedIncidents: {
          where: { reportedAt: { gte: from } },
          select: { reportedAt: true, resolvedAt: true, status: true },
        },
      },
    });

    return cleaners.map((c) => ({
      id: c.id,
      name: c.name,
      idNumber: c.idNumber,
      totalResolved: c.incidentActions.length,
      avgResolutionMinutes: c.assignedIncidents
        .filter((i) => i.resolvedAt)
        .reduce((sum, i, _, arr) => {
          return sum + (i.resolvedAt!.getTime() - i.reportedAt.getTime()) / 60000 / arr.length;
        }, 0),
    })).sort((a, b) => b.totalResolved - a.totalResolved);
  }
}
