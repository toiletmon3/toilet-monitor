import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from './email.service';
import { buildDailyReportHtml, DailyReportData } from './daily-report.template';
import { getReportStrings } from './daily-report.i18n';
import { translateLocationPath } from '../../common/locale/translate-name';

const DEFAULT_REPORT_HOUR = 8;
const DEFAULT_TZ = 'Asia/Jerusalem';

@Injectable()
export class DailyReportService {
  private readonly logger = new Logger(DailyReportService.name);
  private readonly sentDates = new Map<string, string>();

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
  ) {}

  @Cron('0 * * * *')
  async handleCron() {
    const orgs = await this.prisma.organization.findMany({
      select: { id: true, name: true, settings: true },
    });

    for (const org of orgs) {
      try {
        await this.processOrg(org);
      } catch (err) {
        this.logger.error(`Daily report failed for org ${org.id}: ${err}`);
      }
    }
  }

  async sendNow(orgId: string): Promise<{ sent: boolean; recipients: string[] }> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true },
    });
    if (!org) return { sent: false, recipients: [] };

    const admins = await this.prisma.user.findMany({
      where: {
        orgId: org.id,
        role: { in: ['ORG_ADMIN', 'SUPER_ADMIN', 'MANAGER'] },
        isActive: true,
        email: { not: null },
      },
      select: { email: true, preferredLang: true },
    });
    const recipients = admins.filter(a => a.email);
    if (recipients.length === 0) return { sent: false, recipients: [] };

    const data = await this.gatherYesterdayData(org.id, org.name);
    const sentTo: string[] = [];
    for (const r of recipients) {
      const html = buildDailyReportHtml(this.localizeData(data, r.preferredLang), r.preferredLang);
      const s = getReportStrings(r.preferredLang);
      const subject = `${s.subjectPrefix} — ${org.name} — ${this.formatDate(data._yesterdayStart, s.dateLocale)}`;
      const ok = await this.email.send([r.email!], subject, html);
      if (ok) sentTo.push(r.email!);
    }
    return { sent: sentTo.length > 0, recipients: sentTo };
  }

  /**
   * Backward-compatible single-render report (used by /api/email/generate-report cron endpoint).
   * Renders in Hebrew by default; per-recipient localization is handled in sendNow/processOrg.
   */
  async generateReport(orgId: string): Promise<{ html: string; subject: string; recipients: string[] } | null> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, settings: true },
    });
    if (!org) return null;

    const admins = await this.prisma.user.findMany({
      where: {
        orgId: org.id,
        role: { in: ['ORG_ADMIN', 'SUPER_ADMIN', 'MANAGER'] },
        isActive: true,
        email: { not: null },
      },
      select: { email: true },
    });
    const emails = admins.map(a => a.email!).filter(Boolean);
    if (emails.length === 0) return null;

    const data = await this.gatherYesterdayData(org.id, org.name);
    const html = buildDailyReportHtml(this.localizeData(data, 'he'), 'he');
    const s = getReportStrings('he');
    const subject = `${s.subjectPrefix} — ${org.name} — ${this.formatDate(data._yesterdayStart, s.dateLocale)}`;

    return { html, subject, recipients: emails };
  }

  private async processOrg(org: { id: string; name: string; settings: any }) {
    const settings = (org.settings ?? {}) as Record<string, any>;
    if (settings.dailyReportEnabled === false) return;
    const reportHour = settings.dailyReportHour ?? DEFAULT_REPORT_HOUR;

    const now = new Date();
    const nowInTz = new Date(now.toLocaleString('en-US', { timeZone: DEFAULT_TZ }));
    const currentHour = nowInTz.getHours();

    if (currentHour !== reportHour) return;

    const todayKey = nowInTz.toISOString().slice(0, 10);
    const sentKey = `${org.id}:${todayKey}`;
    if (this.sentDates.has(sentKey)) return;

    const admins = await this.prisma.user.findMany({
      where: {
        orgId: org.id,
        role: { in: ['ORG_ADMIN', 'SUPER_ADMIN', 'MANAGER'] },
        isActive: true,
        email: { not: null },
      },
      select: { email: true, preferredLang: true },
    });

    const recipients = admins.filter(a => a.email);
    if (recipients.length === 0) {
      this.logger.warn(`Org ${org.name}: no admin emails, skipping daily report`);
      this.sentDates.set(sentKey, 'skipped');
      return;
    }

    const data = await this.gatherYesterdayData(org.id, org.name);

    let sentCount = 0;
    for (const r of recipients) {
      const html = buildDailyReportHtml(this.localizeData(data, r.preferredLang), r.preferredLang);
      const s = getReportStrings(r.preferredLang);
      const subject = `${s.subjectPrefix} — ${org.name} — ${this.formatDate(data._yesterdayStart, s.dateLocale)}`;
      const ok = await this.email.send([r.email!], subject, html);
      if (ok) sentCount++;
    }
    if (sentCount > 0) {
      this.sentDates.set(sentKey, 'sent');
      this.logger.log(`Daily report sent for ${org.name} to ${sentCount}/${recipients.length} recipient(s)`);
    }
  }

  private localizeData(data: DailyReportData & { _yesterdayStart: Date }, lang: string): DailyReportData {
    const s = getReportStrings(lang);
    return {
      ...data,
      date: this.formatDate(data._yesterdayStart, s.dateLocale),
      hotspots: data.hotspots.map(h => ({ ...h, location: translateLocationPath(h.location, lang) })),
    };
  }

  private formatDate(d: Date, locale: string): string {
    return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  private async gatherYesterdayData(orgId: string, orgName: string): Promise<DailyReportData & { _yesterdayStart: Date }> {
    const now = new Date();
    const yesterdayEnd = new Date(now.toLocaleString('en-US', { timeZone: DEFAULT_TZ }));
    yesterdayEnd.setHours(0, 0, 0, 0);
    const yesterdayStart = new Date(yesterdayEnd);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);

    const tzOffset = yesterdayStart.getTime() - new Date(yesterdayStart.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
    const from = new Date(yesterdayStart.getTime() - tzOffset);
    const to = new Date(yesterdayEnd.getTime() - tzOffset);

    const orgFilter = { restroom: { floor: { building: { orgId } } } };
    const dateFilter = { reportedAt: { gte: from, lt: to } };

    const [total, resolved, open, inProgress] = await Promise.all([
      this.prisma.incident.count({ where: { ...orgFilter, ...dateFilter } }),
      this.prisma.incident.count({ where: { ...orgFilter, ...dateFilter, status: 'RESOLVED' } }),
      this.prisma.incident.count({ where: { ...orgFilter, ...dateFilter, status: 'OPEN' } }),
      this.prisma.incident.count({ where: { ...orgFilter, ...dateFilter, status: 'IN_PROGRESS' } }),
    ]);

    const resolvedIncidents = await this.prisma.incident.findMany({
      where: { ...orgFilter, ...dateFilter, status: 'RESOLVED', resolvedAt: { not: null } },
      select: { reportedAt: true, resolvedAt: true },
    });

    const avgMinutes = resolvedIncidents.length > 0
      ? Math.round(resolvedIncidents.reduce((s, i) =>
          s + (i.resolvedAt!.getTime() - i.reportedAt.getTime()) / 60000, 0) / resolvedIncidents.length)
      : 0;

    const slaTarget = 15;
    const withinSla = resolvedIncidents.filter(i =>
      (i.resolvedAt!.getTime() - i.reportedAt.getTime()) / 60000 <= slaTarget).length;
    const slaPercent = resolvedIncidents.length > 0
      ? Math.round((withinSla / resolvedIncidents.length) * 100) : 0;

    const issueIncidents = await this.prisma.incident.findMany({
      where: { ...orgFilter, ...dateFilter },
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
      },
    });

    const issueMap = new Map<string, { icon: string; name: string; count: number }>();
    const restroomMap = new Map<string, { location: string; count: number }>();

    for (const inc of issueIncidents) {
      const it = inc.issueType as any;
      const key = inc.issueTypeId;
      const existing = issueMap.get(key) ?? {
        icon: it?.icon ?? '⚠️',
        name: it?.nameI18n?.he ?? it?.nameI18n?.en ?? key,
        count: 0,
      };
      existing.count++;
      issueMap.set(key, existing);

      const rKey = inc.restroomId;
      const loc = [inc.restroom.floor.building.name, inc.restroom.floor.name, inc.restroom.name]
        .filter(Boolean).join(' › ');
      const rExisting = restroomMap.get(rKey) ?? { location: loc, count: 0 };
      rExisting.count++;
      restroomMap.set(rKey, rExisting);
    }

    const topIssues = [...issueMap.values()].sort((a, b) => b.count - a.count).slice(0, 5);
    const hotspots = [...restroomMap.values()].sort((a, b) => b.count - a.count).slice(0, 5);

    const cleaners = await this.prisma.user.findMany({
      where: { orgId, role: 'CLEANER', isActive: true },
      select: {
        id: true,
        name: true,
        incidentActions: {
          where: { actionType: 'RESOLVED', performedAt: { gte: from, lt: to } },
          select: { performedAt: true },
        },
        assignedIncidents: {
          where: { reportedAt: { gte: from, lt: to } },
          select: { reportedAt: true, resolvedAt: true },
        },
      },
    });

    const cleanerData = cleaners
      .map(c => ({
        name: c.name,
        resolved: c.incidentActions.length,
        avgMinutes: c.assignedIncidents.filter(i => i.resolvedAt).length > 0
          ? Math.round(c.assignedIncidents
              .filter(i => i.resolvedAt)
              .reduce((s, i) => s + (i.resolvedAt!.getTime() - i.reportedAt.getTime()) / 60000, 0)
            / c.assignedIncidents.filter(i => i.resolvedAt).length)
          : 0,
      }))
      .filter(c => c.resolved > 0)
      .sort((a, b) => b.resolved - a.resolved);

    const arrivals = await this.prisma.cleanerArrival.findMany({
      where: {
        user: { orgId, role: 'CLEANER' },
        arrivedAt: { gte: from, lt: to },
      },
      select: {
        userId: true,
        arrivedAt: true,
        leftAt: true,
        user: { select: { name: true } },
      },
    });

    const resolvedUserIds = new Set(
      cleaners.filter(c => c.incidentActions.length > 0).map(c => c.id),
    );

    const arrivalsByUser = new Map<string, { name: string; totalMinutes: number }>();
    for (const a of arrivals) {
      const end = a.leftAt ?? to;
      const minutes = Math.round((end.getTime() - a.arrivedAt.getTime()) / 60000);
      const existing = arrivalsByUser.get(a.userId);
      if (existing) {
        existing.totalMinutes += minutes;
      } else {
        arrivalsByUser.set(a.userId, { name: a.user.name, totalMinutes: minutes });
      }
    }

    const idleCleaners = [...arrivalsByUser.entries()]
      .filter(([userId, data]) => data.totalMinutes >= 30 && !resolvedUserIds.has(userId))
      .map(([, data]) => ({ name: data.name, minutes: data.totalMinutes }))
      .sort((a, b) => b.minutes - a.minutes);

    const dateStr = yesterdayStart.toLocaleDateString('he-IL', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    return {
      _yesterdayStart: yesterdayStart,
      orgName: orgName,
      date: dateStr,
      totalIncidents: total,
      resolvedIncidents: resolved,
      openIncidents: open,
      inProgressIncidents: inProgress,
      avgResolutionMinutes: avgMinutes,
      slaPercent,
      slaTarget,
      topIssues,
      hotspots,
      cleaners: cleanerData,
      idleCleaners,
    };
  }
}
