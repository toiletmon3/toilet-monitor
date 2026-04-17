import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, RefreshCw } from 'lucide-react';
import api from '../../lib/api';
import { getSocket, joinOrg } from '../../lib/socket';
import toast from 'react-hot-toast';

function timeAgo(date: string, lang: string) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (diff < 1) return lang === 'he' ? 'עכשיו' : 'just now';
  if (diff < 60) return lang === 'he' ? `לפני ${diff} דק'` : `${diff}m ago`;
  const h = Math.floor(diff / 60);
  return lang === 'he' ? `לפני ${h} שע'` : `${h}h ago`;
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: '#ef4444',
  IN_PROGRESS: '#f59e0b',
  RESOLVED: '#22c55e',
};

export default function CleanerPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = JSON.parse(localStorage.getItem('user') ?? '{}');
  const lang = i18n.language;

  useEffect(() => {
    if (!localStorage.getItem('accessToken')) navigate('/cleaner/login');
  }, [navigate]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['cleaner-incidents'],
    queryFn: async () => {
      const { data } = await api.get('/incidents', { params: { status: 'OPEN' } });
      return data;
    },
    refetchInterval: 30_000,
  });

  // Real-time updates
  useEffect(() => {
    const orgId = localStorage.getItem('orgId');
    if (orgId) joinOrg(orgId);

    const socket = getSocket();
    const handler = () => {
      toast('📋 משימה חדשה!', { duration: 4000 });
      queryClient.invalidateQueries({ queryKey: ['cleaner-incidents'] });
    };
    socket.on('incident:created', handler);
    socket.on('incident:resolved', () => queryClient.invalidateQueries({ queryKey: ['cleaner-incidents'] }));
    return () => { socket.off('incident:created', handler); };
  }, [queryClient]);

  const handleAccept = async (incidentId: string) => {
    await api.patch(`/incidents/${incidentId}/acknowledge`, { cleanerIdNumber: user.idNumber });
    queryClient.invalidateQueries({ queryKey: ['cleaner-incidents'] });
  };

  const handleResolve = async (incidentId: string) => {
    await api.patch(`/incidents/${incidentId}/resolve`, { cleanerIdNumber: user.idNumber });
    queryClient.invalidateQueries({ queryKey: ['cleaner-incidents'] });
    toast.success(lang === 'he' ? 'טופל בהצלחה ✅' : 'Resolved ✅');
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    navigate('/cleaner/login');
  };

  const incidents = data?.items ?? [];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-4 sticky top-0 z-10"
        style={{ background: 'var(--color-surface)', borderBottom: '1px solid rgba(0,229,204,0.15)' }}
      >
        <div>
          <h1 className="text-lg font-bold text-white">{t('cleaner.title')}</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{user.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => refetch()} style={{ color: 'var(--color-text-secondary)' }}>
            <RefreshCw size={18} />
          </button>
          <button onClick={handleLogout} style={{ color: 'var(--color-text-secondary)' }}>
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 px-4 py-4 flex flex-col gap-3">
        {isLoading && (
          <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--color-text-secondary)' }}>
            {t('common.loading')}
          </div>
        )}

        {!isLoading && incidents.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
            <div className="text-5xl">✅</div>
            <p style={{ color: 'var(--color-text-secondary)' }}>{t('cleaner.noTasks')}</p>
          </div>
        )}

        {incidents.map((inc: any) => {
          const location = [
            inc.restroom?.floor?.building?.name,
            inc.restroom?.floor?.name,
            inc.restroom?.name,
          ].filter(Boolean).join(' › ');

          return (
            <div
              key={inc.id}
              className="rounded-2xl p-4 flex flex-col gap-3"
              style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.2)' }}
            >
              {/* Top row */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{inc.issueType?.icon ?? '📋'}</span>
                  <div>
                    <div className="font-semibold text-white">
                      {inc.issueType?.nameI18n?.[lang] ?? inc.issueType?.nameI18n?.he}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                      📍 {location}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      background: `${STATUS_COLORS[inc.status]}22`,
                      color: STATUS_COLORS[inc.status],
                      border: `1px solid ${STATUS_COLORS[inc.status]}44`,
                    }}
                  >
                    {t(`cleaner.status.${inc.status}`)}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {timeAgo(inc.reportedAt, lang)}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {inc.status === 'OPEN' && (
                  <button
                    onClick={() => handleAccept(inc.id)}
                    className="flex-1 py-2 rounded-xl text-sm font-medium transition-all active:scale-95"
                    style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.4)' }}
                  >
                    {t('cleaner.actions.accept')}
                  </button>
                )}
                {(inc.status === 'OPEN' || inc.status === 'IN_PROGRESS') && (
                  <button
                    onClick={() => handleResolve(inc.id)}
                    className="flex-1 py-2 rounded-xl text-sm font-medium transition-all active:scale-95"
                    style={{ background: 'rgba(0,229,204,0.15)', color: 'var(--color-accent)', border: '1px solid rgba(0,229,204,0.4)' }}
                  >
                    ✓ {t('cleaner.actions.resolve')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
