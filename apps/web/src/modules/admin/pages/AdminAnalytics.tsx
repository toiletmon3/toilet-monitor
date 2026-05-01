import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts';
import { Calendar, Info, FileDown, FileSpreadsheet } from 'lucide-react';
import api from '../../../lib/api';
import { exportToPdf, exportToExcel, type ExportSection } from '../../../lib/export';

const CYAN = '#00e5cc';
const AMBER = '#f59e0b';
const RED = '#ef4444';
const GREEN = '#22c55e';

const DAY_COLORS = ['#60a5fa','#818cf8','#a78bfa','#c084fc','#e879f9','#f472b6','#fb7185'];

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
      <h2 className="font-semibold text-sm uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>{title}</h2>
      {children}
    </div>
  );
}

/** SLA stat tile with prominent value + minutes unit + explanation. */
function SlaStat({
  value,
  unit,
  label,
  desc,
  color = CYAN,
}: {
  value: string | number;
  unit?: string;
  label: string;
  desc: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl p-3 flex flex-col items-center text-center gap-1" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="flex items-baseline gap-1.5">
        <span className="text-4xl font-bold tabular-nums leading-none" style={{ color }}>{value}</span>
        {unit && <span className="text-sm font-medium" style={{ color }}>{unit}</span>}
      </div>
      <div className="text-sm font-medium mt-1" style={{ color: 'var(--color-text)' }}>{label}</div>
      <div className="text-[11px] leading-snug" style={{ color: 'var(--color-text-secondary)' }}>{desc}</div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl px-3 py-2 text-sm" style={{ background: '#1a1f2e', border: '1px solid rgba(0,229,204,0.3)', color: '#fff' }}>
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color ?? CYAN }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
}

type Range = { kind: 'preset'; days: number } | { kind: 'custom'; from: string; to: string };

function rangeToParams(r: Range): string {
  if (r.kind === 'preset') return `days=${r.days}`;
  return `from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`;
}

function rangeKey(r: Range): string {
  return r.kind === 'preset' ? `p:${r.days}` : `c:${r.from}:${r.to}`;
}

function todayIso(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export default function AdminAnalytics() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [range, setRange] = useState<Range>({ kind: 'preset', days: 7 });
  const [customOpen, setCustomOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(todayIso(-7));
  const [customTo, setCustomTo] = useState(todayIso(0));
  const [slaTarget, setSlaTarget] = useState(15);

  const params = useMemo(() => rangeToParams(range), [range]);
  const rkey = useMemo(() => rangeKey(range), [range]);

  const { data: frequency } = useQuery({ queryKey: ['freq', rkey], queryFn: async () => (await api.get(`/analytics/issue-frequency?${params}`)).data });
  const { data: hourly }    = useQuery({ queryKey: ['hourly', rkey], queryFn: async () => (await api.get(`/analytics/hourly?${params}`)).data });
  const { data: cleaners }  = useQuery({ queryKey: ['cleaners', rkey], queryFn: async () => (await api.get(`/analytics/cleaners?${params}`)).data });
  const { data: sla }       = useQuery({ queryKey: ['sla', rkey, slaTarget], queryFn: async () => (await api.get(`/analytics/sla?${params}&targetMinutes=${slaTarget}`)).data });
  const { data: dow }       = useQuery({ queryKey: ['dow', rkey], queryFn: async () => (await api.get(`/analytics/day-of-week?${params}`)).data });
  const { data: patterns }  = useQuery({ queryKey: ['patterns', rkey], queryFn: async () => (await api.get(`/analytics/patterns?${params}`)).data });

  const slaColor = !sla ? CYAN : sla.slaPercent >= 80 ? GREEN : sla.slaPercent >= 50 ? AMBER : RED;

  const isPreset = (d: number) => range.kind === 'preset' && range.days === d;
  const applyCustom = () => {
    if (customFrom && customTo) setRange({ kind: 'custom', from: customFrom, to: customTo });
  };

  const minutesUnit = t('common.minutes');

  // ── Frequency chart: compute max for proportional bars
  const freqMax = Math.max(1, ...((frequency ?? []).map((f: any) => f.count)));

  const buildExportSections = (): ExportSection[] => {
    const sections: ExportSection[] = [];

    if (sla && sla.totalResolved > 0) {
      sections.push({
        title: 'SLA',
        headers: [t('admin.analytics.slaTarget'), t('admin.analytics.slaGoalMet'), t('admin.analytics.slaAvg'), t('admin.analytics.slaMedian'), t('admin.analytics.slaP90')],
        rows: [[`${slaTarget} ${minutesUnit}`, `${sla.slaPercent}% (${sla.withinSla}/${sla.totalResolved})`, `${sla.avgMinutes} ${minutesUnit}`, `${sla.p50} ${minutesUnit}`, `${sla.p90} ${minutesUnit}`]],
      });
    }

    if (frequency?.length) {
      sections.push({
        title: t('admin.analytics.frequencyTitle').replace(/[^\w\u0590-\u05FF ]/g, ''),
        headers: [t('admin.analytics.issueFrequency'), t('admin.analytics.count'), t('admin.analytics.avgTime')],
        rows: frequency.map((f: any) => [f.nameI18n?.[lang] ?? f.nameI18n?.he ?? '—', f.count, `${f.avgResolutionMinutes} ${minutesUnit}`]),
      });
    }

    if (hourly?.length) {
      sections.push({
        title: t('admin.analytics.hourlyTitle').replace(/[^\w\u0590-\u05FF ]/g, ''),
        headers: [t('admin.analytics.hourlyDistribution'), t('admin.analytics.count')],
        rows: hourly.map((h: any) => [`${h.hour}:00`, h.count]),
      });
    }

    if (dow?.length) {
      sections.push({
        title: t('admin.analytics.dowTitle').replace(/[^\w\u0590-\u05FF ]/g, ''),
        headers: [t('admin.analytics.days'), t('admin.analytics.count')],
        rows: dow.map((d: any) => [lang === 'he' ? d.dayHe : d.dayEn, d.count]),
      });
    }

    if (cleaners?.length) {
      sections.push({
        title: t('admin.analytics.cleanerTitle').replace(/[^\w\u0590-\u05FF ]/g, ''),
        headers: ['#', t('admin.cleaners.fullName'), t('admin.analytics.resolved'), t('admin.analytics.avgTime')],
        rows: cleaners.map((c: any, i: number) => [i + 1, c.name, c.totalResolved, `${Math.round(c.avgResolutionMinutes)} ${minutesUnit}`]),
      });
    }

    if (patterns?.hotspots?.length) {
      sections.push({
        title: t('admin.analytics.busiestRestrooms'),
        headers: ['#', t('admin.analytics.busiestRestrooms'), t('admin.analytics.count')],
        rows: patterns.hotspots.map((h: any, i: number) => [i + 1, h.location, h.count]),
      });
    }

    return sections;
  };

  const handleExportPdf = () => {
    const sections = buildExportSections();
    if (sections.length === 0) return;
    exportToPdf(sections, 'toiletmon_analytics', `ToiletMon — ${t('admin.analytics.title')}`);
  };

  const handleExportExcel = () => {
    const sections = buildExportSections();
    if (sections.length === 0) return;
    exportToExcel(sections, 'toiletmon_analytics');
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{t('admin.analytics.title')}</h1>
          <div className="flex gap-1.5">
            <button onClick={handleExportPdf} title={t('admin.analytics.exportPdf')}
              className="p-2 rounded-lg transition-all hover:scale-105"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444' }}>
              <FileDown size={16} />
            </button>
            <button onClick={handleExportExcel} title={t('admin.analytics.exportExcel')}
              className="p-2 rounded-lg transition-all hover:scale-105"
              style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e' }}>
              <FileSpreadsheet size={16} />
            </button>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {[
            { label: t('admin.analytics.lastDay'), value: 1 },
            { label: t('admin.analytics.last2Days'), value: 2 },
            { label: t('admin.analytics.lastWeek'), value: 7 },
            { label: t('admin.analytics.lastMonth'), value: 30 },
            { label: t('admin.analytics.last2Months'), value: 60 },
          ].map(({ label, value }) => (
            <button key={value} onClick={() => { setRange({ kind: 'preset', days: value }); setCustomOpen(false); }}
              className="px-3 py-1.5 rounded-lg text-sm transition-all"
              style={{
                background: isPreset(value) ? 'rgba(0,229,204,0.15)' : 'var(--color-card)',
                border: `1px solid ${isPreset(value) ? CYAN : 'rgba(255,255,255,0.08)'}`,
                color: isPreset(value) ? CYAN : 'var(--color-text-secondary)',
              }}>
              {label}
            </button>
          ))}

          {/* Custom-range button */}
          <button
            onClick={() => setCustomOpen(o => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all"
            style={{
              background: range.kind === 'custom' ? 'rgba(0,229,204,0.15)' : 'var(--color-card)',
              border: `1px solid ${range.kind === 'custom' || customOpen ? CYAN : 'rgba(255,255,255,0.08)'}`,
              color: range.kind === 'custom' || customOpen ? CYAN : 'var(--color-text-secondary)',
            }}>
            <Calendar size={14} />
            {range.kind === 'custom'
              ? `${range.from} ↔ ${range.to}`
              : t('admin.analytics.customRange')}
          </button>
        </div>
      </div>

      {/* Custom range pickers (collapsible) */}
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
            <input type="date" value={customTo} min={customFrom} max={todayIso(0)} onChange={e => setCustomTo(e.target.value)}
              className="px-3 py-2 rounded-xl text-sm text-white outline-none"
              style={{ background: '#0a0e1a', border: '1px solid rgba(0,229,204,0.25)', colorScheme: 'dark' }} />
          </div>
          <button onClick={applyCustom}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{ background: 'rgba(0,229,204,0.15)', border: `1px solid ${CYAN}`, color: CYAN }}>
            {t('admin.analytics.apply')}
          </button>
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{t('admin.analytics.customRangeHint')}</span>
        </div>
      )}

      {/* ── SLA ── */}
      <Card title={t('admin.analytics.slaTitle')}>
        {/* Top header — explanation + target picker */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-start gap-2 flex-1 min-w-0 max-w-2xl">
            <Info size={14} className="mt-0.5 flex-shrink-0" style={{ color: CYAN }} />
            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              {t('admin.analytics.slaIntro')}
            </p>
          </div>
          <div className="flex flex-col gap-1 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            <span>{t('admin.analytics.slaTarget')}</span>
            <div className="flex gap-1">
              {[10, 15, 20, 30].map(tv => (
                <button key={tv} onClick={() => setSlaTarget(tv)}
                  className="px-2 py-1 rounded-lg text-xs"
                  style={{
                    background: slaTarget === tv ? 'rgba(0,229,204,0.15)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${slaTarget === tv ? CYAN : 'rgba(255,255,255,0.1)'}`,
                    color: slaTarget === tv ? CYAN : 'var(--color-text-secondary)',
                  }}>
                  {tv} {minutesUnit}
                </button>
              ))}
            </div>
          </div>
        </div>

        {sla && sla.totalResolved > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
            {/* SLA % gauge */}
            <div className="flex flex-col items-center justify-center col-span-2 md:col-span-1 rounded-xl p-3 gap-1" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ width: 120, height: 120, position: 'relative' }}>
                <RadialBarChart width={120} height={120} innerRadius={38} outerRadius={55}
                  data={[{ value: sla.slaPercent, fill: slaColor }]} startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                  <RadialBar dataKey="value" cornerRadius={8} background={{ fill: 'rgba(255,255,255,0.06)' }} />
                </RadialBarChart>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="text-xl font-bold tabular-nums" style={{ color: slaColor }}>{sla.slaPercent}%</span>
                </div>
              </div>
              <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{t('admin.analytics.slaGoalMet')}</div>
              <div className="text-xs tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                {sla.withinSla} / {sla.totalResolved}
              </div>
              <div className="text-[11px] leading-snug text-center mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                {t('admin.analytics.slaGoalDesc', { target: slaTarget })}
              </div>
            </div>

            <SlaStat
              value={sla.avgMinutes}
              unit={minutesUnit}
              label={t('admin.analytics.slaAvg')}
              desc={t('admin.analytics.slaAvgDesc')}
              color={CYAN}
            />
            <SlaStat
              value={sla.p50}
              unit={minutesUnit}
              label={t('admin.analytics.slaMedian')}
              desc={t('admin.analytics.slaMedianDesc')}
              color={CYAN}
            />
            <SlaStat
              value={sla.p90}
              unit={minutesUnit}
              label={t('admin.analytics.slaP90')}
              desc={t('admin.analytics.slaP90Desc')}
              color={sla.p90 > slaTarget * 2 ? RED : AMBER}
            />
          </div>
        ) : (
          <div className="text-center py-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t('admin.analytics.slaNoData')}
          </div>
        )}
      </Card>

      {/* ── Frequency + Patterns ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title={t('admin.analytics.frequencyTitle')}>
          {(frequency ?? []).length === 0 ? (
            <div className="text-center py-6 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t('admin.analytics.noData')}</div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {(frequency ?? []).map((f: any, i: number) => {
                const name = f.nameI18n?.[lang] ?? f.nameI18n?.he ?? f.nameI18n?.en ?? '—';
                const widthPct = Math.max(4, (f.count / freqMax) * 100);
                const barColor = `rgba(0,229,204,${Math.max(0.4, 1 - i * 0.1)})`;
                return (
                  <div key={f.issueTypeId} className="flex items-center gap-3">
                    {/* Label (fixed width on right in RTL) */}
                    <div className="text-sm truncate flex-shrink-0" style={{ width: 130, color: 'var(--color-text)' }}>
                      {name}
                    </div>
                    {/* Bar track */}
                    <div className="flex-1 relative rounded-full overflow-hidden" style={{ height: 14, background: 'rgba(255,255,255,0.05)' }}>
                      <div style={{ width: `${widthPct}%`, height: '100%', background: barColor, borderRadius: 999, transition: 'width 0.3s ease' }} />
                    </div>
                    {/* Count */}
                    <div className="text-sm font-bold tabular-nums flex-shrink-0" style={{ width: 28, textAlign: 'end', color: CYAN }}>
                      {f.count}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card title={t('admin.analytics.patternsTitle')}>
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-xs mb-2 font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t('admin.analytics.recurringIssues')}</p>
              {(patterns?.topIssues ?? []).map((issue: any) => (
                <div key={issue.name} className="flex items-center gap-3 py-1.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <span className="text-xl">{issue.icon}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>
                        {issue.nameI18n?.[lang] ?? issue.nameI18n?.he ?? issue.name}
                      </span>
                      {issue.aboveAvg && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.15)', color: RED }}>{t('admin.analytics.aboveAvg')}</span>
                      )}
                    </div>
                    <div className="w-full mt-1 rounded-full overflow-hidden" style={{ height: 4, background: 'rgba(255,255,255,0.06)' }}>
                      <div style={{ width: `${Math.min(100, (issue.count / (patterns?.totalIncidents || 1)) * 100 * 3)}%`, height: '100%', background: issue.aboveAvg ? RED : CYAN, borderRadius: 4 }} />
                    </div>
                  </div>
                  <span className="text-sm font-bold tabular-nums" style={{ color: issue.aboveAvg ? RED : CYAN }}>{issue.count}</span>
                </div>
              ))}
            </div>
            <div className="mt-2">
              <p className="text-xs mb-2 font-medium" style={{ color: 'var(--color-text-secondary)' }}>{t('admin.analytics.busiestRestrooms')}</p>
              {(patterns?.hotspots ?? []).slice(0, 3).map((h: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b text-sm" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>📍 {h.location}</span>
                  <span className="font-bold tabular-nums" style={{ color: AMBER }}>{h.count}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      {/* ── Hourly + DoW ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title={t('admin.analytics.hourlyTitle')}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourly ?? []}>
              <XAxis dataKey="hour" stroke="#8a9bb0" tick={{ fill: '#8a9bb0', fontSize: 11 }} tickFormatter={(h) => `${h}:00`} interval={3} />
              <YAxis stroke="#8a9bb0" tick={{ fill: '#8a9bb0', fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name={t('admin.analytics.reports')} fill={CYAN} fillOpacity={0.65} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title={t('admin.analytics.dowTitle')}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dow ?? []}>
              <XAxis dataKey={lang === 'he' ? 'dayHe' : 'dayEn'} stroke="#8a9bb0" tick={{ fill: '#8a9bb0', fontSize: 11 }} />
              <YAxis stroke="#8a9bb0" tick={{ fill: '#8a9bb0', fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name={t('admin.analytics.reports')} radius={[4, 4, 0, 0]}>
                {(dow ?? []).map((_: any, i: number) => (
                  <Cell key={i} fill={DAY_COLORS[i]} fillOpacity={0.75} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* ── Worker performance ── */}
      <Card title={t('admin.analytics.cleanerTitle')}>
        <div className="flex flex-col gap-2">
          {(cleaners ?? []).map((c: any, i: number) => (
            <div key={c.id} className="flex items-center gap-4 py-2.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: i === 0 ? 'rgba(250,204,21,0.2)' : 'rgba(255,255,255,0.06)', color: i === 0 ? '#facc15' : 'var(--color-text-secondary)' }}>
                {i === 0 ? '🥇' : i + 1}
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{c.name}</div>
                <div className="w-full mt-1 rounded-full overflow-hidden" style={{ height: 4, background: 'rgba(255,255,255,0.06)' }}>
                  <div style={{
                    width: `${Math.min(100, (c.totalResolved / Math.max(...(cleaners ?? []).map((x: any) => x.totalResolved), 1)) * 100)}%`,
                    height: '100%', background: CYAN, borderRadius: 4,
                  }} />
                </div>
              </div>
              <div className="text-right">
                <div className="text-base font-bold" style={{ color: CYAN }}>{c.totalResolved} ✓</div>
                <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  {Math.round(c.avgResolutionMinutes)} {minutesUnit} {t('admin.analytics.avgLabel')}
                </div>
              </div>
            </div>
          ))}
          {(!cleaners || cleaners.length === 0) && (
            <div className="text-center py-6 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t('admin.analytics.noData')}</div>
          )}
        </div>
      </Card>
    </div>
  );
}
