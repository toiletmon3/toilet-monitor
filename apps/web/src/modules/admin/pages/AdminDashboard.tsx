import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Clock, Users, Tablet, Building2, ChevronDown, ChevronRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import api from '../../../lib/api';
import { getSocket, joinOrg } from '../../../lib/socket';
import { translateFloorName, translateRestroomName } from '../../../lib/translate-name';

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div
      className="rounded-2xl p-5 flex items-center gap-4"
      style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center"
        style={{ background: `${color}22`, border: `1px solid ${color}44` }}
      >
        <Icon size={22} style={{ color }} />
      </div>
      <div>
        <div className="text-2xl font-bold text-white">{value}</div>
        <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{label}</div>
      </div>
    </div>
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

  const { data: buildings = [] } = useQuery({
    queryKey: ['building-structure'],
    queryFn: async () => (await api.get('/buildings/structure')).data,
  });

  const { data: summary } = useQuery({
    queryKey: ['analytics-summary', buildingId],
    queryFn: async () => (
      await api.get('/analytics/summary', { params: buildingId ? { buildingId } : {} })
    ).data,
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
      queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
    };
    socket.on('incident:created', refresh);
    socket.on('incident:resolved', refresh);
    socket.on('incident:escalated', refresh);
    return () => { socket.off('incident:created', refresh); socket.off('incident:resolved', refresh); socket.off('incident:escalated', refresh); };
  }, [queryClient]);

  const selectedBuildingName = buildings.find((b: any) => b.id === buildingId)?.name;

  const PIE_COLORS = ['#00e5cc', '#8b5cf6', '#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#ec4899', '#eab308'];
  const resolvedByType: any[] = summary?.resolvedByType ?? [];
  const incidentBreakdown = resolvedByType.map((d, i) => ({
    name: `${d.icon ? d.icon + ' ' : ''}${d.nameI18n?.[lang] ?? d.nameI18n?.he ?? d.issueTypeId}`,
    value: d.count,
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));
  const incidentTotal = incidentBreakdown.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex flex-col gap-6">
      {/* Header with building filter */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-white">{t('admin.title')}</h1>
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.25)' }}
        >
          <Building2 size={15} style={{ color: 'var(--color-accent)' }} />
          <select
            value={buildingId}
            onChange={e => setBuildingId(e.target.value)}
            className="bg-transparent text-sm outline-none"
            style={{ color: 'var(--color-text)', minWidth: 160 }}
          >
            <option value="" style={{ background: '#0a0e1a' }}>{t('admin.dashboard.allBuildings')}</option>
            {buildings.map((b: any) => (
              <option key={b.id} value={b.id} style={{ background: '#0a0e1a' }}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {buildingId && (
        <div
          className="text-xs flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: 'rgba(0,229,204,0.06)', border: '1px solid rgba(0,229,204,0.2)', color: 'var(--color-accent)' }}
        >
          {t('admin.dashboard.filteredBy')}: <span className="font-semibold">{selectedBuildingName}</span>
          <button onClick={() => setBuildingId('')} className="ms-auto underline hover:text-white">
            {t('admin.dashboard.clearFilter')}
          </button>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={AlertCircle} label={t('admin.summary.openIncidents')} value={summary?.openIncidents ?? 0} color="#ef4444" />
        <StatCard icon={Clock} label={t('admin.summary.avgResolution')} value={`${summary?.avgResolutionMinutes ?? 0} ${t('common.minutes')}`} color="#f59e0b" />
        <StatCard icon={Users} label={t('admin.summary.activeCleaners')} value={summary?.activeCleaners ?? 0} color="#00e5cc" />
        <StatCard icon={Tablet} label={t('admin.summary.onlineDevices')} value={summary?.onlineDevices ?? 0} color="#8b5cf6" />
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

      {/* Incident breakdown (pie) */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(0,229,204,0.1)' }}>
          <h2 className="font-semibold text-white">{t('admin.dashboard.incidentOverview')}</h2>
        </div>

        {incidentTotal === 0 ? (
          <div className="px-5 py-12 text-center" style={{ color: 'var(--color-text-secondary)' }}>
            {t('admin.dashboard.noResolvedIncidents')}
          </div>
        ) : (
          <div className="p-5">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={incidentBreakdown}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  label={({ value }) => (value > 0 ? value : '')}
                >
                  {incidentBreakdown.map((d) => (
                    <Cell key={d.name} fill={d.color} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'var(--color-surface)', border: '1px solid rgba(0,229,204,0.2)', borderRadius: 12, color: 'var(--color-text)' }}
                />
                <Legend
                  iconType="circle"
                  formatter={(val) => <span style={{ color: 'var(--color-text-secondary)' }}>{val}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
