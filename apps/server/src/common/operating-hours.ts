/**
 * Per-building operating hours (in the org's timezone). When enabled, NO push
 * notifications are sent for a building's issues outside its window — the issue
 * is still recorded, only the alert is held until the building is active again.
 * Stored under `Building.settings.operatingHours`.
 */
export interface OperatingHours {
  enabled: boolean;
  open: string; // "HH:MM"
  close: string; // "HH:MM"
}

const HHMM = /^\d{1,2}:\d{2}$/;

/** Parse the raw building settings into a typed operating-hours config (or null). */
export function readOperatingHours(settings: unknown): OperatingHours | null {
  const oh = (settings as any)?.operatingHours;
  if (!oh || typeof oh !== 'object') return null;
  const open = typeof oh.open === 'string' && HHMM.test(oh.open) ? oh.open : '';
  const close = typeof oh.close === 'string' && HHMM.test(oh.close) ? oh.close : '';
  // Only actually restricting when explicitly enabled AND a valid window is set.
  const enabled = oh.enabled === true && !!open && !!close;
  return { enabled, open, close };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Current minute-of-day (0–1439) in the given IANA timezone, or null on error. */
function nowMinutesInTz(now: Date, timezone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === 'hour')?.value);
    const m = Number(parts.find((p) => p.type === 'minute')?.value);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  } catch {
    return null;
  }
}

/**
 * True when the building is currently within its operating hours (so alerts may
 * be sent). Fails OPEN: if hours are disabled/unset, or the timezone/window is
 * unparseable, returns true so notifications are never silently lost by mistake.
 * Supports windows that wrap past midnight (e.g. 22:00–06:00).
 */
export function isWithinOperatingHours(buildingSettings: unknown, timezone: string, now: Date = new Date()): boolean {
  const oh = readOperatingHours(buildingSettings);
  if (!oh || !oh.enabled) return true; // 24/7
  const cur = nowMinutesInTz(now, timezone || 'Asia/Jerusalem');
  if (cur === null) return true; // unparseable timezone → don't suppress
  const open = toMinutes(oh.open);
  const close = toMinutes(oh.close);
  if (open === close) return true; // degenerate window → always active
  return open < close ? cur >= open && cur < close : cur >= open || cur < close;
}
