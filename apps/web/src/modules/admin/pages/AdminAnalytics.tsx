import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from 'recharts';
import api from '../../../lib/api';
import toast from 'react-hot-toast';
import ConfirmDialog from '../../../components/ConfirmDialog';
import { Trash2 } from 'lucide-react';

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

function StatBig({ value, label, color = CYAN, sub }: { value: string | number; label: string; color?: string; sub?: string }) {
  return (
    <div className="text-center">
      <div className="text-4xl font-bold tabular-nums" style={{ color }}>{value}</div>
      <div className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>{label}</div>
      {sub && <div className="text-xs mt-0.5 opacity-60" style={{ color: 'var(--color-text-secondary)' }}>{sub}</div>}
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

type DeleteDialog = { scope: 'resolved' | 'older' | 'all'; olderThanDays?: number } | null;

export default function AdminAnalytics() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [days, setDays] = useState(30);
  const [slaTarget, setSlaTarget] = useState(15);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialog>(null);
  const qc = useQueryClient();

  const handleDelete = async () => {
    if (!deleteDialog) return;
    const params = new URLSearchParams({ scope: deleteDialog.scope });
    if (deleteDialog.olderThanDays) params.set('olderThanDays', String(deleteDialog.olderThanDays));
    const { data } = await api.delete(`/incidents/bulk?${params}`);
    toast.success(t('admin.incidents.deletedCount', { count: data.deleted }));
    qc.invalidateQueries({ queryKey: ['incidents'] });
    qc.invalidateQueries({ queryKey: ['freq'] });
    qc.invalidateQueries({ queryKey: ['sla'] });
    qc.invalidateQueries({ queryKey: ['dow'] });
    qc.invalidateQueries({ queryKey: ['patterns'] });
    qc.invalidateQueries({ queryKey: ['cleaners'] });
  };

  const q = (key: string, url: string) => useQuery({
    queryKey: [key, days],
    queryFn: async () => (await api.get(url)).data,
  });

  const { data: frequency } = q('freq', `/analytics/issue-frequency?days=${days}`);
  const { data: hourly }    = useQuery({ queryKey: ['hourly'], queryFn: async () => (await api.get('/analytics/hourly?days=7')).data });
  const { data: cleaners }  = q('cleaners', `/analytics/cleaners?days=${days}`);
  const { data: sla }       = useQuery({ queryKey: ['sla', days, slaTarget], queryFn: async () => (await api.get(`/analytics/sla?days=${days}&targetMinutes=${slaTarget}`)).data });
  const { data: dow }       = q('dow', `/analytics/day-of-week?days=${days}`);
  const { data: patterns }  = q('patterns', `/analytics/patterns?days=${days}`);

  const slaColor = !sla ? CYAN : sla.slaPercent >= 80 ? GREEN : sla.slaPercent >= 50 ? AMBER : RED;

  const deleteDialogContent = deleteDialog ? {
    resolved: { title: t('admin.incidents.deleteResolvedTitle'), desc: t('admin.incidents.deleteResolvedDesc') },
    older:    { title: t('admin.incidents.deleteOlderTitle'),    desc: t('admin.incidents.deleteOlderDesc') },
    all:      { title: t('admin.incidents.deleteAllTitle'),      desc: t('admin.incidents.deleteAllDesc') },
  }[deleteDialog.scope] : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{t('admin.analytics.title')}</h1>
        <div className="flex gap-2 flex-wrap items-center">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className="px-3 py-1.5 rounded-lg text-sm transition-all"
              style={{
                background: days === d ? 'rgba(0,229,204,0.15)' : 'var(--color-card)',
                border: `1px solid ${days === d ? CYAN : 'rgba(255,255,255,0.08)'}`,
                color: days === d ? CYAN : 'var(--color-text-secondary)',
              }}>
              {d} {t('common.days')}
            </button>
          ))}

          <div className="w-px h-5 mx-1" style={{ background: 'rgba(255,255,255,0.1)' }} />
          <div className="flex gap-1">
            <button onClick={() => setDeleteDialog({ scope: 'resolved' })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
              <Trash2 size={12} /> {t('admin.analytics.deleteResolved')}
            </button>
            <button onClick={() => setDeleteDialog({ scope: 'older', olderThanDays: 30 })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
              <Trash2 size={12} /> {t('admin.analytics.deleteOlder')}
            </button>
            <button onClick={() => setDeleteDialog({ scope: 'all' })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all"
              style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
              <Trash2 size={12} /> {t('admin.analytics.deleteAll')}
            </button>
          </div>
        </div>
      </div>

      {deleteDialog && deleteDialogContent && (
        <ConfirmDialog
          title={deleteDialogContent.title}
          description={deleteDialogContent.desc}
          confirmLabel={t('admin.incidents.deleteConfirmLabel')}
          requireType={deleteDialog.scope === 'all' ? t('admin.incidents.deleteAllRequireType') : undefined}
          onConfirm={handleDelete}
          onClose={() => setDeleteDialog(null)}
        />
      )}

      {/* ── SLA ── */}
      <Card title={t('admin.analytics.slaTitle')}>
        <div className="flex items-center gap-4 flex-wrap">
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
                  {tv}′
                </button>
              ))}
            </div>
          </div>
        </div>

        {sla && sla.totalResolved > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
            <div className="flex flex-col items-center col-span-2 md:col-span-1">
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
              <div className="text-xs mt-1 text-center" style={{ color: 'var(--color-text-secondary)' }}>
                {t('admin.analytics.slaGoalMet')}<br />{sla.withinSla} / {sla.totalResolved}
              </div>
            </div>
            <StatBig value={`${sla.avgMinutes}′`} label={t('admin.analytics.slaAvg')} color={CYAN} />
            <StatBig value={`${sla.p50}′`} label={t('admin.analytics.slaMedian')} color={CYAN} sub={t('admin.analytics.slaP50sub')} />
            <StatBig value={`${sla.p90}′`} label={t('admin.analytics.slaP90')} color={sla.p90 > slaTarget * 2 ? RED : AMBER} sub={t('admin.analytics.slaP90sub')} />
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
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={frequency ?? []} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis type="number" stroke="#8a9bb0" tick={{ fill: '#8a9bb0', fontSize: 11 }} />
              <YAxis type="category" dataKey={`nameI18n.${lang}`} stroke="#8a9bb0" tick={{ fill: '#8a9bb0', fontSize: 11 }} width={110} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name={t('admin.analytics.reports')} radius={[0, 6, 6, 0]}>
                {(frequency ?? []).map((_: any, i: number) => (
                  <Cell key={i} fill={`rgba(0,229,204,${Math.max(0.3, 0.9 - i * 0.12)})`} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
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
                  {Math.round(c.avgResolutionMinutes)}′ {t('admin.analytics.avgLabel')}
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
