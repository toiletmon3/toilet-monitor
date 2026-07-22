import { getReportStrings, ReportStrings } from './daily-report.i18n';

export interface TrendInfo {
  dir: 'up' | 'down' | 'flat';
  pct: number;
  good: boolean;
}

export interface OverviewData {
  avgScore: { value: number; trend: TrendInfo };
  complaints: { value: number; trend: TrendInfo };
  responseTime: { value: number; trend: TrendInfo };
  timeSaved: { value: number; trend: TrendInfo };
  general: { key: 'like' | 'cleaning' | 'maintenance'; count: number }[];
  rooms: { location: string; score: number; tier: 'good' | 'warning' | 'critical'; status: 'ok' | 'attention' }[];
}

export interface DailyReportData {
  orgName: string;
  date: string;
  overview?: OverviewData;
  totalIncidents: number;
  resolvedIncidents: number;
  openIncidents: number;
  inProgressIncidents: number;
  positiveFeedback: number;
  avgResolutionMinutes: number;
  slaPercent: number;
  slaTarget: number;
  topIssues: { icon: string; name: string; count: number }[];
  hotspots: { location: string; count: number }[];
  cleaners: { name: string; resolved: number; avgMinutes: number }[];
  idleCleaners: { name: string; minutes: number }[];
}

/** Score → traffic-light colour (higher = better). Mirrors the web dashboard. */
function scoreColor(score: number): string {
  if (score >= 85) return '#22c55e';
  if (score >= 70) return '#84cc16';
  if (score >= 55) return '#f59e0b';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

/** KPI card for the overview block: value + a coloured trend chip. Email-safe RTL (no flexbox). */
function kpiCard(label: string, value: string | number, unit: string, trend: TrendInfo, accent: string, dir: 'rtl' | 'ltr', align: 'right' | 'left'): string {
  const opposite = align === 'right' ? 'left' : 'right';
  const tColor = trend.dir === 'flat' ? '#64748b' : trend.good ? '#22c55e' : '#ef4444';
  const arrow = trend.dir === 'up' ? '▲' : trend.dir === 'down' ? '▼' : '';
  const chip = trend.dir === 'flat' ? '' :
    `<span style="color:${tColor};font-size:11px;font-weight:bold;white-space:nowrap;">${arrow} ${Math.abs(trend.pct)}%</span>`;
  return `
    <td style="padding:6px;width:50%;" dir="${dir}" align="${align}">
      <div dir="${dir}" style="background:${accent}15;border:1px solid ${accent}40;border-radius:12px;padding:14px;text-align:${align};">
        <div style="font-size:11px;color:#94a3b8;margin-bottom:6px;text-align:${align};">${label}</div>
        <table dir="${dir}" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
          <tr>
            <td style="text-align:${align};font-size:24px;font-weight:bold;color:${accent};white-space:nowrap;">${value}<span style="font-size:12px;font-weight:normal;">${unit}</span></td>
            <td style="text-align:${opposite};white-space:nowrap;vertical-align:bottom;">${chip}</td>
          </tr>
        </table>
      </div>
    </td>`;
}

function statCard(label: string, value: string | number, color: string): string {
  return `
    <td style="padding:8px;">
      <div style="background:${color}15;border:1px solid ${color}40;border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:28px;font-weight:bold;color:${color};">${value}</div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px;">${label}</div>
      </div>
    </td>`;
}

function sectionTitle(text: string): string {
  return `
    <tr><td style="padding:24px 0 8px 0;">
      <div style="font-size:14px;font-weight:bold;color:#00e5cc;border-bottom:1px solid #00e5cc30;padding-bottom:6px;">${text}</div>
    </td></tr>`;
}

function renderReportSections(data: DailyReportData, s: ReportStrings): string {
  const slaColor = data.slaPercent >= 80 ? '#22c55e' : data.slaPercent >= 50 ? '#eab308' : '#ef4444';
  const nameAlign = s.dir === 'rtl' ? 'right' : 'left';
  const valueAlign = s.dir === 'rtl' ? 'left' : 'right';
  const minutesText = (m: number) => m > 0 ? `${m} ${s.minutesShort}` : s.emptyDash;

  // ── Overview block (slide-5 style: KPIs + General split + per-room score) ──
  const ov = data.overview;
  const GENERAL_LABEL: Record<string, string> = { like: s.ovLike, cleaning: s.ovCleaning, maintenance: s.ovMaintenance };
  const GENERAL_COLOR: Record<string, string> = { like: '#22c55e', cleaning: '#ef4444', maintenance: '#3b82f6' };
  const generalTotal = (ov?.general ?? []).reduce((a, b) => a + b.count, 0);

  const generalBar = ov && generalTotal > 0 ? `
    <tr><td style="padding:4px 6px 12px;" dir="${s.dir}" align="${nameAlign}">
      <table dir="${s.dir}" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border-radius:8px;overflow:hidden;">
        <tr>
          ${ov.general.map(g => `<td height="16" width="${Math.round((g.count / generalTotal) * 100)}%" style="background:${GENERAL_COLOR[g.key]};font-size:0;line-height:0;">&nbsp;</td>`).join('')}
        </tr>
      </table>
      <div dir="${s.dir}" style="margin-top:8px;font-size:12px;color:#94a3b8;text-align:${nameAlign};">
        ${ov.general.map(g => `<span style="margin-${nameAlign === 'right' ? 'left' : 'right'}:14px;white-space:nowrap;"><span style="color:${GENERAL_COLOR[g.key]};">●</span> ${GENERAL_LABEL[g.key]} ${Math.round((g.count / generalTotal) * 100)}%</span>`).join('')}
      </div>
    </td></tr>` : '';

  const roomRows = (ov?.rooms ?? []).slice(0, 10).map((r, idx) => {
    const c = scoreColor(r.score);
    const statusIcon = r.status === 'ok' ? '<span style="color:#22c55e;">✔</span>' : '<span style="color:#f59e0b;">⚠</span>';
    return `
    <tr style="border-bottom:1px solid #1e293b;">
      <td style="padding:9px 8px;color:#94a3b8;font-size:12px;">${idx + 1}</td>
      <td style="padding:9px 8px;color:#e2e8f0;font-size:13px;">${r.location}</td>
      <td style="padding:9px 8px;text-align:center;font-size:14px;">${statusIcon}</td>
      <td style="padding:9px 8px;text-align:${valueAlign};">
        <span style="display:inline-block;min-width:34px;text-align:center;background:${c};color:#0a0e1a;font-weight:bold;font-size:13px;border-radius:7px;padding:3px 8px;">${r.score}</span>
      </td>
    </tr>`;
  }).join('');

  const overviewBlock = ov ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${sectionTitle(`${s.overviewTitle} · ${s.overviewSubtitle}`)}
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        ${kpiCard(s.ovAvgScore, ov.avgScore.value, '', ov.avgScore.trend, '#3b82f6', s.dir, nameAlign)}
        ${kpiCard(s.ovComplaints, ov.complaints.value, '', ov.complaints.trend, '#ef4444', s.dir, nameAlign)}
      </tr>
      <tr>
        ${kpiCard(s.ovResponseTime, ov.responseTime.value, ` ${s.minutesShort}`, ov.responseTime.trend, '#f97316', s.dir, nameAlign)}
        ${kpiCard(s.ovTimeSaved, ov.timeSaved.value, ` ${s.ovHoursShort}`, ov.timeSaved.trend, '#eab308', s.dir, nameAlign)}
      </tr>
    </table>
    ${generalBar ? `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${generalBar}</table>` : ''}
    ${roomRows ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${sectionTitle(s.ovRoomsTitle)}
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#0f172a;border-radius:10px;overflow:hidden;">
          <tr style="border-bottom:1px solid #1e293b;">
            <th style="padding:9px 8px;color:#64748b;font-size:11px;font-weight:normal;text-align:${nameAlign};">#</th>
            <th style="padding:9px 8px;color:#64748b;font-size:11px;font-weight:normal;text-align:${nameAlign};">${s.ovRoomName}</th>
            <th style="padding:9px 8px;color:#64748b;font-size:11px;font-weight:normal;text-align:center;">${s.ovStatus}</th>
            <th style="padding:9px 8px;color:#64748b;font-size:11px;font-weight:normal;text-align:${valueAlign};">${s.ovScore}</th>
          </tr>
          ${roomRows}
        </table>
      </td></tr>
    </table>` : ''}` : '';

  const issueRows = data.topIssues.slice(0, 5).map((i, idx) => `
    <tr style="border-bottom:1px solid #1e293b;">
      <td style="padding:10px 8px;color:#94a3b8;font-size:12px;">${idx + 1}</td>
      <td style="padding:10px 8px;font-size:16px;">${i.icon}</td>
      <td style="padding:10px 8px;color:#e2e8f0;font-size:13px;">${i.name}</td>
      <td style="padding:10px 8px;color:#00e5cc;font-weight:bold;font-size:14px;text-align:${valueAlign};">${i.count}</td>
    </tr>`).join('');

  const hotspotRows = data.hotspots.slice(0, 5).map((h, idx) => `
    <tr style="border-bottom:1px solid #1e293b;">
      <td style="padding:10px 8px;color:#94a3b8;font-size:12px;">${idx + 1}</td>
      <td style="padding:10px 8px;color:#e2e8f0;font-size:13px;">${h.location}</td>
      <td style="padding:10px 8px;color:#f59e0b;font-weight:bold;font-size:14px;text-align:${valueAlign};">${h.count}</td>
    </tr>`).join('');

  const cleanerRows = data.cleaners.slice(0, 10).map((c, idx) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`;
    return `
    <tr style="border-bottom:1px solid #1e293b;">
      <td style="padding:10px 8px;font-size:14px;text-align:center;">${medal}</td>
      <td style="padding:10px 8px;color:#e2e8f0;font-size:13px;">${c.name}</td>
      <td style="padding:10px 8px;color:#22c55e;font-weight:bold;font-size:14px;text-align:center;">${c.resolved}</td>
      <td style="padding:10px 8px;color:#94a3b8;font-size:12px;text-align:center;">${minutesText(c.avgMinutes)}</td>
    </tr>`;
  }).join('');

  return `
    <!-- Overview (slide-5 style) -->
    ${overviewBlock}

    <!-- Yesterday section title -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${sectionTitle(s.yesterdayTitle)}
    </table>

    <!-- Stats Grid -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        ${statCard(s.totalIncidents, data.totalIncidents, '#3b82f6')}
        ${statCard(s.resolved, data.resolvedIncidents, '#22c55e')}
      </tr>
      <tr>
        ${statCard(s.open, data.openIncidents, '#ef4444')}
        ${statCard(s.inProgress, data.inProgressIncidents, '#f59e0b')}
      </tr>
      <tr>
        ${statCard(s.avgResolutionTime, minutesText(data.avgResolutionMinutes), '#8b5cf6')}
        ${statCard(s.slaCompliance(data.slaTarget), `${data.slaPercent}%`, slaColor)}
      </tr>
    </table>

    <!-- Positive feedback — separate from fault stats -->
    ${data.positiveFeedback > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr><td style="padding:8px;">
        <div style="background:#22c55e15;border:1px solid #22c55e40;border-radius:12px;padding:16px;text-align:center;">
          <div style="font-size:28px;font-weight:bold;color:#22c55e;">${data.positiveFeedback}</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:4px;">${s.positiveFeedback}</div>
        </div>
      </td></tr>
    </table>` : ''}

    <!-- Top Issues -->
    ${data.topIssues.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${sectionTitle(s.topIssues)}
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#0f172a;border-radius:10px;overflow:hidden;">
          ${issueRows}
        </table>
      </td></tr>
    </table>` : ''}

    <!-- Hotspots -->
    ${data.hotspots.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${sectionTitle(s.hotspots)}
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#0f172a;border-radius:10px;overflow:hidden;">
          ${hotspotRows}
        </table>
      </td></tr>
    </table>` : ''}

    <!-- Cleaners -->
    ${data.cleaners.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${sectionTitle(s.cleanerPerformance)}
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#0f172a;border-radius:10px;overflow:hidden;">
          <tr style="border-bottom:1px solid #1e293b;">
            <th style="padding:10px 8px;color:#64748b;font-size:11px;font-weight:normal;text-align:center;">#</th>
            <th style="padding:10px 8px;color:#64748b;font-size:11px;font-weight:normal;text-align:${nameAlign};">${s.colName}</th>
            <th style="padding:10px 8px;color:#64748b;font-size:11px;font-weight:normal;text-align:center;">${s.colHandled}</th>
            <th style="padding:10px 8px;color:#64748b;font-size:11px;font-weight:normal;text-align:center;">${s.colAvgTime}</th>
          </tr>
          ${cleanerRows}
        </table>
      </td></tr>
    </table>` : ''}

    <!-- Idle Cleaners -->
    ${data.idleCleaners.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${sectionTitle(s.idleCleaners)}
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#0f172a;border-radius:10px;overflow:hidden;">
          <tr style="border-bottom:1px solid #1e293b;">
            <th style="padding:10px 8px;color:#64748b;font-size:11px;font-weight:normal;text-align:${nameAlign};">${s.colName}</th>
            <th style="padding:10px 8px;color:#64748b;font-size:11px;font-weight:normal;text-align:center;">${s.colPresenceTime}</th>
            <th style="padding:10px 8px;color:#64748b;font-size:11px;font-weight:normal;text-align:center;">${s.colHandled}</th>
          </tr>
          ${data.idleCleaners.map(c => `
          <tr style="border-bottom:1px solid #1e293b;">
            <td style="padding:10px 8px;color:#e2e8f0;font-size:13px;">${c.name}</td>
            <td style="padding:10px 8px;color:#f59e0b;font-size:13px;text-align:center;">${c.minutes} ${s.minutesShort}</td>
            <td style="padding:10px 8px;color:#ef4444;font-weight:bold;font-size:14px;text-align:center;">0</td>
          </tr>`).join('')}
        </table>
      </td></tr>
    </table>` : ''}

`;
}

/** Full-document wrapper shared by the single- and multi-property reports. */
function wrapReportHtml(s: ReportStrings, titleName: string, date: string, inner: string): string {
  const nameAlign = s.dir === 'rtl' ? 'right' : 'left';
  return `<!DOCTYPE html>
<html lang="${s.htmlLang}" dir="${s.dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0b1120;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div dir="${s.dir}" style="max-width:600px;margin:0 auto;padding:24px 16px;text-align:${nameAlign};">

    <!-- Header -->
    <div style="text-align:center;padding:24px 0 16px;">
      <div style="font-size:32px;">🚾</div>
      <h1 style="color:#00e5cc;font-size:20px;margin:8px 0 4px;">${s.dailySummary} — ${titleName}</h1>
      <div style="color:#64748b;font-size:13px;">${date}</div>
    </div>

    ${inner}

    <!-- Footer -->
    <div style="text-align:center;padding:32px 0 16px;color:#475569;font-size:11px;">
      ${s.footer} · <span style="color:#00e5cc;">cleanco.ai</span>
    </div>

  </div>
</body>
</html>`;
}

export function buildDailyReportHtml(data: DailyReportData, lang: string = 'he'): string {
  const s: ReportStrings = getReportStrings(lang);
  return wrapReportHtml(s, data.orgName, data.date, renderReportSections(data, s));
}

/**
 * One email, several properties: the full set of report sections repeated per
 * property, each block introduced by a prominent property header — the daily
 * summary a PROPERTY_MANAGER receives.
 */
export function buildMultiPropertyReportHtml(datas: DailyReportData[], lang: string = 'he'): string {
  const s: ReportStrings = getReportStrings(lang);
  const inner = datas.map(d => `
    <div style="margin-top:26px;padding:12px 14px;background:#0f172a;border-radius:12px;border:1px solid #164e63;text-align:center;">
      <span style="color:#00e5cc;font-size:17px;font-weight:bold;">🏘️ ${d.orgName}</span>
    </div>
    ${renderReportSections(d, s)}`).join('');
  const title = datas.map(d => d.orgName).join(' · ');
  return wrapReportHtml(s, title, datas[0]?.date ?? '', inner);
}
