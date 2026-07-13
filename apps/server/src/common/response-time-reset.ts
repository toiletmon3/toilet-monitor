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

/**
 * When the response-time stopwatch starts for an incident.
 *
 * Immediate-alert properties (Option 1): the report time — the cleaner is
 * pushed the instant the issue is reported, so the clock starts at reportedAt.
 *
 * Batched-alert properties (Option 2): `notifiedAt` — the moment the grouped
 * push actually reached the cleaner. Time spent waiting for the next pulse is
 * NOT counted against the property, per the product spec.
 */
export const responseStartAt = (i: { reportedAt: Date; notifiedAt?: Date | null }): Date =>
  i.notifiedAt ?? i.reportedAt;

/**
 * Response time of a resolved incident, in minutes, measured from
 * `responseStartAt` to resolvedAt. Clamped at 0 so a resolution that races the
 * batched pulse can never produce a negative duration. Callers must have
 * already filtered with `countsForResponseTime` (i.e. resolvedAt is set).
 */
export const responseMinutes = (i: { reportedAt: Date; notifiedAt?: Date | null; resolvedAt?: Date | null }): number =>
  Math.max(0, (i.resolvedAt!.getTime() - responseStartAt(i).getTime()) / 60000);
