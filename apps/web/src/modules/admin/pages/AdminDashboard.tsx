import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle, ChevronDown, ChevronRight, Building2, Calendar,
  ArrowUp, ArrowDown, Minus, CheckCircle2, AlertTriangle, Table2, LayoutGrid,
  Layers, DoorOpen,
} from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, LineChart, Line, LabelList,
  ComposedChart, Bar, XAxis, YAxis,
} from 'recharts';
import api from '../../../lib/api';
import { getSocket, joinOrg } from '../../../lib/socket';
import { translateFloorName, translateRestroomName, translateLocationPath } from '../../../lib/translate-name';

const GENERAL_COLORS: Record<string, string> = { like: '#22c55e', cleaning: '#ef4444', maintenance: '#3b82f6' };
const RED_SHADES = ['#ef4444', '#f87171', '#fca5a5', '#fb7185', '#e11d48', '#fecaca'];

/** Numeric → traffic-light colour for the score pills (higher = better). */
function scoreColor(score: number): string {
  if (score >= 85) return '#22c55e';
  if (score >= 70) return '#84cc16';
  if (score >= 55) return '#f59e0b';
  if (score >= 40) return '#f97316';
  return '#ef4444';
}

function fmtNum(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

/** Downsample a daily series to ~n evenly-spaced points (for the labeled line charts). */
function downsample(arr: number[], n = 5): number[] {
  if (arr.length <= n) return arr;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.round((i * (arr.length - 1)) / (n - 1))]);
  return out;
}

/** Top-row ("previous period") KPI — light card with a filled area sparkline. */
function KpiCardLight({ label, value, unit, color, spark }: {
  label: string; value: string | number; unit?: string; color: string; spark?: number[];
}) {
  const data = (spark ?? []).map((v, i) => ({ i, v }));
  const gid = `sparkL-${label.replace(/\W/g, '')}`;
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-1 overflow-hidden"
      style={{ background: 'var(--color-card)', border: '1px solid rgba(255,255,255,0.07)' }}>
      <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums leading-none" style={{ color: 'var(--color-text)' }}>{value}</span>
        {unit && <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{unit}</span>}
      </div>
      <div style={{ height: 38, marginInline: -16, marginBottom: -16 }}>
        {data.length > 1 && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#${gid})`} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/** Bottom-row ("current period") KPI — bold solid-colored card with a labeled line chart + trend arrow. */
function KpiCardBold({ label, value, unit, color, trend, spark }: {
  label: string; value: string | number; unit?: string; color: string; trend?: any; spark?: number[];
}) {
  const data = downsample(spark ?? []).map((v, i) => ({ i, v }));
  const Icon = trend ? (trend.dir === 'up' ? ArrowUp : trend.dir === 'down' ? ArrowDown : Minus) : null;
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-2 overflow-hidden relative" style={{ background: color }}>
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold text-white/90">{label}</span>
        {Icon && (
          <span className="w-6 h-6 rounded-full flex items-center justify-center bg-white/25">
            <Icon size={14} className="text-white" strokeWidth={2.5} />
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-bold tabular-nums leading-none text-white">{value}</span>
        {unit && <span className="text-sm font-medium text-white/80">{unit}</span>}
      </div>
      <div style={{ height: 52, marginInline: -8, marginBottom: -8 }}>
        {data.length > 1 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 14, right: 12, bottom: 4, left: 12 }}>
              <Line type="monotone" dataKey="v" stroke="rgba(255,255,255,0.95)" strokeWidth={2}
                dot={{ r: 2.5, fill: '#fff' }} isAnimationActive={false}>
                <LabelList dataKey="v" position="top" style={{ fill: '#fff', fontSize: 10, fontWeight: 600 }} />
              </Line>
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/** Donut chart with a percentage legend. */
function Donut({ title, data }: { title: string; data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-3" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
      <h3 className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>{title}</h3>
      {total === 0 ? (
        <div className="flex-1 flex items-center justify-center py-8 text-sm" style={{ color: 'var(--color-text-secondary)' }}>—</div>
      ) : (
        <div className="flex items-center gap-4">
          <div style={{ width: 130, height: 130, flexShrink: 0 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={42} outerRadius={62} paddingAngle={2} isAnimationActive={false}>
                  {data.map((d) => <Cell key={d.name} fill={d.color} stroke="transparent" />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid rgba(0,229,204,0.2)', borderRadius: 12, color: 'var(--color-text)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-col gap-1.5 flex-1 min-w-0">
            {data.map((d) => (
              <div key={d.name} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                <span className="truncate flex-1" style={{ color: 'var(--color-text-secondary)' }}>{d.name}</span>
                <span className="font-semibold tabular-nums" style={{ color: 'var(--color-text)' }}>
                  {Math.round((d.value / total) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Custom dot for the Glance line chart that labels only local maxima. */
function PeakDot(props: any) {
  const { cx, cy, value, payload, color } = props;
  if (cx == null || cy == null) return null;
  const isPeak = payload?.__isPeak;
  if (!isPeak) return <circle cx={cx} cy={cy} r={2} fill={color} />;
  return (
    <g>
      <circle cx={cx} cy={cy} r={3.5} fill={color} />
      <g transform={`translate(${cx},${cy - 18})`}>
        <rect x={-14} y={-9} width={28} height={16} rx={8} fill={color} />
        <text x={0} y={2} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={700}>{value}</text>
      </g>
    </g>
  );
}

/** Slide-6 "Performance at a Glance" — KPI strip, combined bars+line chart, top-complaint donut. */
function GlanceBlock({ glance, lang, t, minutesUnit }: any) {
  if (!glance) return null;
  // Annotate peaks (local maxima) so the line chart can pin labels there.
  const series = (glance.dailySeries ?? []).map((d: any, i: number, arr: any[]) => {
    const prev = arr[i - 1]?.complaints ?? -1;
    const next = arr[i + 1]?.complaints ?? -1;
    return { ...d, __isPeak: d.complaints > 0 && d.complaints >= prev && d.complaints > next };
  });
  const TIER_COLOR: Record<string, string> = { good: '#22c55e', warning: '#f59e0b', critical: '#ef4444' };
  const top = glance.topComplaint;
  const topName = top?.nameI18n?.[lang] ?? top?.nameI18n?.he ?? top?.nameI18n?.en ?? '';
  return (
    <div className="rounded-2xl p-5 flex flex-col gap-4" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
      <h3 className="font-semibold text-sm" style={{ color: 'var(--color-text)' }}>{t('admin.dashboard.glanceTitle')}</h3>
      {/* KPI strip */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-2">
        <GlanceChip label={t('admin.dashboard.ovAvgScore')} value={glance.avgScore ?? '—'} color="#3b82f6" />
        <GlanceChip label={t('admin.dashboard.ovComplaints')} value={glance.complaintsTotal ?? '—'} color="#ef4444" />
        <GlanceChip label={t('admin.dashboard.ovVisits')} value={glance.visits ?? 0} color="#22c55e" />
        <GlanceChip label={t('admin.dashboard.ovResponseTime')} value={`${glance.avgResponse ?? 0} ${minutesUnit}`} color="#f97316" />
        <GlanceChip label={t('admin.dashboard.ovComplaintRate')} value={`${glance.complaintRate ?? 0}%`} color="#a855f7" />
        <GlanceChip label={t('admin.dashboard.ovTimeSaved')} value={`${glance.timeSaved ?? 0} ${t('admin.dashboard.ovHoursShort')}`} color="#eab308" />
      </div>
      {/* Combined chart + donut */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4">
        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 18, right: 12, bottom: 8, left: 0 }}>
              <XAxis dataKey="date" stroke="#8a9bb0" tick={{ fill: '#8a9bb0', fontSize: 10 }} interval="preserveStartEnd"
                tickFormatter={(s: string) => s.slice(5)} />
              <YAxis yAxisId="left" stroke="#8a9bb0" tick={{ fill: '#8a9bb0', fontSize: 10 }} domain={[0, 100]} />
              <YAxis yAxisId="right" orientation="right" stroke="#8a9bb0" tick={{ fill: '#8a9bb0', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid rgba(0,229,204,0.2)', borderRadius: 12, color: 'var(--color-text)', fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="avgScore" name={t('admin.dashboard.ovAvgScore')} fillOpacity={0.85} isAnimationActive={false}>
                {series.map((d: any, i: number) => <Cell key={i} fill={TIER_COLOR[d.tier]} />)}
              </Bar>
              <Line yAxisId="right" type="monotone" dataKey="complaints" name={t('admin.dashboard.ovComplaints')}
                stroke="#ef4444" strokeWidth={2} isAnimationActive={false}
                dot={<PeakDot color="#ef4444" />}
                activeDot={{ r: 4, fill: '#ef4444' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col items-center justify-center" style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 12 }}>
          <span className="text-[11px] uppercase tracking-wide mb-2" style={{ color: 'var(--color-text-secondary)' }}>{t('admin.dashboard.ovTopComplaint')}</span>
          {top ? (
            <>
              <div style={{ width: 130, height: 130 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={[{ name: 'top', value: top.percent }, { name: 'rest', value: Math.max(0, 100 - top.percent) }]}
                      dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={60} startAngle={90} endAngle={-270} isAnimationActive={false}>
                      <Cell fill="#ef4444" /><Cell fill="rgba(239,68,68,0.15)" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="text-2xl font-bold tabular-nums" style={{ color: '#ef4444' }}>{top.percent}%</div>
              <div className="text-xs text-center mt-1" style={{ color: 'var(--color-text)' }}>
                {top.icon && <span>{top.icon} </span>}{topName}
              </div>
              <div className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>{top.count} {t('admin.dashboard.ovComplaints')}</div>
            </>
          ) : (
            <div className="py-8 text-sm" style={{ color: 'var(--color-text-secondary)' }}>—</div>
          )}
        </div>
      </div>
    </div>
  );
}

function GlanceChip({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: `${color}14`, border: `1px solid ${color}40` }}>
      <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>{label}</div>
      <div className="text-lg font-bold tabular-nums" style={{ color }}>{value}</div>
    </div>
  );
}

/** Slide-8 "Deep Dive" — wide per-restroom table. */
function DeepDiveTable({ rows, lang, t, minutesUnit }: any) {
  const data: any[] = rows ?? [];
  if (data.length === 0) return null;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
      <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(0,229,204,0.1)' }}>
        <h2 className="font-semibold text-white">{t('admin.dashboard.deepDiveTitle')}</h2>
        <p className="text-[11px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>{t('admin.dashboard.deepDiveSubtitle')}</p>
      </div>
      <div className="overflow-x-auto" style={{ maxHeight: 520 }}>
        <table className="w-full text-sm" style={{ minWidth: 920 }}>
          <thead className="sticky top-0" style={{ background: 'var(--color-card)' }}>
            <tr style={{ color: 'var(--color-text-secondary)' }}>
              {[
                'ddRoomName','ddVisits','ddComplaints','ddTopComplaint','ddCleaners','ddSupervisors','ddAvgResponse','ddSatisfaction','ddScore',
              ].map(k => (
                <th key={k} className="text-start font-medium px-3 py-2.5 text-[10px] uppercase tracking-wide whitespace-nowrap">{t(`admin.dashboard.${k}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map(r => {
              const topName = r.topComplaint?.nameI18n?.[lang] ?? r.topComplaint?.nameI18n?.he ?? r.topComplaint?.nameI18n?.en ?? '—';
              const satColor = r.satisfactionPct >= 80 ? '#22c55e' : r.satisfactionPct >= 50 ? '#f59e0b' : '#ef4444';
              return (
                <tr key={r.restroomId} className="border-t hover:bg-white/5" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--color-text)' }}>{translateLocationPath(r.location, lang)}</td>
                  <td className="px-3 py-2.5 tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{r.visits}</td>
                  <td className="px-3 py-2.5 tabular-nums" style={{ color: '#ef4444' }}>{r.complaints}</td>
                  <td className="px-3 py-2.5" style={{ minWidth: 160 }}>
                    {r.topComplaint ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center justify-between text-xs">
                          <span style={{ color: 'var(--color-text)' }}>{r.topComplaint.icon} {topName}</span>
                          <span className="font-bold" style={{ color: '#ef4444' }}>{r.topComplaint.percent}%</span>
                        </div>
                        <div style={{ height: 4, background: 'rgba(239,68,68,0.15)', borderRadius: 3 }}>
                          <div style={{ width: `${r.topComplaint.percent}%`, height: '100%', background: '#ef4444', borderRadius: 3 }} />
                        </div>
                      </div>
                    ) : <span style={{ color: 'var(--color-text-secondary)' }}>—</span>}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{r.cleanerArrivals}</td>
                  <td className="px-3 py-2.5 tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{r.supervisorArrivals}</td>
                  <td className="px-3 py-2.5 tabular-nums whitespace-nowrap" style={{ color: '#f97316' }}>{r.avgResponseMinutes} {minutesUnit}</td>
                  <td className="px-3 py-2.5" style={{ minWidth: 110 }}>
                    <div className="flex items-center gap-2">
                      <div className="flex-1" style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
                        <div style={{ width: `${r.satisfactionPct}%`, height: '100%', background: satColor, borderRadius: 3 }} />
                      </div>
                      <span className="text-xs font-bold tabular-nums" style={{ color: satColor }}>{r.satisfactionPct}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center"><ScorePill score={r.score} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScorePill({ score, trend }: { score: number; trend?: 'up' | 'down' | 'flat' }) {
  const color = scoreColor(score);
  const TrendIcon = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : null;
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold tabular-nums text-sm" style={{ background: color, color: '#0a0e1a' }}>
      {score}
      {TrendIcon && <TrendIcon size={13} strokeWidth={2.5} />}
    </span>
  );
}

function DashboardIncidentRow({ inc }: { inc: any }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [open, setOpen] = useState(false);

  const ACTION_LABEL: Record<string, string> = {
    REPORTED:     t('admin.incidents.actionReported'),
    ACKNOWLEDGED: t('admin.incidents.actionAcknowledged'),
    RESOLVED:     t('admin.incidents.actionResolved'),
    ESCALATED:    t('admin.incidents.actionEscalated'),
  };

  const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
    OPEN: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444', label: t('admin.incidents.open') },
    IN_PROGRESS: { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b', label: t('admin.incidents.inProgress') },
    RESOLVED: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e', label: t('admin.incidents.resolved') },
  };

  const st = STATUS_STYLES[inc.status] ?? STATUS_STYLES.OPEN;
  const location = [
    inc.restroom?.floor?.building?.name,
    translateFloorName(inc.restroom?.floor?.name ?? '', lang),
    translateRestroomName(inc.restroom?.name ?? '', lang),
  ].filter(Boolean).join(' › ');

  return (
    <div>
      <div
        className="px-5 py-3 flex items-center justify-between gap-4 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xl">{inc.issueType?.icon ?? '📋'}</span>
          <div className="min-w-0">
            <div className="text-sm font-medium text-white truncate">
              {inc.issueType?.nameI18n?.[lang] ?? inc.issueType?.nameI18n?.he}
            </div>
            <div className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
              📍 {location}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {new Date(inc.reportedAt).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')}
          </div>
          <span
            className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{ background: st.bg, color: st.text }}
          >
            {st.label}
          </span>
          {open
            ? <ChevronDown size={14} style={{ color: 'var(--color-accent)' }} />
            : <ChevronRight size={14} style={{ color: 'var(--color-text-secondary)' }} />}
        </div>
      </div>

      {open && (
        <div className="px-5 pb-4 pt-2 flex flex-col gap-3" style={{ borderTop: '1px solid rgba(0,229,204,0.08)' }}>
          <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            <span>{t('admin.incidents.reportedAt')}: </span>
            <span>{new Date(inc.reportedAt).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')}</span>
          </div>

          {inc.assignedCleaner && (
            <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              <span>{t('admin.incidents.assignCleaner')}: </span>
              <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,229,204,0.1)', color: 'var(--color-accent)' }}>
                👤 {inc.assignedCleaner.name}
              </span>
            </div>
          )}

          {(inc.actions ?? []).length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>{t('admin.incidents.history')}</p>
              {inc.actions.map((a: any) => (
                <div key={a.id} className="flex items-start gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: 'var(--color-accent)' }} />
                  <span>
                    <b style={{ color: 'var(--color-text)' }}>{ACTION_LABEL[a.actionType] ?? a.actionType}</b>
                    {a.user && ` — ${a.user.name}`}
                    {a.notes && ` — "${a.notes}"`}
                    <span className="ms-2 opacity-50">{new Date(a.performedAt).toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-US')}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const [buildingId, setBuildingId] = useState<string>(''); // '' = all
  const [floorId, setFloorId] = useState<string>('');
  const [restroomId, setRestroomId] = useState<string>('');
  const [range, setRange] = useState<string>('30'); // 'today' | 'yesterday' | '7' | '30' | '90'
  const [view, setView] = useState<'table' | 'cards'>('table');

  const { data: buildings = [] } = useQuery({
    queryKey: ['building-structure'],
    queryFn: async () => (await api.get('/buildings/structure')).data,
  });

  // Floors/restrooms cascade from the building filter.
  const selectedBuilding = buildings.find((b: any) => b.id === buildingId);
  const floors: any[] = selectedBuilding?.floors ?? [];
  const selectedFloor = floors.find((f: any) => f.id === floorId);
  const restrooms: any[] = selectedFloor?.restrooms ?? [];
  const selectedRestroom = restrooms.find((r: any) => r.id === restroomId);

  // Reset child filters when parent changes.
  useEffect(() => { setFloorId(''); setRestroomId(''); }, [buildingId]);
  useEffect(() => { setRestroomId(''); }, [floorId]);

  // 'today'/'yesterday' resolve to explicit from/to; numeric presets use days=N.
  const rangeParam = (() => {
    if (range === 'today' || range === 'yesterday') {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      if (range === 'today') {
        return `from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(new Date().toISOString())}`;
      }
      const yStart = new Date(start); yStart.setDate(yStart.getDate() - 1);
      const yEnd = new Date(start.getTime() - 1);
      return `from=${encodeURIComponent(yStart.toISOString())}&to=${encodeURIComponent(yEnd.toISOString())}`;
    }
    return `days=${range}`;
  })();
  const scopeParam = `${buildingId ? `&buildingId=${buildingId}` : ''}${floorId ? `&floorId=${floorId}` : ''}${restroomId ? `&restroomId=${restroomId}` : ''}`;
  const ovParams = `${rangeParam}${scopeParam}`;
  const { data: ov } = useQuery({
    queryKey: ['analytics-overview', range, buildingId, floorId, restroomId],
    queryFn: async () => (await api.get(`/analytics/overview?${ovParams}`)).data,
    refetchInterval: 30_000,
  });

  const { data: urgentData = [] } = useQuery({
    queryKey: ['incidents', 'urgent'],
    queryFn: async () => (await api.get('/incidents/urgent')).data,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const orgId = localStorage.getItem('orgId');
    if (orgId) joinOrg(orgId);

    const socket = getSocket();
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['analytics-overview'] });
    };
    socket.on('incident:created', refresh);
    socket.on('incident:resolved', refresh);
    socket.on('incident:escalated', refresh);
    return () => { socket.off('incident:created', refresh); socket.off('incident:resolved', refresh); socket.off('incident:escalated', refresh); };
  }, [queryClient]);

  const selectedBuildingName = buildings.find((b: any) => b.id === buildingId)?.name;
  const minutesUnit = t('admin.dashboard.ovMinShort');

  const prevKpis = ov?.kpis?.previous;
  const curKpis = ov?.kpis?.current;
  const generalData = (ov?.donuts?.general ?? []).map((d: any) => ({
    name: t(`admin.dashboard.ov${d.key.charAt(0).toUpperCase() + d.key.slice(1)}`),
    value: d.count, color: GENERAL_COLORS[d.key] ?? '#8a9bb0',
  }));
  const cleaningData = (ov?.donuts?.cleaning ?? []).map((d: any, i: number) => ({
    name: `${d.icon ? d.icon + ' ' : ''}${d.nameI18n?.[lang] ?? d.nameI18n?.he ?? d.issueTypeId}`,
    value: d.count, color: RED_SHADES[i % RED_SHADES.length],
  }));

  const rooms: any[] = ov?.rooms ?? [];
  const fmtTime = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtRange = (a?: string, b?: string) =>
    a && b ? `${new Date(a).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: '2-digit', month: '2-digit' })} – ${new Date(b).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { day: '2-digit', month: '2-digit' })}` : '';

  const RANGES: { v: string; key: string }[] = [
    { v: 'today', key: 'ovToday' }, { v: 'yesterday', key: 'ovYesterday' },
    { v: '7', key: 'ovLast7' }, { v: '30', key: 'ovLast30' }, { v: '90', key: 'ovLast90' },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Header: title + range + building filter */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-white">{t('admin.title')}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.2)' }}>
            <Calendar size={14} style={{ color: 'var(--color-accent)' }} className="self-center ms-1" />
            {RANGES.map(r => (
              <button key={r.v} onClick={() => setRange(r.v)}
                className="text-xs px-2.5 py-1 rounded-lg transition-colors"
                style={{
                  background: range === r.v ? 'rgba(0,229,204,0.15)' : 'transparent',
                  color: range === r.v ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                }}>
                {t(`admin.dashboard.${r.key}`)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.25)' }}>
            <Building2 size={15} style={{ color: 'var(--color-accent)' }} />
            <select value={buildingId} onChange={e => setBuildingId(e.target.value)}
              className="bg-transparent text-sm outline-none" style={{ color: 'var(--color-text)', minWidth: 140 }}>
              <option value="" style={{ background: '#0a0e1a' }}>{t('admin.dashboard.allBuildings')}</option>
              {buildings.map((b: any) => (
                <option key={b.id} value={b.id} style={{ background: '#0a0e1a' }}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.25)', opacity: buildingId ? 1 : 0.45 }}>
            <Layers size={15} style={{ color: 'var(--color-accent)' }} />
            <select value={floorId} onChange={e => setFloorId(e.target.value)} disabled={!buildingId}
              title={!buildingId ? t('admin.dashboard.pickBuildingFirst') : undefined}
              className="bg-transparent text-sm outline-none disabled:cursor-not-allowed" style={{ color: 'var(--color-text)', minWidth: 120 }}>
              <option value="" style={{ background: '#0a0e1a' }}>{t('admin.dashboard.allFloors')}</option>
              {floors.map((f: any) => (
                <option key={f.id} value={f.id} style={{ background: '#0a0e1a' }}>{f.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.25)', opacity: floorId ? 1 : 0.45 }}>
            <DoorOpen size={15} style={{ color: 'var(--color-accent)' }} />
            <select value={restroomId} onChange={e => setRestroomId(e.target.value)} disabled={!floorId}
              title={!floorId ? t('admin.dashboard.pickFloorFirst') : undefined}
              className="bg-transparent text-sm outline-none disabled:cursor-not-allowed" style={{ color: 'var(--color-text)', minWidth: 120 }}>
              <option value="" style={{ background: '#0a0e1a' }}>{t('admin.dashboard.allRestrooms')}</option>
              {restrooms.map((r: any) => (
                <option key={r.id} value={r.id} style={{ background: '#0a0e1a' }}>{r.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {buildingId && (
        <div className="text-xs flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: 'rgba(0,229,204,0.06)', border: '1px solid rgba(0,229,204,0.2)', color: 'var(--color-accent)' }}>
          {t('admin.dashboard.filteredBy')}:{' '}
          <span className="font-semibold">
            {[selectedBuildingName, selectedFloor?.name, selectedRestroom?.name].filter(Boolean).join(' › ')}
          </span>
          <button onClick={() => setBuildingId('')} className="ms-auto underline hover:text-white">
            {t('admin.dashboard.clearFilter')}
          </button>
        </div>
      )}

      {/* KPI row 1 — previous period (baseline, light cards) */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-secondary)' }}>{t('admin.dashboard.ovPrevPeriod')}</span>
          <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)', opacity: 0.7 }}>{fmtRange(prevKpis?.from, prevKpis?.to)}</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCardLight label={t('admin.dashboard.ovAvgScore')} value={prevKpis?.avgScore?.value ?? 100} color="#3b82f6" spark={prevKpis?.avgScore?.spark} />
          <KpiCardLight label={t('admin.dashboard.ovComplaints')} value={fmtNum(prevKpis?.complaints?.value ?? 0)} color="#ef4444" spark={prevKpis?.complaints?.spark} />
          <KpiCardLight label={t('admin.dashboard.ovResponseTime')} value={prevKpis?.responseTime?.value ?? 0} unit={minutesUnit} color="#f59e0b" spark={prevKpis?.responseTime?.spark} />
          <KpiCardLight label={t('admin.dashboard.ovTimeSaved')} value={prevKpis?.timeSaved?.value ?? 0} unit={t('admin.dashboard.ovHoursShort')} color="#eab308" spark={prevKpis?.timeSaved?.spark} />
        </div>
      </div>

      {/* KPI row 2 — current selected period (bold colored cards, trend vs previous) */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-accent)' }}>{t('admin.dashboard.ovCurrentPeriod')}</span>
          <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{fmtRange(curKpis?.from, curKpis?.to)}</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCardBold label={t('admin.dashboard.ovAvgScore')} value={curKpis?.avgScore?.value ?? 100} color="#3b82f6" trend={curKpis?.avgScore?.trend} spark={curKpis?.avgScore?.spark} />
          <KpiCardBold label={t('admin.dashboard.ovComplaints')} value={fmtNum(curKpis?.complaints?.value ?? 0)} color="#ef4444" trend={curKpis?.complaints?.trend} spark={curKpis?.complaints?.spark} />
          <KpiCardBold label={t('admin.dashboard.ovResponseTime')} value={curKpis?.responseTime?.value ?? 0} unit={minutesUnit} color="#f97316" trend={curKpis?.responseTime?.trend} spark={curKpis?.responseTime?.spark} />
          <KpiCardBold label={t('admin.dashboard.ovTimeSaved')} value={curKpis?.timeSaved?.value ?? 0} unit={t('admin.dashboard.ovHoursShort')} color="#eab308" trend={curKpis?.timeSaved?.trend} spark={curKpis?.timeSaved?.spark} />
        </div>
        <p className="text-[11px] mt-2" style={{ color: 'var(--color-text-secondary)' }}>
          {t('admin.dashboard.ovVsPrev')} · {t('admin.dashboard.ovTimeSavedHint', { min: ov?.baselinePatrolMinutes ?? 45 })}
        </p>
      </div>

      {/* Urgent alerts */}
      {urgentData.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-card)', border: '1px solid rgba(239,68,68,0.3)' }}>
          <div className="px-5 py-4 flex items-center gap-2 border-b" style={{ borderColor: 'rgba(239,68,68,0.2)' }}>
            <AlertCircle size={16} style={{ color: '#ef4444' }} />
            <h2 className="font-semibold text-white">{t('admin.dashboard.urgentAlerts')}</h2>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold animate-pulse"
              style={{ background: 'rgba(239,68,68,0.2)', color: '#ef4444' }}>
              {urgentData.length}
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
            {urgentData.map((inc: any) => (
              <DashboardIncidentRow key={inc.id} inc={inc} />
            ))}
          </div>
        </div>
      )}

      {/* Donuts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Donut title={t('admin.dashboard.ovGeneral')} data={generalData} />
        <Donut title={t('admin.dashboard.ovCleaning')} data={cleaningData} />
      </div>

      {/* Slide 6 — Performance at a Glance */}
      <GlanceBlock
        glance={ov?.glance ? {
          ...ov.glance,
          avgScore: curKpis?.avgScore?.value,
          complaintsTotal: curKpis?.complaints?.value,
          avgResponse: curKpis?.responseTime?.value,
          timeSaved: curKpis?.timeSaved?.value,
        } : null}
        lang={lang}
        t={t}
        minutesUnit={minutesUnit}
      />

      {/* Rooms table / cards */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
        <div className="px-5 py-4 flex items-center justify-between gap-3 border-b" style={{ borderColor: 'rgba(0,229,204,0.1)' }}>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-white">{t('admin.dashboard.ovRoomsTitle')}</h2>
            <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(0,229,204,0.15)', color: 'var(--color-accent)' }}>
              {ov?.roomCount ?? 0} {t('admin.dashboard.ovRooms')}
            </span>
          </div>
          <div className="flex gap-1 rounded-lg p-0.5" style={{ background: 'rgba(255,255,255,0.05)' }}>
            <button onClick={() => setView('table')} className="px-2.5 py-1 rounded-md flex items-center gap-1 text-xs"
              style={{ background: view === 'table' ? 'rgba(0,229,204,0.2)' : 'transparent', color: view === 'table' ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
              <Table2 size={13} /> {t('admin.dashboard.ovTableView')}
            </button>
            <button onClick={() => setView('cards')} className="px-2.5 py-1 rounded-md flex items-center gap-1 text-xs"
              style={{ background: view === 'cards' ? 'rgba(0,229,204,0.2)' : 'transparent', color: view === 'cards' ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
              <LayoutGrid size={13} /> {t('admin.dashboard.ovCardsView')}
            </button>
          </div>
        </div>

        {rooms.length === 0 ? (
          <div className="px-5 py-12 text-center" style={{ color: 'var(--color-text-secondary)' }}>{t('admin.dashboard.ovNoData')}</div>
        ) : view === 'table' ? (
          <div className="overflow-x-auto" style={{ maxHeight: 480 }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0" style={{ background: 'var(--color-card)' }}>
                <tr style={{ color: 'var(--color-text-secondary)' }}>
                  <th className="text-start font-medium px-5 py-2.5 text-xs uppercase tracking-wide">{t('admin.dashboard.ovRoomName')}</th>
                  <th className="text-start font-medium px-3 py-2.5 text-xs uppercase tracking-wide">{t('admin.dashboard.ovArrival')}</th>
                  <th className="text-center font-medium px-3 py-2.5 text-xs uppercase tracking-wide">{t('admin.dashboard.ovStatus')}</th>
                  <th className="text-center font-medium px-5 py-2.5 text-xs uppercase tracking-wide">{t('admin.dashboard.ovScore')}</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.restroomId} className="border-t hover:bg-white/5 transition-colors" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    <td className="px-5 py-3" style={{ color: 'var(--color-text)' }}>
                      {translateLocationPath(r.location, lang)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded-md tabular-nums" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
                          {fmtTime(r.lastArrival)}
                        </span>
                        {r.arrivalCount > 0 && (
                          <span className="text-[10px] px-1.5 rounded-full font-bold" style={{ background: 'rgba(34,197,94,0.2)', color: '#22c55e' }}>
                            {r.arrivalCount}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {r.status === 'ok'
                        ? <CheckCircle2 size={18} style={{ color: '#22c55e', display: 'inline' }} />
                        : <AlertTriangle size={18} style={{ color: '#f59e0b', display: 'inline' }} />}
                    </td>
                    <td className="px-5 py-3 text-center">
                      <ScorePill score={r.score} trend={r.trend} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3" style={{ maxHeight: 480, overflowY: 'auto' }}>
            {rooms.map((r) => (
              <div key={r.restroomId} className="rounded-xl p-3 flex flex-col gap-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium leading-tight" style={{ color: 'var(--color-text)' }}>
                    {translateLocationPath(r.location, lang)}
                  </span>
                  {r.status === 'ok'
                    ? <CheckCircle2 size={15} style={{ color: '#22c55e', flexShrink: 0 }} />
                    : <AlertTriangle size={15} style={{ color: '#f59e0b', flexShrink: 0 }} />}
                </div>
                <div className="flex items-center justify-between">
                  <ScorePill score={r.score} trend={r.trend} />
                  <span className="text-[11px] tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                    {fmtTime(r.lastArrival)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Slide 8 — Deep Dive */}
      <DeepDiveTable rows={ov?.deepDive} lang={lang} t={t} minutesUnit={minutesUnit} />
    </div>
  );
}
