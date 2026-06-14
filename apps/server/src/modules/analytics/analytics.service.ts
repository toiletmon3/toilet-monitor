import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Assumed minutes a routine patrol would take to detect/handle an issue.
 * "Time Saved" credits each resolved complaint with the gap between this
 * baseline and the actual response time — i.e. the responsiveness dividend
 * of reactive, targeted cleaning over fixed patrol rounds. Tune as needed.
 */
const BASELINE_PATROL_MIN = 45;

type ScoreTier = 'good' | 'warning' | 'critical';

type ScoredIncident = {
  restroomId: string;
  issueTypeId: string;
  reportedAt: Date;
  resolvedAt: Date | null;
  issueType: { priority: number; code: string; nameI18n: any; icon: string | null } | null;
  restroom: { name: string; floor: { name: string; building: { id: string; name: string } } };
};

type RoomScore = {
  restroomId: string;
  location: string;
  buildingId: string;
  score: number;
  tier: ScoreTier;
  totalIncidents: number;
  avgResolutionMinutes: number;
  deductions: { frequency: number; severity: number; response: number; recurring: number };
};

/** Bucket an issue-type code into the three high-level dashboard categories. */
function classifyIssue(code: string | null | undefined): 'like' | 'maintenance' | 'cleaning' {
  const c = (code ?? '').toLowerCase();
  if (c === 'positive_feedback' || c.includes('feedback') || c.includes('positive')) return 'like';
  if (c.includes('fault') || c.includes('maintenance') || c.includes('repair') || c.includes('broken')) return 'maintenance';
  return 'cleaning';
}

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getSummary(orgId: string, buildingId?: string) {
    const buildingFilter = buildingId
      ? { floor: { buildingId } }
      : { floor: { building: { orgId } } };
    const incidentWhere = { restroom: buildingFilter };

    const [total, resolved, open, inProgress] = await Promise.all([
      this.prisma.incident.count({ where: incidentWhere }),
      this.prisma.incident.count({ where: { ...incidentWhere, status: 'RESOLVED' } }),
      this.prisma.incident.count({ where: { ...incidentWhere, status: 'OPEN' } }),
      this.prisma.incident.count({ where: { ...incidentWhere, status: 'IN_PROGRESS' } }),
    ]);

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
      // Count cleaners currently on shift (checked in today, not yet checked out)
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

    // Breakdown of RESOLVED incidents by issue type (for the overview pie)
    const resolvedIncidentsByType = await this.prisma.incident.findMany({
      where: { ...incidentWhere, status: 'RESOLVED' },
      select: { issueTypeId: true, issueType: { select: { nameI18n: true, icon: true } } },
    });

    const typeMap = new Map<string, { issueTypeId: string; nameI18n: any; icon: string | null; count: number }>();
    for (const inc of resolvedIncidentsByType) {
      const existing = typeMap.get(inc.issueTypeId) ?? {
        issueTypeId: inc.issueTypeId,
        nameI18n: (inc.issueType as any)?.nameI18n ?? { he: inc.issueTypeId },
        icon: (inc.issueType as any)?.icon ?? null,
        count: 0,
      };
      existing.count++;
      typeMap.set(inc.issueTypeId, existing);
    }
    const resolvedByType = [...typeMap.values()].sort((a, b) => b.count - a.count);

    return {
      totalIncidents: total,
      resolvedIncidents: resolved,
      openIncidents: open,
      inProgressIncidents: inProgress,
      avgResolutionMinutes: Math.round(avgMinutes),
      activeCleaners,
      onlineDevices,
      offlineDevicesCount: offlineDevices.length,
      offlineDevices,
      resolvedByType,
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
    return this.getKioskStatsByBuilding(restroomId);
  }

  async getKioskStatsByBuilding(buildingId: string) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const buildingFilter = { restroom: { floor: { buildingId } } };

    const [weeklyCount, dailyCount, resolvedWithTimes] = await Promise.all([
      this.prisma.incident.count({
        where: { ...buildingFilter, reportedAt: { gte: weekAgo } },
      }),
      this.prisma.incident.count({
        where: { ...buildingFilter, reportedAt: { gte: todayStart } },
      }),
      this.prisma.incident.findMany({
        where: {
          ...buildingFilter,
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

  /**
   * Weighted health score per restroom (0-100, higher = BETTER).
   * Internally we compute a 0-100 "badness" from 4 weighted deductions, then
   * the score is `100 - badness`. Deductions:
   *   frequency  40%  — incident count, normalised to the busiest restroom in scope
   *   severity   25%  — average of issueType.priority (1=highest) mapped to 0-1
   *   response   20%  — avg minutes from reportedAt → resolvedAt, clamped at 60 min
   *   recurring  15%  — share of incidents that repeat the same issueType in <24h
   */
  private computeRoomScores(complaints: ScoredIncident[]) {
    type Bucket = { restroomId: string; location: string; buildingId: string; incidents: ScoredIncident[] };
    const byRestroom = new Map<string, Bucket>();
    for (const inc of complaints) {
      const b = byRestroom.get(inc.restroomId) ?? {
        restroomId: inc.restroomId,
        location: [inc.restroom.floor.building.name, inc.restroom.floor.name, inc.restroom.name].filter(Boolean).join(' › '),
        buildingId: inc.restroom.floor.building.id,
        incidents: [] as ScoredIncident[],
      };
      b.incidents.push(inc);
      byRestroom.set(inc.restroomId, b);
    }

    const maxCount = Math.max(1, ...[...byRestroom.values()].map(b => b.incidents.length));
    const scored = new Map<string, RoomScore>();

    for (const b of byRestroom.values()) {
      const count = b.incidents.length;

      // 1) frequency 40%
      const frequency = (count / maxCount) * 40;

      // 2) severity 25% — priority 1=highest → severityNorm=1; priority 5+ → 0
      const severity = (b.incidents.reduce((s, i) => {
        const p = i.issueType?.priority ?? 3;
        return s + Math.max(0, Math.min(1, (5 - p) / 4));
      }, 0) / count) * 25;

      // 3) response 20% — avg resolution minutes, clamped to 60
      const resolved = b.incidents.filter(i => i.resolvedAt);
      const avgMin = resolved.length
        ? resolved.reduce((s, i) => s + (i.resolvedAt!.getTime() - i.reportedAt.getTime()) / 60000, 0) / resolved.length
        : 0;
      const response = Math.min(1, avgMin / 60) * 20;

      // 4) recurring 15% — same issueType within 24h
      const byType = new Map<string, Date[]>();
      for (const i of b.incidents) {
        const arr = byType.get(i.issueTypeId) ?? [];
        arr.push(i.reportedAt);
        byType.set(i.issueTypeId, arr);
      }
      let recurringCount = 0;
      for (const dates of byType.values()) {
        dates.sort((a, b) => a.getTime() - b.getTime());
        for (let i = 1; i < dates.length; i++) {
          if (dates[i].getTime() - dates[i - 1].getTime() < 24 * 60 * 60 * 1000) recurringCount++;
        }
      }
      const recurring = Math.min(1, recurringCount / Math.max(1, count)) * 15;

      const badness = frequency + severity + response + recurring;
      const score = Math.max(0, Math.min(100, Math.round(100 - badness)));
      const tier: ScoreTier = score >= 70 ? 'good' : score >= 40 ? 'warning' : 'critical';

      scored.set(b.restroomId, {
        restroomId: b.restroomId,
        location: b.location,
        buildingId: b.buildingId,
        score,
        tier,
        totalIncidents: count,
        avgResolutionMinutes: Math.round(avgMin),
        // points DEDUCTED from a perfect 100 — the bigger the slice, the more it hurt
        deductions: {
          frequency: Math.round(frequency * 10) / 10,
          severity: Math.round(severity * 10) / 10,
          response: Math.round(response * 10) / 10,
          recurring: Math.round(recurring * 10) / 10,
        },
      });
    }
    return scored;
  }

  private scoreSelect = {
    restroomId: true,
    issueTypeId: true,
    reportedAt: true,
    resolvedAt: true,
    issueType: { select: { priority: true, code: true, nameI18n: true, icon: true } },
    restroom: {
      select: {
        name: true,
        floor: { select: { name: true, building: { select: { id: true, name: true } } } },
      },
    },
  } as const;

  async getRestroomScores(orgId: string, from: Date, to: Date = new Date(), buildingId?: string) {
    const complaints = (await this.prisma.incident.findMany({
      where: {
        restroom: buildingId ? { floor: { buildingId } } : { floor: { building: { orgId } } },
        reportedAt: { gte: from, lte: to },
        issueType: { code: { not: 'positive_feedback' } },
      },
      select: this.scoreSelect,
      orderBy: { reportedAt: 'asc' },
    })) as ScoredIncident[];

    // worst first (ascending score) so problem rooms surface at the top
    return [...this.computeRoomScores(complaints).values()].sort((a, b) => a.score - b.score);
  }

  /**
   * Single aggregated payload for the live Dashboard ("Overview").
   * Returns KPIs for the selected period vs the previous equal-length period,
   * three donut breakdowns, and a per-restroom table with score + arrival + status.
   * `floorId` / `restroomId` further narrow the scope below the building.
   */
  async getOverview(orgId: string, from: Date, to: Date = new Date(), buildingId?: string, floorId?: string, restroomId?: string) {
    const periodMs = Math.max(1, to.getTime() - from.getTime());
    const prevFrom = new Date(from.getTime() - periodMs);
    const restroomFilter = restroomId
      ? { id: restroomId }
      : floorId
        ? { floorId }
        : buildingId
          ? { floor: { buildingId } }
          : { floor: { building: { orgId } } };

    // Fetch everything reported since the previous window opened (covers both periods).
    const all = (await this.prisma.incident.findMany({
      where: { restroom: restroomFilter, reportedAt: { gte: prevFrom, lte: to } },
      select: this.scoreSelect,
      orderBy: { reportedAt: 'asc' },
    })) as ScoredIncident[];

    const inCurrent = (d: Date) => d >= from && d <= to;
    const inPrev = (d: Date) => d >= prevFrom && d < from;
    const isLike = (i: ScoredIncident) => classifyIssue(i.issueType?.code) === 'like';

    const curAll = all.filter(i => inCurrent(i.reportedAt));
    const prevAll = all.filter(i => inPrev(i.reportedAt));
    const curComplaints = curAll.filter(i => !isLike(i));
    const prevComplaints = prevAll.filter(i => !isLike(i));

    const periodKpis = (complaints: ScoredIncident[]) => {
      const scores = [...this.computeRoomScores(complaints).values()];
      const avgScore = scores.length ? Math.round(scores.reduce((s, r) => s + r.score, 0) / scores.length) : 100;
      const resolved = complaints.filter(i => i.resolvedAt);
      const avgResponse = resolved.length
        ? Math.round(resolved.reduce((s, i) => s + (i.resolvedAt!.getTime() - i.reportedAt.getTime()) / 60000, 0) / resolved.length)
        : 0;
      const timeSavedH = Math.round(
        resolved.reduce((s, i) => s + Math.max(0, BASELINE_PATROL_MIN - (i.resolvedAt!.getTime() - i.reportedAt.getTime()) / 60000), 0) / 60 * 10,
      ) / 10;
      return { avgScore, complaints: complaints.length, avgResponse, timeSavedH };
    };

    const cur = periodKpis(curComplaints);
    const prev = periodKpis(prevComplaints);

    // Daily sparkline series for a complaint list over an explicit set of UTC day keys.
    const dayMs = 24 * 60 * 60 * 1000;
    const dayOf = (d: Date) => d.toISOString().slice(0, 10);
    const dayKeysBetween = (a: Date, b: Date) => {
      const keys: string[] = [];
      const start = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate());
      for (let t = start; t <= b.getTime(); t += dayMs) keys.push(new Date(t).toISOString().slice(0, 10));
      return keys;
    };
    const buildSpark = (complaints: ScoredIncident[], keys: string[]) => {
      const out = { avgScore: [] as number[], complaints: [] as number[], avgResponse: [] as number[], timeSaved: [] as number[] };
      for (const key of keys) {
        const day = complaints.filter(i => dayOf(i.reportedAt) === key);
        const dayScores = [...this.computeRoomScores(day).values()];
        out.avgScore.push(dayScores.length ? Math.round(dayScores.reduce((s, r) => s + r.score, 0) / dayScores.length) : 100);
        out.complaints.push(day.length);
        const dayResolved = day.filter(i => i.resolvedAt);
        out.avgResponse.push(dayResolved.length
          ? Math.round(dayResolved.reduce((s, i) => s + (i.resolvedAt!.getTime() - i.reportedAt.getTime()) / 60000, 0) / dayResolved.length)
          : 0);
        out.timeSaved.push(Math.round(
          dayResolved.reduce((s, i) => s + Math.max(0, BASELINE_PATROL_MIN - (i.resolvedAt!.getTime() - i.reportedAt.getTime()) / 60000), 0) / 60 * 10,
        ) / 10);
      }
      return out;
    };

    const curSpark = buildSpark(curComplaints, dayKeysBetween(from, to));
    const prevSpark = buildSpark(prevComplaints, dayKeysBetween(prevFrom, from));

    const trend = (now: number, before: number, higherIsBetter: boolean) => {
      const diff = now - before;
      const pct = before === 0 ? (now === 0 ? 0 : 100) : Math.round((diff / before) * 100);
      const dir: 'up' | 'down' | 'flat' = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
      const good = diff === 0 ? true : higherIsBetter ? diff > 0 : diff < 0;
      return { dir, pct, good };
    };

    // Two KPI rows: `previous` = baseline period, `current` = selected range (with trend vs previous).
    const kpis = {
      previous: {
        from: prevFrom, to: from,
        avgScore:     { value: prev.avgScore,    spark: prevSpark.avgScore },
        complaints:   { value: prev.complaints,  spark: prevSpark.complaints },
        responseTime: { value: prev.avgResponse, spark: prevSpark.avgResponse },
        timeSaved:    { value: prev.timeSavedH,  spark: prevSpark.timeSaved },
      },
      current: {
        from, to,
        avgScore:     { value: cur.avgScore,    spark: curSpark.avgScore,    trend: trend(cur.avgScore, prev.avgScore, true) },
        complaints:   { value: cur.complaints,  spark: curSpark.complaints,  trend: trend(cur.complaints, prev.complaints, false) },
        responseTime: { value: cur.avgResponse, spark: curSpark.avgResponse, trend: trend(cur.avgResponse, prev.avgResponse, false) },
        timeSaved:    { value: cur.timeSavedH,  spark: curSpark.timeSaved,   trend: trend(cur.timeSavedH, prev.timeSavedH, true) },
      },
    };

    // ── Donut breakdowns (current period) ──
    const likeCount = curAll.filter(isLike).length;
    const cleaningComplaints = curComplaints.filter(i => classifyIssue(i.issueType?.code) === 'cleaning');
    const maintenanceComplaints = curComplaints.filter(i => classifyIssue(i.issueType?.code) === 'maintenance');

    const general = [
      { key: 'like', count: likeCount },
      { key: 'cleaning', count: cleaningComplaints.length },
      { key: 'maintenance', count: maintenanceComplaints.length },
    ].filter(d => d.count > 0);

    const groupByType = (list: ScoredIncident[]) => {
      const m = new Map<string, { issueTypeId: string; code: string | null; nameI18n: any; icon: string | null; count: number }>();
      for (const i of list) {
        const e = m.get(i.issueTypeId) ?? {
          issueTypeId: i.issueTypeId,
          code: (i.issueType as any)?.code ?? null,
          nameI18n: (i.issueType as any)?.nameI18n ?? { he: i.issueTypeId },
          icon: (i.issueType as any)?.icon ?? null,
          count: 0,
        };
        e.count++;
        m.set(i.issueTypeId, e);
      }
      return [...m.values()].sort((a, b) => b.count - a.count);
    };

    // ── Rooms table — list ALL active restrooms, merge in scores/arrivals/status ──
    const [restrooms, openIncidents, arrivals] = await Promise.all([
      this.prisma.restroom.findMany({
        where: restroomFilter as any,
        select: { id: true, name: true, floor: { select: { name: true, building: { select: { id: true, name: true } } } } },
      }),
      this.prisma.incident.groupBy({
        by: ['restroomId'],
        where: { restroom: restroomFilter, status: { in: ['OPEN', 'IN_PROGRESS'] } },
        _count: { id: true },
      }),
      this.prisma.cleanerArrival.findMany({
        where: { restroomId: { not: null }, user: { orgId }, arrivedAt: { gte: from, lte: to } },
        select: { restroomId: true, arrivedAt: true, user: { select: { role: true } } },
        orderBy: { arrivedAt: 'desc' },
      }),
    ]);

    const curScores = this.computeRoomScores(curComplaints);
    const prevScores = this.computeRoomScores(prevComplaints);
    const openByRoom = new Map(openIncidents.map(o => [o.restroomId, o._count.id]));
    const arrivalByRoom = new Map<string, { last: Date; count: number; cleaners: number; supervisors: number }>();
    for (const a of arrivals) {
      if (!a.restroomId) continue;
      const e = arrivalByRoom.get(a.restroomId) ?? { last: a.arrivedAt, count: 0, cleaners: 0, supervisors: 0 };
      if (a.arrivedAt > e.last) e.last = a.arrivedAt;
      e.count++;
      if (a.user?.role === 'SHIFT_SUPERVISOR') e.supervisors++;
      else if (a.user?.role === 'CLEANER') e.cleaners++;
      arrivalByRoom.set(a.restroomId, e);
    }

    const rooms = restrooms.map(r => {
      const sc = curScores.get(r.id);
      const score = sc?.score ?? 100;
      const tier: ScoreTier = sc?.tier ?? 'good';
      const prevScore = prevScores.get(r.id)?.score ?? 100;
      const arr = arrivalByRoom.get(r.id);
      return {
        restroomId: r.id,
        location: [r.floor.building.name, r.floor.name, r.name].filter(Boolean).join(' › '),
        buildingId: r.floor.building.id,
        score,
        tier,
        trend: trend(score, prevScore, true).dir,
        totalIncidents: sc?.totalIncidents ?? 0,
        avgResolutionMinutes: sc?.avgResolutionMinutes ?? 0,
        status: (openByRoom.get(r.id) ?? 0) > 0 ? 'attention' : 'ok',
        lastArrival: arr?.last ?? null,
        arrivalCount: arr?.count ?? 0,
      };
    }).sort((a, b) => a.score - b.score);

    // ── Glance (slide 6): bigger KPI row + per-day score/complaint series + top complaint ──
    const visits = curAll.length; // total kiosk interactions (complaints + positive feedback)
    const complaintRate = visits > 0 ? Math.round((curComplaints.length / visits) * 100 * 10) / 10 : 0;
    const satisfactionPct = visits > 0 ? Math.round((likeCount / visits) * 100 * 10) / 10 : 0;

    const dailySeries = dayKeysBetween(from, to).map(key => {
      const day = curComplaints.filter(i => dayOf(i.reportedAt) === key);
      const dayScores = [...this.computeRoomScores(day).values()];
      const avgScore = dayScores.length ? Math.round(dayScores.reduce((s, r) => s + r.score, 0) / dayScores.length) : 100;
      const tier: ScoreTier = avgScore >= 70 ? 'good' : avgScore >= 40 ? 'warning' : 'critical';
      return { date: key, avgScore, complaints: day.length, tier };
    });

    const cleaningTop = groupByType(cleaningComplaints);
    const topComplaint = cleaningTop[0]
      ? { icon: cleaningTop[0].icon, nameI18n: cleaningTop[0].nameI18n, count: cleaningTop[0].count, percent: Math.round((cleaningTop[0].count / Math.max(1, curComplaints.length)) * 100) }
      : null;

    const glance = { visits, complaintRate, satisfactionPct, dailySeries, topComplaint };

    // ── Deep Dive (slide 8): per-room wide table ──
    const deepDive = rooms.map(r => {
      const roomIncidents = curAll.filter(i => i.restroomId === r.restroomId);
      const roomComplaints = roomIncidents.filter(i => !isLike(i));
      const roomPositive = roomIncidents.length - roomComplaints.length;
      const byType = new Map<string, { icon: string | null; nameI18n: any; count: number }>();
      for (const i of roomComplaints) {
        const k = i.issueTypeId;
        const e = byType.get(k) ?? { icon: i.issueType?.icon ?? null, nameI18n: i.issueType?.nameI18n ?? { he: k }, count: 0 };
        e.count++;
        byType.set(k, e);
      }
      const top = [...byType.values()].sort((a, b) => b.count - a.count)[0];
      const arr = arrivalByRoom.get(r.restroomId);
      const satisfaction = roomIncidents.length > 0 ? Math.round((roomPositive / roomIncidents.length) * 100) : 0;
      return {
        restroomId: r.restroomId,
        location: r.location,
        buildingId: r.buildingId,
        visits: roomIncidents.length,
        complaints: roomComplaints.length,
        topComplaint: top
          ? { icon: top.icon, nameI18n: top.nameI18n, count: top.count, percent: Math.round((top.count / Math.max(1, roomComplaints.length)) * 100) }
          : null,
        cleanerArrivals: arr?.cleaners ?? 0,
        supervisorArrivals: arr?.supervisors ?? 0,
        avgResponseMinutes: r.avgResolutionMinutes,
        satisfactionPct: satisfaction,
        score: r.score,
        tier: r.tier,
      };
    });

    return {
      range: { from, to, prevFrom, prevTo: from },
      baselinePatrolMinutes: BASELINE_PATROL_MIN,
      kpis,
      donuts: {
        general,
        cleaning: groupByType(cleaningComplaints),
        maintenance: groupByType(maintenanceComplaints),
      },
      glance,
      deepDive,
      roomCount: rooms.length,
      rooms,
    };
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
