// Human-readable duration formatting. Turns a raw minute count into
// days + hours + minutes (largest non-zero units only) instead of showing
// huge minute values like "1364 דקות".
// he: "22 שע׳ 44 דק׳" · "יומיים 3 שע׳"      en: "22h 44m" · "2d 3h"

export function formatDuration(totalMinutes: number | null | undefined, lang: string): string {
  const he = (lang || 'he').toLowerCase().startsWith('he');
  if (totalMinutes == null || Number.isNaN(totalMinutes)) return '—';
  const m = Math.max(0, Math.round(totalMinutes));
  if (m < 1) return he ? '0 דק׳' : '0m';

  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const mins = m % 60;

  const parts: string[] = [];
  if (he) {
    if (days > 0) parts.push(days === 1 ? 'יום' : days === 2 ? 'יומיים' : `${days} ימים`);
    if (hours > 0) parts.push(`${hours} שע׳`);
    if (mins > 0) parts.push(`${mins} דק׳`);
  } else {
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (mins > 0) parts.push(`${mins}m`);
  }
  return parts.join(' ');
}
