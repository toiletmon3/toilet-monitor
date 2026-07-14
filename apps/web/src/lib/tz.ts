/**
 * Timezone-aware day boundaries. "Today" on the dashboard must mean the org's
 * day (Asia/Jerusalem by default), NOT the viewer's device timezone — otherwise
 * an admin on a phone set to another timezone sees the wrong (often empty) day.
 */

/** Minutes the timezone is AHEAD of UTC at `date` (DST-aware). */
function tzOffsetMinutes(tz: string, date: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).formatToParts(date).map((x) => [x.type, x.value]),
  );
  const hour = p.hour === '24' ? '0' : p.hour; // some engines emit '24' at midnight
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +hour, +p.minute, +p.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}

/**
 * UTC instant for midnight (start of day) `dayOffset` days from today, in `tz`.
 * `startOfDayInTz(tz, 0)` = start of today; `-1` = start of yesterday.
 * Falls back to browser-local midnight if the timezone is unusable.
 */
export function startOfDayInTz(tz: string, dayOffset = 0): Date {
  try {
    const now = new Date();
    const [mo, da, yr] = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now).split('/').map(Number);
    const guessUTC = Date.UTC(yr, mo - 1, da + dayOffset, 0, 0, 0);
    return new Date(guessUTC - tzOffsetMinutes(tz, new Date(guessUTC)) * 60000);
  } catch {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + dayOffset);
    return d;
  }
}
