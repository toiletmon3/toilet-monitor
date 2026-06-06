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
  // Overview (slide-5) block
  overviewTitle: string;
  yesterdayTitle: string;
  ovLastNDays: (n: number) => string;
  ovAvgScore: string;
  ovComplaints: string;
  ovResponseTime: string;
  ovTimeSaved: string;
  ovHoursShort: string;
  ovLike: string;
  ovCleaning: string;
  ovMaintenance: string;
  ovRoomsTitle: string;
  ovRoomName: string;
  ovStatus: string;
  ovScore: string;
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
  overviewTitle: '🎯 סקירה כללית',
  yesterdayTitle: '📅 פעילות אתמול',
  ovLastNDays: (n) => `${n} ימים אחרונים`,
  ovAvgScore: 'ציון ממוצע',
  ovComplaints: 'תקלות',
  ovResponseTime: 'זמן תגובה',
  ovTimeSaved: 'זמן שנחסך',
  ovHoursShort: 'ש׳',
  ovLike: 'שביעות רצון',
  ovCleaning: 'ניקיון',
  ovMaintenance: 'תחזוקה',
  ovRoomsTitle: '🚻 ציון לכל תא שירותים',
  ovRoomName: 'תא שירותים',
  ovStatus: 'סטטוס',
  ovScore: 'ציון',
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
  overviewTitle: '🎯 Overview',
  yesterdayTitle: '📅 Yesterday’s Activity',
  ovLastNDays: (n) => `Last ${n} days`,
  ovAvgScore: 'Avg score',
  ovComplaints: 'Complaints',
  ovResponseTime: 'Response time',
  ovTimeSaved: 'Time saved',
  ovHoursShort: 'h',
  ovLike: 'Satisfaction',
  ovCleaning: 'Cleaning',
  ovMaintenance: 'Maintenance',
  ovRoomsTitle: '🚻 Score per Restroom',
  ovRoomName: 'Restroom',
  ovStatus: 'Status',
  ovScore: 'Score',
};

export function getReportStrings(lang: string): ReportStrings {
  const normalized = (lang || 'he').toLowerCase().split('-')[0];
  return normalized === 'en' ? EN : HE;
}
