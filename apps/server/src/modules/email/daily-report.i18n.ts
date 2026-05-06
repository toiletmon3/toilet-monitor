export type ReportLang = 'he' | 'en';

export interface ReportStrings {
  dir: 'rtl' | 'ltr';
  htmlLang: string;
  subjectPrefix: string;
  dailySummary: string;
  totalIncidents: string;
  resolved: string;
  open: string;
  inProgress: string;
  avgResolutionTime: string;
  slaCompliance: (target: number) => string;
  topIssues: string;
  hotspots: string;
  cleanerPerformance: string;
  idleCleaners: string;
  colName: string;
  colHandled: string;
  colAvgTime: string;
  colPresenceTime: string;
  minutesShort: string;
  emptyDash: string;
  footer: string;
  dateLocale: string;
}

const HE: ReportStrings = {
  dir: 'rtl',
  htmlLang: 'he',
  subjectPrefix: '📊 סיכום יומי',
  dailySummary: 'סיכום יומי',
  totalIncidents: 'סה״כ דיווחים',
  resolved: 'טופלו',
  open: 'פתוחים',
  inProgress: 'בטיפול',
  avgResolutionTime: 'זמן טיפול ממוצע',
  slaCompliance: (t) => `עמידה ב-SLA (${t} דק')`,
  topIssues: '🔝 בעיות נפוצות',
  hotspots: '📍 נקודות חמות',
  cleanerPerformance: '👷 ביצועי מנקים',
  idleCleaners: '⚠️ נכחו ולא טיפלו (30+ דק׳)',
  colName: 'שם',
  colHandled: 'טיפולים',
  colAvgTime: 'זמן ממוצע',
  colPresenceTime: 'זמן נוכחות',
  minutesShort: 'דק׳',
  emptyDash: '—',
  footer: 'דוח זה נשלח אוטומטית מ-ToiletMon',
  dateLocale: 'he-IL',
};

const EN: ReportStrings = {
  dir: 'ltr',
  htmlLang: 'en',
  subjectPrefix: '📊 Daily Summary',
  dailySummary: 'Daily Summary',
  totalIncidents: 'Total Reports',
  resolved: 'Resolved',
  open: 'Open',
  inProgress: 'In Progress',
  avgResolutionTime: 'Avg. Resolution Time',
  slaCompliance: (t) => `SLA Compliance (${t} min)`,
  topIssues: '🔝 Top Issues',
  hotspots: '📍 Hotspots',
  cleanerPerformance: '👷 Cleaner Performance',
  idleCleaners: '⚠️ Present but Idle (30+ min)',
  colName: 'Name',
  colHandled: 'Handled',
  colAvgTime: 'Avg. Time',
  colPresenceTime: 'Presence',
  minutesShort: 'min',
  emptyDash: '—',
  footer: 'This report was sent automatically by ToiletMon',
  dateLocale: 'en-US',
};

export function getReportStrings(lang: string): ReportStrings {
  const normalized = (lang || 'he').toLowerCase().split('-')[0];
  return normalized === 'en' ? EN : HE;
}
