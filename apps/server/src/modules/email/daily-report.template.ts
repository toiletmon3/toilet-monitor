export interface DailyReportData {
  orgName: string;
  date: string;
  totalIncidents: number;
  resolvedIncidents: number;
  openIncidents: number;
  inProgressIncidents: number;
  avgResolutionMinutes: number;
  slaPercent: number;
  slaTarget: number;
  topIssues: { icon: string; name: string; count: number }[];
  hotspots: { location: string; count: number }[];
  cleaners: { name: string; resolved: number; avgMinutes: number }[];
  idleCleaners: { name: string; minutes: number }[];
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

export function buildDailyReportHtml(data: DailyReportData): string {
  const slaColor = data.slaPercent >= 80 ? '#22c55e' : data.slaPercent >= 50 ? '#eab308' : '#ef4444';

  const issueRows = data.topIssues.slice(0, 5).map((i, idx) => `
    <tr style="border-bottom:1px solid #1e293b;">
      <td style="padding:10px 8px;color:#94a3b8;font-size:12px;">${idx + 1}</td>
      <td style="padding:10px 8px;font-size:16px;">${i.icon}</td>
      <td style="padding:10px 8px;color:#e2e8f0;font-size:13px;">${i.name}</td>
      <td style="padding:10px 8px;color:#00e5cc;font-weight:bold;font-size:14px;text-align:left;">${i.count}</td>
    </tr>`).join('');

  const hotspotRows = data.hotspots.slice(0, 5).map((h, idx) => `
    <tr style="border-bottom:1px solid #1e293b;">
      <td style="padding:10px 8px;color:#94a3b8;font-size:12px;">${idx + 1}</td>
      <td style="padding:10px 8px;color:#e2e8f0;font-size:13px;">${h.location}</td>
      <td style="padding:10px 8px;color:#f59e0b;font-weight:bold;font-size:14px;text-align:left;">${h.count}</td>
    </tr>`).join('');

  const cleanerRows = data.cleaners.slice(0, 10).map((c, idx) => {
    const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`;
    return `
    <tr style="border-bottom:1px solid #1e293b;">
      <td style="padding:10px 8px;font-size:14px;text-align:center;">${medal}</td>
      <td style="padding:10px 8px;color:#e2e8f0;font-size:13px;">${c.name}</td>
      <td style="padding:10px 8px;color:#22c55e;font-weight:bold;font-size:14px;text-align:center;">${c.resolved}</td>
      <td style="padding:10px 8px;color:#94a3b8;font-size:12px;text-align:center;">${c.avgMinutes > 0 ? `${c.avgMinutes} דק'` : '—'}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0b1120;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">

    <!-- Header -->
    <div style="text-align:center;padding:24px 0 16px;">
      <div style="font-size:32px;">🚾</div>
      <h1 style="color:#00e5cc;font-size:20px;margin:8px 0 4px;">סיכום יומי — ${data.orgName}</h1>
      <div style="color:#64748b;font-size:13px;">${data.date}</div>
    </div>

    <!-- Stats Grid -->
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      <tr>
        ${statCard('סה״כ דיווחים', data.totalIncidents, '#3b82f6')}
        ${statCard('טופלו', data.resolvedIncidents, '#22c55e')}
      </tr>
      <tr>
        ${statCard('פתוחים', data.openIncidents, '#ef4444')}
        ${statCard('בטיפול', data.inProgressIncidents, '#f59e0b')}
      </tr>
      <tr>
        ${statCard('זמן טיפול ממוצע', data.avgResolutionMinutes > 0 ? `${data.avgResolutionMinutes} דק'` : '—', '#8b5cf6')}
        ${statCard(`עמידה ב-SLA (${data.slaTarget} דק')`, `${data.slaPercent}%`, slaColor)}
      </tr>
    </table>

    <!-- Top Issues -->
    ${data.topIssues.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${sectionTitle('🔝 בעיות נפוצות')}
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#0f172a;border-radius:10px;overflow:hidden;">
          ${issueRows}
        </table>
      </td></tr>
    </table>` : ''}

    <!-- Hotspots -->
    ${data.hotspots.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${sectionTitle('📍 נקודות חמות')}
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#0f172a;border-radius:10px;overflow:hidden;">
          ${hotspotRows}
        </table>
      </td></tr>
    </table>` : ''}

    <!-- Cleaners -->
    ${data.cleaners.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${sectionTitle('👷 ביצועי מנקים')}
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#0f172a;border-radius:10px;overflow:hidden;">
          <tr style="border-bottom:1px solid #1e293b;">
            <th style="padding:10px 8px;color:#64748b;font-size:11px;font-weight:normal;text-align:center;">#</th>
            <th style="padding:10px 8px;color:#64748b;font-size:11px;font-weight:normal;text-align:right;">שם</th>
            <th style="padding:10px 8px;color:#64748b;font-size:11px;font-weight:normal;text-align:center;">טיפולים</th>
            <th style="padding:10px 8px;color:#64748b;font-size:11px;font-weight:normal;text-align:center;">זמן ממוצע</th>
          </tr>
          ${cleanerRows}
        </table>
      </td></tr>
    </table>` : ''}

    <!-- Idle Cleaners -->
    ${data.idleCleaners.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${sectionTitle('⚠️ נכחו ולא טיפלו (30+ דק׳)')}
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#0f172a;border-radius:10px;overflow:hidden;">
          <tr style="border-bottom:1px solid #1e293b;">
            <th style="padding:10px 8px;color:#64748b;font-size:11px;font-weight:normal;text-align:right;">שם</th>
            <th style="padding:10px 8px;color:#64748b;font-size:11px;font-weight:normal;text-align:center;">זמן נוכחות</th>
            <th style="padding:10px 8px;color:#64748b;font-size:11px;font-weight:normal;text-align:center;">טיפולים</th>
          </tr>
          ${data.idleCleaners.map(c => `
          <tr style="border-bottom:1px solid #1e293b;">
            <td style="padding:10px 8px;color:#e2e8f0;font-size:13px;">${c.name}</td>
            <td style="padding:10px 8px;color:#f59e0b;font-size:13px;text-align:center;">${c.minutes} דק'</td>
            <td style="padding:10px 8px;color:#ef4444;font-weight:bold;font-size:14px;text-align:center;">0</td>
          </tr>`).join('')}
        </table>
      </td></tr>
    </table>` : ''}

    <!-- Footer -->
    <div style="text-align:center;padding:32px 0 16px;color:#475569;font-size:11px;">
      דוח זה נשלח אוטומטית מ-ToiletMon · <span style="color:#00e5cc;">toiletcleanpro.duckdns.org</span>
    </div>

  </div>
</body>
</html>`;
}
