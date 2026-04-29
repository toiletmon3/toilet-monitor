import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getSummary(orgId: string, buildingId?: string) {
    const buildingFilter = buildingId
      ? { floor: { buildingId } }
      : { floor: { building: { orgId } } };
    const incidentWhere = { restroom: buildingFilter };

    const archiveWhere = buildingId
      ? { orgId, buildingId }
      : { orgId };

    const [total, resolved, open, inProgress, archivedStats] = await Promise.all([
      this.prisma.incident.count({ where: incidentWhere }),
      this.prisma.incident.count({ where: { ...incidentWhere, status: 'RESOLVED' } }),
      this.prisma.incident.count({ where: { ...incidentWhere, status: 'OPEN' } }),
      this.prisma.incident.count({ where: { ...incidentWhere, status: 'IN_PROGRESS' } }),
      this.prisma.monthlyStats.aggregate({
        where: { ...archiveWhere, issueTypeId: { not: '_all' } },
        _sum: { totalIncidents: true, resolvedCount: true },
      }),
    ]);

    const archivedTotal = archivedStats._sum.totalIncidents ?? 0;
    const archivedResolved = archivedStats._sum.resolvedCount ?? 0;

    const resolved30d = await this.prisma.incident.findMany({
      where: {
        ...incidentWhere,
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

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [activeCleaners, onlineDevices, offlineDevicesList] = await Promise.all([
      this.prisma.cleanerArrival.count({
        where: {
          user: { orgId },
          arrivedAt: { gte: todayStart },
          leftAt: null,
          ...(buildingId ? { buildingId } : {}),
        },
      }),
      this.prisma.device.count({
        where: { restroom: buildingFilter, isOnline: true },
      }),
      this.prisma.device.findMany({
        where: { restroom: buildingFilter, isOnline: false },
        select: {
          id: true,
          deviceCode: true,
          lastHeartbeat: true,
          restroom: {
            select: {
              name: true,
              floor: {
                select: { name: true, building: { select: { id: true, name: true } } },
              },
            },
          },
        },
        orderBy: { lastHeartbeat: 'desc' },
      }),
    ]);

    const offlineDevices = offlineDevicesList.map(d => ({
      id: d.id,
      deviceCode: d.deviceCode,
      lastHeartbeat: d.lastHeartbeat,
      buildingId: d.restroom.floor.building.id,
      buildingName: d.restroom.floor.building.name,
      floorName: d.restroom.floor.name,
      restroomName: d.restroom.name,
    }));

    return {
      totalIncidents: total + archivedTotal,
      resolvedIncidents: resolved + archivedResolved,
      openIncidents: open,
      inProgressIncidents: inProgress,
      avgResolutionMinutes: Math.round(avgMinutes),
      activeCleaners,
      onlineDevices,
      offlineDevicesCount: offlineDevices.length,
      offlineDevices,
    };
  }

  async getIssueFrequency(orgId: string, from: Date, to: Date = new Date()) {
    const incidents = await this.prisma.incident.findMany({
      where: {
        restroom: { floor: { building: { orgId } } },
        reportedAt: { gte: from, lte: to },
      },
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

  async getHourlyStats(orgId: string, from: Date, to: Date = new Date()) {
    const incidents = await this.prisma.incident.findMany({
      where: {
        restroom: { floor: { building: { orgId } } },
        reportedAt: { gte: from, lte: to },
      },
      select: { reportedAt: true },
    });

    const hours = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
    for (const inc of incidents) {
      hours[inc.reportedAt.getHours()].count++;
    }
    return hours;
  }

  async getFloorHeatmap(orgId: string, from: Date, to: Date = new Date()) {
    return this.prisma.incident.groupBy({
      by: ['restroomId'],
      where: {
        restroom: { floor: { building: { orgId } } },
        reportedAt: { gte: from, lte: to },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
    });
  }

  async getSlaStats(orgId: string, from: Date, to: Date = new Date(), targetMinutes = 15) {
    const resolved = await this.prisma.incident.findMany({
      where: {
        restroom: { floor: { building: { orgId } } },
        status: 'RESOLVED',
        resolvedAt: { not: null },
        reportedAt: { gte: from, lte: to },
      },
      select: { reportedAt: true, resolvedAt: true, acknowledgedAt: true },
    });

    if (resolved.length === 0) return { totalResolved: 0, withinSla: 0, slaPercent: 0, avgMinutes: 0, targetMinutes };

    const times = resolved
      .map(i => (i.resolvedAt!.getTime() - i.reportedAt.getTime()) / 60000)
      .sort((a, b) => a - b);

    const withinSla = times.filter(t => t <= targetMinutes).length;
    const avgMinutes = Math.round(times.reduce((s, t) => s + t, 0) / times.length);
    const p50 = Math.round(times[Math.floor(times.length * 0.5)]);
    const p90 = Math.round(times[Math.floor(times.length * 0.9)]);

    return {
      totalResolved: resolved.length,
      withinSla,
      slaPercent: Math.round((withinSla / resolved.length) * 100),
      avgMinutes,
      p50,
      p90,
      targetMinutes,
    };
  }

  async getDayOfWeekStats(orgId: string, from: Date, to: Date = new Date()) {
    const incidents = await this.prisma.incident.findMany({
      where: { restroom: { floor: { building: { orgId } } }, reportedAt: { gte: from, lte: to } },
      select: { reportedAt: true },
    });

    const DAY_NAMES_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
    const DAY_NAMES_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const counts = Array.from({ length: 7 }, (_, i) => ({ dayHe: DAY_NAMES_HE[i], dayEn: DAY_NAMES_EN[i], count: 0 }));
    for (const inc of incidents) counts[inc.reportedAt.getDay()].count++;
    return counts;
  }

  async getPatterns(orgId: string, from: Date, to: Date = new Date()) {
    const incidents = await this.prisma.incident.findMany({
      where: { restroom: { floor: { building: { orgId } } }, reportedAt: { gte: from, lte: to } },
      select: {
        issueTypeId: true,
        issueType: { select: { nameI18n: true, icon: true } },
        restroomId: true,
        restroom: {
          select: {
            name: true,
            floor: { select: { name: true, building: { select: { name: true } } } },
          },
        },
        reportedAt: true,
      },
    });

    // Top repeating issue types
    const issueMap = new Map<string, { icon: string; nameI18n: { he?: string; en?: string }; count: number }>();
    for (const inc of incidents) {
      const key = inc.issueTypeId;
      const existing = issueMap.get(key) ?? {
        icon: (inc.issueType as any).icon ?? '⚠️',
        nameI18n: (inc.issueType as any).nameI18n ?? { he: key },
        count: 0,
      };
      existing.count++;
      issueMap.set(key, existing);
    }
    const topIssues = [...issueMap.values()].sort((a, b) => b.count - a.count).slice(0, 5);
    const avgPerIssue = incidents.length / Math.max(issueMap.size, 1);

    // Top hotspot restrooms
    const restroomMap = new Map<string, { location: string; count: number }>();
    for (const inc of incidents) {
      const key = inc.restroomId;
      const location = [inc.restroom.floor.building.name, inc.restroom.floor.name, inc.restroom.name].filter(Boolean).join(' › ');
      const existing = restroomMap.get(key) ?? { location, count: 0 };
      existing.count++;
      restroomMap.set(key, existing);
    }
    const hotspots = [...restroomMap.values()].sort((a, b) => b.count - a.count).slice(0, 5);

    return {
      topIssues: topIssues.map(i => ({ ...i, aboveAvg: i.count > avgPerIssue * 1.5 })),
      hotspots,
      totalIncidents: incidents.length,
      avgPerIssue: Math.round(avgPerIssue),
    };
  }

  async getKioskStats(restroomId: string) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [weeklyCount, dailyCount, resolvedWithTimes] = await Promise.all([
      this.prisma.incident.count({
        where: { restroomId, reportedAt: { gte: weekAgo } },
      }),
      this.prisma.incident.count({
        where: { restroomId, reportedAt: { gte: todayStart } },
      }),
      this.prisma.incident.findMany({
        where: {
          restroomId,
          status: 'RESOLVED',
          resolvedAt: { not: null },
          reportedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        select: { reportedAt: true, resolvedAt: true },
      }),
    ]);

    const avgResponseMinutes = resolvedWithTimes.length > 0
      ? resolvedWithTimes.reduce((sum, i) => {
          return sum + (i.resolvedAt!.getTime() - i.reportedAt.getTime()) / 60000;
        }, 0) / resolvedWithTimes.length
      : null;

    return {
      weeklyReports: weeklyCount,
      dailyReports: dailyCount,
      avgResponseMinutes: avgResponseMinutes !== null ? Math.round(avgResponseMinutes) : null,
    };
  }

  async getHistoricalTrends(orgId: string, from: Date, to: Date = new Date(), buildingId?: string) {
    const where: any = { orgId, month: { gte: from, lte: to }, issueTypeId: { not: '_all' } };
    if (buildingId) where.buildingId = buildingId;

    const archived = await this.prisma.monthlyStats.findMany({
      where,
      orderBy: { month: 'asc' },
    });

    // Group by month across all dimensions
    const monthMap = new Map<string, {
      month: string;
      totalIncidents: number;
      resolvedCount: number;
      avgResolutionMinutes: number;
      totalArrivals: number;
      resolvedMinutesWeighted: number;
    }>();

    for (const row of archived) {
      const key = row.month.toISOString().slice(0, 7);
      const existing = monthMap.get(key) ?? {
        month: key,
        totalIncidents: 0,
        resolvedCount: 0,
        avgResolutionMinutes: 0,
        totalArrivals: 0,
        resolvedMinutesWeighted: 0,
      };
      existing.totalIncidents += row.totalIncidents;
      existing.resolvedCount += row.resolvedCount;
      existing.resolvedMinutesWeighted += row.avgResolutionMinutes * row.resolvedCount;
      existing.totalArrivals += row.totalArrivals;
      monthMap.set(key, existing);
    }

    // Also include live data for the current period
    const liveIncidents = await this.prisma.incident.findMany({
      where: {
        restroom: { floor: { building: buildingId ? { id: buildingId } : { orgId } } },
        reportedAt: { gte: from, lte: to },
      },
      select: { reportedAt: true, resolvedAt: true, status: true },
    });

    for (const inc of liveIncidents) {
      const key = `${inc.reportedAt.getFullYear()}-${String(inc.reportedAt.getMonth() + 1).padStart(2, '0')}`;
      const existing = monthMap.get(key) ?? {
        month: key,
        totalIncidents: 0,
        resolvedCount: 0,
        avgResolutionMinutes: 0,
        totalArrivals: 0,
        resolvedMinutesWeighted: 0,
      };
      existing.totalIncidents++;
      if (inc.status === 'RESOLVED' && inc.resolvedAt) {
        existing.resolvedCount++;
        existing.resolvedMinutesWeighted += (inc.resolvedAt.getTime() - inc.reportedAt.getTime()) / 60000;
      }
      monthMap.set(key, existing);
    }

    return Array.from(monthMap.values())
      .map(m => ({
        month: m.month,
        totalIncidents: m.totalIncidents,
        resolvedCount: m.resolvedCount,
        avgResolutionMinutes: m.resolvedCount > 0 ? Math.round(m.resolvedMinutesWeighted / m.resolvedCount) : 0,
        totalArrivals: m.totalArrivals,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
  }

  async getCleanerPerformance(orgId: string, from: Date, to: Date = new Date()) {
    const cleaners = await this.prisma.user.findMany({
      where: { orgId, role: 'CLEANER', isActive: true },
      select: {
        id: true, name: true, idNumber: true,
        incidentActions: {
          where: { actionType: 'RESOLVED', performedAt: { gte: from, lte: to } },
          select: { performedAt: true },
        },
        assignedIncidents: {
          where: { reportedAt: { gte: from, lte: to } },
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
