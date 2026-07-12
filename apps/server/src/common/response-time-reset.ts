/**
 * System-wide response-time measurement reset (user directive, 12.07.2026):
 * every "response time" figure in the system — dashboard KPIs, room scores,
 * SLA stats, issue-frequency averages, cleaner performance, kiosk stat,
 * buildings summary and the daily email report — is computed ONLY from
 * incidents reported at/after this moment.
 *
 * Older incidents still count everywhere else (complaint counts, statuses,
 * history); only their resolution DURATION is ignored, as if the stopwatch
 * started fresh. This supersedes the narrower KIOSK_AVG_RESET_AT (08.07),
 * which reset the kiosk-facing stat only.
 */
export const RESPONSE_TIME_RESET_AT = new Date('2026-07-12T14:06:00Z');

/** True when an incident may contribute a response-time duration. */
export const countsForResponseTime = (i: { reportedAt: Date; resolvedAt?: Date | null }): boolean =>
  !!i.resolvedAt && i.reportedAt >= RESPONSE_TIME_RESET_AT;
