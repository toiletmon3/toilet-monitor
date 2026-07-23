import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar } from 'lucide-react';

const CYAN = '#00e5cc';

export type DateRange =
  | { kind: 'all' }
  | { kind: 'day'; which: 'today' | 'yesterday' }
  | { kind: 'preset'; days: number }
  | { kind: 'custom'; from: string; to: string };

export const DEFAULT_RANGE: DateRange = { kind: 'all' };

function isoDay(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** from/to ISO bounds for a query. `all` → no bounds (returns {}). */
export function rangeToQuery(r: DateRange): { from?: string; to?: string } {
  if (r.kind === 'all') return {};
  const now = new Date();
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  if (r.kind === 'day') {
    if (r.which === 'today') return { from: startToday.toISOString(), to: now.toISOString() };
    const yStart = new Date(startToday);
    yStart.setDate(yStart.getDate() - 1);
    return { from: yStart.toISOString(), to: new Date(startToday.getTime() - 1).toISOString() };
  }
  if (r.kind === 'preset') {
    const from = new Date(startToday);
    from.setDate(from.getDate() - (r.days - 1)); // inclusive of today
    return { from: from.toISOString(), to: now.toISOString() };
  }
  // custom: expand date-only strings in LOCAL time
  return {
    from: new Date(`${r.from}T00:00:00`).toISOString(),
    to: new Date(`${r.to}T23:59:59.999`).toISOString(),
  };
}

/** Stable key for react-query cache / active-state comparison. */
export function rangeKey(r: DateRange): string {
  if (r.kind === 'all') return 'all';
  if (r.kind === 'day') return `d:${r.which}`;
  if (r.kind === 'preset') return `p:${r.days}`;
  return `c:${r.from}:${r.to}`;
}

/**
 * Preset + custom date-range picker, mirroring the Overview/Statistics screens
 * so every "category" filters dates the same way.
 */
export default function DateRangeFilter({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const { t } = useTranslation();
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(isoDay(-7));
  const [customTo, setCustomTo] = useState(isoDay(0));
  const rkey = rangeKey(value);

  const presets: { label: string; r: DateRange }[] = [
    { label: t('admin.incidents.all'), r: { kind: 'all' } },
    { label: t('admin.dashboard.ovToday'), r: { kind: 'day', which: 'today' } },
    { label: t('admin.dashboard.ovYesterday'), r: { kind: 'day', which: 'yesterday' } },
    { label: t('admin.dashboard.ovLast7'), r: { kind: 'preset', days: 7 } },
    { label: t('admin.dashboard.ovLast30'), r: { kind: 'preset', days: 30 } },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 flex-wrap items-center">
        {presets.map(({ label, r }) => {
          const active = rangeKey(r) === rkey;
          return (
            <button key={label} onClick={() => { onChange(r); setCustomOpen(false); }}
              className="px-3 py-1.5 rounded-lg text-sm transition-all"
              style={{
                background: active ? 'rgba(0,229,204,0.15)' : 'var(--color-card)',
                border: `1px solid ${active ? CYAN : 'rgba(255,255,255,0.08)'}`,
                color: active ? CYAN : 'var(--color-text-secondary)',
              }}>
              {label}
            </button>
          );
        })}
        <button
          onClick={() => setCustomOpen(o => !o)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all"
          style={{
            background: value.kind === 'custom' ? 'rgba(0,229,204,0.15)' : 'var(--color-card)',
            border: `1px solid ${value.kind === 'custom' || customOpen ? CYAN : 'rgba(255,255,255,0.08)'}`,
            color: value.kind === 'custom' || customOpen ? CYAN : 'var(--color-text-secondary)',
          }}>
          <Calendar size={14} />
          {value.kind === 'custom' ? `${value.from} ↔ ${value.to}` : t('admin.analytics.customRange')}
        </button>
      </div>

      {customOpen && (
        <div className="rounded-2xl p-4 flex flex-wrap items-end gap-3" style={{ background: 'var(--color-card)', border: '1px dashed rgba(0,229,204,0.3)' }}>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t('admin.analytics.from')}</label>
            <input type="date" value={customFrom} max={customTo} onChange={e => setCustomFrom(e.target.value)}
              className="px-3 py-2 rounded-xl text-sm text-white outline-none"
              style={{ background: '#0a0e1a', border: '1px solid rgba(0,229,204,0.25)', colorScheme: 'dark' }} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t('admin.analytics.to')}</label>
            <input type="date" value={customTo} min={customFrom} max={isoDay(0)} onChange={e => setCustomTo(e.target.value)}
              className="px-3 py-2 rounded-xl text-sm text-white outline-none"
              style={{ background: '#0a0e1a', border: '1px solid rgba(0,229,204,0.25)', colorScheme: 'dark' }} />
          </div>
          <button
            onClick={() => { if (customFrom && customTo) { onChange({ kind: 'custom', from: customFrom, to: customTo }); setCustomOpen(false); } }}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{ background: 'rgba(0,229,204,0.15)', border: `1px solid ${CYAN}`, color: CYAN }}>
            {t('admin.analytics.apply')}
          </button>
        </div>
      )}
    </div>
  );
}
