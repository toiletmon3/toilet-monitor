/**
 * Per-property alert policy (set by the org "general" manager, one per נכס).
 *
 * Option 1 — "immediate" (default, legacy behaviour): a push fires the instant
 * an issue is reported, followed by the cleaner-reminder track. Response time
 * is measured from the report.
 *
 * Option 2 — "batched": no push on report. Instead, once the oldest un-announced
 * open issue in the property has waited `batchIntervalMinutes`, ONE grouped push
 * is sent listing the open issues, and every issue it covers is stamped with
 * `notifiedAt`. Response time is then measured from that push, not the report.
 */
export type AlertMode = 'immediate' | 'batched';

export interface PropertyAlertSettings {
  alertMode: AlertMode;
  /** Batched mode only: minutes between grouped pushes. */
  batchIntervalMinutes: number;
}

/** Default batched interval when a property is switched to Option 2 without a value. */
export const DEFAULT_BATCH_INTERVAL_MINUTES = 40;

/** Normalise a raw `Property.settings` blob into a typed, defaulted config. */
export function readAlertSettings(settings: unknown): PropertyAlertSettings {
  const s = (settings ?? {}) as Record<string, unknown>;
  const alertMode: AlertMode = s.alertMode === 'batched' ? 'batched' : 'immediate';
  const raw = Number(s.batchIntervalMinutes);
  const batchIntervalMinutes =
    Number.isFinite(raw) && raw >= 1 ? Math.min(1440, Math.floor(raw)) : DEFAULT_BATCH_INTERVAL_MINUTES;
  return { alertMode, batchIntervalMinutes };
}
