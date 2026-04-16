import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertCircle, Clock, Users, Tablet, CheckCircle } from 'lucide-react';
import api from '../../../lib/api';
import { getSocket, joinOrg } from '../../../lib/socket';

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

export default function AdminDashboard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: async () => (await api.get('/analytics/summary')).data,
    refetchInterval: 30_000,
  });

  const { data: incidentsData } = useQuery({
    queryKey: ['recent-incidents'],
    queryFn: async () => (await api.get('/incidents', { params: { limit: 10 } })).data,
    refetchInterval: 15_000,
  });

  useEffect(() => {
    const orgId = localStorage.getItem('orgId');
    if (orgId) joinOrg(orgId);

    const socket = getSocket();
    const refresh = () => {
      queryClient.invalidateQueries({ queryKey: ['analytics-summary'] });
      queryClient.invalidateQueries({ queryKey: ['recent-incidents'] });
    };
    socket.on('incident:created', refresh);
    socket.on('incident:resolved', refresh);
    return () => { socket.off('incident:created', refresh); socket.off('incident:resolved', refresh); };
  }, [queryClient]);

  const incidents = incidentsData?.items ?? [];

  const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
    OPEN: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444', label: t('admin.incidents.open') },
    IN_PROGRESS: { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b', label: t('admin.incidents.inProgress') },
    RESOLVED: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e', label: t('admin.incidents.resolved') },
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-white">{t('admin.title')}</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={AlertCircle} label={t('admin.summary.openIncidents')} value={summary?.openIncidents ?? 0} color="#ef4444" />
        <StatCard icon={Clock} label={t('admin.summary.avgResolution')} value={`${summary?.avgResolutionMinutes ?? 0} ${t('common.minutes')}`} color="#f59e0b" />
        <StatCard icon={Users} label={t('admin.summary.activeCleaners')} value={summary?.activeCleaners ?? 0} color="#00e5cc" />
        <StatCard icon={Tablet} label={t('admin.summary.onlineDevices')} value={summary?.onlineDevices ?? 0} color="#8b5cf6" />
      </div>

      {/* Recent incidents */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
        <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(0,229,204,0.1)' }}>
          <h2 className="font-semibold text-white">{t('admin.incidents.title')}</h2>
        </div>

        <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          {incidents.length === 0 && (
            <div className="px-5 py-8 text-center" style={{ color: 'var(--color-text-secondary)' }}>
              {t('admin.incidents.empty')}
            </div>
          )}
          {incidents.map((inc: any) => {
            const st = STATUS_STYLES[inc.status] ?? STATUS_STYLES.OPEN;
            const location = [inc.restroom?.floor?.building?.name, inc.restroom?.floor?.name, inc.restroom?.name].filter(Boolean).join(' › ');
            return (
              <div key={inc.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl">{inc.issueType?.icon ?? '📋'}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">
                      {inc.issueType?.nameI18n?.he}
                    </div>
                    <div className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
                      📍 {location}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {new Date(inc.reportedAt).toLocaleString('he-IL')}
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={{ background: st.bg, color: st.text }}
                  >
                    {st.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
