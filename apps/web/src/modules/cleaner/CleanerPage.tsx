import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, RefreshCw, ChevronDown } from 'lucide-react';
import api from '../../lib/api';
import { getSocket, joinOrg } from '../../lib/socket';
import { unregisterPush } from '../../lib/push';
import IOSInstallBanner from '../../components/IOSInstallBanner';
import toast from 'react-hot-toast';

function IncidentCard({ inc, lang, onResolve }: {
  inc: any; lang: string;
  onResolve: () => void;
}) {
  const { t } = useTranslation();
  const location = [
    inc.restroom?.floor?.building?.name,
    inc.restroom?.floor?.name,
    inc.restroom?.name,
  ].filter(Boolean).join(' › ');

  return (
    <div className="rounded-2xl p-4 flex flex-col gap-3"
      style={{
        background: 'var(--color-card)',
        border: '1px solid rgba(0,229,204,0.18)',
      }}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{inc.issueType?.icon ?? '📋'}</span>
          <div>
            <div className="font-semibold" style={{ color: 'var(--color-text)' }}>
              {inc.issueType?.nameI18n?.[lang] ?? inc.issueType?.nameI18n?.he}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>📍 {location}</div>
          </div>
        </div>
        <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {timeAgo(inc.reportedAt, lang)}
        </span>
      </div>
      <button onClick={onResolve}
        className="w-full py-2.5 rounded-xl text-sm font-medium active:scale-95 transition-all"
        style={{ background: 'rgba(0,229,204,0.15)', color: 'var(--color-accent)', border: '1px solid rgba(0,229,204,0.4)' }}>
        ✓ {t('cleaner.done')}
      </button>
    </div>
  );
}

function useClock() {
  const [now, setNow] = useState(new Date());
  const ref = useRef<ReturnType<typeof setInterval>>(null);
  useEffect(() => {
    ref.current = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(ref.current!);
  }, []);
  return now;
}

function timeAgo(date: string, lang: string) {
  const diff = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (diff < 1) return lang === 'he' ? 'עכשיו' : 'just now';
  if (diff < 60) return lang === 'he' ? `לפני ${diff} דקות` : `${diff}m ago`;
  const h = Math.floor(diff / 60);
  return lang === 'he' ? `לפני ${h} שע'` : `${h}h ago`;
}




export default function CleanerPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const now = useClock();
  const queryClient = useQueryClient();
  const user = JSON.parse(localStorage.getItem('user') ?? '{}');
  const lang = i18n.language;
  const tz = localStorage.getItem('orgTimezone') ?? 'Asia/Jerusalem';

  // Filter state
  const [filterFloorId, setFilterFloorId] = useState<string>('');
  const [filterRestroomId, setFilterRestroomId] = useState<string>('');
  const [showFilter, setShowFilter] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('accessToken')) { navigate('/cleaner/login'); return; }
  }, [navigate]);

  // Fetch building structure for floor/restroom filter (only if cleaner has a building)
  const { data: structure } = useQuery({
    queryKey: ['cleaner-structure'],
    queryFn: async () => {
      const { data } = await api.get('/buildings/structure');
      const myBuilding = data.find((b: any) => b.id === user.buildingId);
      return myBuilding ?? null;
    },
    enabled: !!user.buildingId,
  });

  const floors: any[] = structure?.floors ?? [];
  const activeFloor = floors.find(f => f.id === filterFloorId);
  const restrooms: any[] = activeFloor?.restrooms ?? [];

  // Today's completed count for this cleaner
  const { data: todayData } = useQuery({
    queryKey: ['cleaner-today', user.id],
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { data } = await api.get('/incidents', {
        params: { status: 'RESOLVED', assignedCleanerId: user.id, from: todayStart.toISOString(), limit: 0 },
      });
      return data.total ?? 0;
    },
    refetchInterval: 60_000,
  });
  const completedToday = todayData ?? 0;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['cleaner-incidents', filterFloorId, filterRestroomId],
    queryFn: async () => {
      const params = {
        ...(filterFloorId && { floorId: filterFloorId }),
        ...(filterRestroomId && { restroomId: filterRestroomId }),
        limit: 50,
      };
      const open = await api.get('/incidents', { params: { ...params, status: 'OPEN' } });
      return { open: open.data.items ?? [] };
    },
    refetchInterval: 30_000,
  });

  const { data: rawPositiveFeedback = [] } = useQuery({
    queryKey: ['cleaner-positive-feedback'],
    queryFn: async () => (await api.get('/incidents/positive-feedback')).data,
    refetchInterval: 60_000,
  });

  // Track which positive feedback IDs have been "seen" (dismissed when all tasks were cleared)
  const [dismissedFeedbackIds, setDismissedFeedbackIds] = useState<Set<string>>(new Set());
  const positiveFeedback = rawPositiveFeedback.filter((f: any) => !dismissedFeedbackIds.has(f.id));

  // Real-time updates
  useEffect(() => {
    const orgId = user.orgId;
    if (orgId) joinOrg(orgId);

    const socket = getSocket();
    const handler = () => {
      toast(t('cleaner.newTask'), { duration: 4000 });
      queryClient.invalidateQueries({ queryKey: ['cleaner-incidents'] });
    };
    socket.on('incident:created', handler);
    socket.on('incident:resolved', () => queryClient.invalidateQueries({ queryKey: ['cleaner-incidents'] }));
    return () => { socket.off('incident:created', handler); };
  }, [queryClient]);

  const handleResolve = async (incidentId: string) => {
    await api.patch(`/incidents/${incidentId}/resolve`, { cleanerIdNumber: user.idNumber });
    queryClient.invalidateQueries({ queryKey: ['cleaner-incidents'] });
    queryClient.invalidateQueries({ queryKey: ['cleaner-today'] });
    queryClient.invalidateQueries({ queryKey: ['cleaner-positive-feedback'] });
    toast.success(t('cleaner.resolved'));
  };

  const handleLogout = () => {
    unregisterPush().catch(() => {});
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    navigate('/cleaner/login');
  };

  const openIncidents = data?.open ?? [];

  // When all tasks are cleared, dismiss any currently-visible positive feedback
  // so it won't reappear when new tasks arrive.
  const prevOpenRef = useRef(openIncidents.length);
  useEffect(() => {
    if (prevOpenRef.current > 0 && openIncidents.length === 0 && positiveFeedback.length > 0) {
      setDismissedFeedbackIds(prev => {
        const next = new Set(prev);
        for (const f of rawPositiveFeedback) next.add(f.id);
        return next;
      });
    }
    prevOpenRef.current = openIncidents.length;
  }, [openIncidents.length]);

  const activeFiltersLabel = useMemo(() => {
    const parts: string[] = [];
    if (filterFloorId) {
      const fl = floors.find(f => f.id === filterFloorId);
      if (fl) parts.push(fl.name);
    }
    if (filterRestroomId) {
      const rm = restrooms.find(r => r.id === filterRestroomId);
      if (rm) parts.push(rm.name);
    }
    return parts.join(' › ');
  }, [filterFloorId, filterRestroomId, floors, restrooms]);

  return (
    <div style={{ height: '100dvh', overflow: 'hidden', background: 'var(--color-bg)', display: 'flex', flexDirection: 'column' }}>
      {/* iOS install guide / notification enable button */}
      <IOSInstallBanner userId={user?.id} orgId={user?.orgId} />

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-4 sticky top-0 z-10"
        style={{ background: 'var(--color-surface)', borderBottom: '1px solid rgba(0,229,204,0.15)' }}
      >
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{t('cleaner.title')}</h1>
            <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--color-accent)' }}>
              {now.toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
          <p className="text-xs flex items-center gap-2 flex-wrap mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            <span>{now.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-US', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' })}</span>
            <span>·</span>
            <span>{user.name}</span>
            {user.buildingName && (
              <span className="px-1.5 py-0.5 rounded text-xs" style={{ background: 'rgba(0,229,204,0.12)', color: 'var(--color-accent)' }}>
                🏢 {user.buildingName}
              </span>
            )}
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{ background: completedToday > 0 ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.07)', color: completedToday > 0 ? '#22c55e' : 'var(--color-text-secondary)', border: `1px solid ${completedToday > 0 ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}` }}>
              ✅ {completedToday} {t('cleaner.doneToday')}
            </span>
          </p>
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

      {/* Floor/Restroom filter (only if assigned to a building) */}
      {user.buildingId && floors.length > 0 && (
        <div className="px-4 pt-3" style={{ background: 'var(--color-surface)' }}>
          <button
            onClick={() => setShowFilter(v => !v)}
            className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl w-full mb-2"
            style={{
              background: (filterFloorId || filterRestroomId) ? 'rgba(0,229,204,0.1)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${(filterFloorId || filterRestroomId) ? 'rgba(0,229,204,0.4)' : 'rgba(255,255,255,0.08)'}`,
              color: (filterFloorId || filterRestroomId) ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            }}
          >
            <span className="flex-1 text-start">
              {activeFiltersLabel || t('cleaner.allFloorsRestrooms')}
            </span>
            <ChevronDown size={14} className={`transition-transform ${showFilter ? 'rotate-180' : ''}`} />
          </button>

          {showFilter && (
            <div className="pb-3 flex flex-col gap-2">
              {/* Floor chips */}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => { setFilterFloorId(''); setFilterRestroomId(''); }}
                  className="px-3 py-1 rounded-full text-xs font-medium"
                  style={{
                    background: !filterFloorId ? 'rgba(0,229,204,0.15)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${!filterFloorId ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)'}`,
                    color: !filterFloorId ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  }}
                >
                  {t('cleaner.all')}
                </button>
                {floors.map(f => (
                  <button
                    key={f.id}
                    onClick={() => { setFilterFloorId(f.id); setFilterRestroomId(''); }}
                    className="px-3 py-1 rounded-full text-xs font-medium"
                    style={{
                      background: filterFloorId === f.id ? 'rgba(0,229,204,0.15)' : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${filterFloorId === f.id ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)'}`,
                      color: filterFloorId === f.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {f.name}
                  </button>
                ))}
              </div>

              {/* Restroom chips (only when floor selected) */}
              {filterFloorId && restrooms.length > 0 && (
                <div className="flex flex-wrap gap-2 ps-2">
                  <button
                    onClick={() => setFilterRestroomId('')}
                    className="px-3 py-1 rounded-full text-xs"
                    style={{
                      background: !filterRestroomId ? 'rgba(0,229,204,0.1)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${!filterRestroomId ? 'rgba(0,229,204,0.4)' : 'rgba(255,255,255,0.08)'}`,
                      color: !filterRestroomId ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {t('cleaner.allRestrooms')}
                  </button>
                  {restrooms.map((r: any) => (
                    <button
                      key={r.id}
                      onClick={() => setFilterRestroomId(r.id)}
                      className="px-3 py-1 rounded-full text-xs"
                      style={{
                        background: filterRestroomId === r.id ? 'rgba(0,229,204,0.1)' : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${filterRestroomId === r.id ? 'rgba(0,229,204,0.4)' : 'rgba(255,255,255,0.08)'}`,
                        color: filterRestroomId === r.id ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                      }}
                    >
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 px-4 py-3 flex flex-col gap-4 overflow-y-auto" style={{ minHeight: 0 }}>
        {isLoading && (
          <div className="flex-1 flex items-center justify-center pt-16" style={{ color: 'var(--color-text-secondary)' }}>
            {t('common.loading')}
          </div>
        )}

        {!isLoading && openIncidents.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center pt-16">
            <div className="text-5xl">✅</div>
            <p style={{ color: 'var(--color-text-secondary)' }}>{t('cleaner.noTasks')}</p>
          </div>
        )}

        {/* ── Section: Open (queue) ── */}
        {!isLoading && openIncidents.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-1">
              <span className="text-xs font-bold tracking-wide" style={{ color: '#ef4444' }}>
                📋 {t('cleaner.waitingQueue')} ({openIncidents.length})
              </span>
              <div className="flex-1 h-px" style={{ background: 'rgba(239,68,68,0.2)' }} />
            </div>
            {openIncidents.map((inc: any) => (
              <IncidentCard key={inc.id} inc={inc} lang={lang}
                onResolve={() => handleResolve(inc.id)} />
            ))}
          </div>
        )}

        {/* ── Section: Positive Feedback — only while open tasks exist ── */}
        {!isLoading && positiveFeedback.length > 0 && openIncidents.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 px-1">
              <span className="text-xs font-bold tracking-wide" style={{ color: '#22c55e' }}>
                💚 {t('cleaner.positiveFeedback')} ({positiveFeedback.length})
              </span>
              <div className="flex-1 h-px" style={{ background: 'rgba(34,197,94,0.2)' }} />
            </div>
            {positiveFeedback.map((inc: any) => {
              const location = [
                inc.restroom?.floor?.building?.name,
                inc.restroom?.floor?.name,
                inc.restroom?.name,
              ].filter(Boolean).join(' › ');
              return (
                <div key={inc.id} className="rounded-2xl p-4 flex items-center gap-3"
                  style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.18)' }}>
                  <span className="text-3xl">😊</span>
                  <div>
                    <div className="font-semibold" style={{ color: 'var(--color-text)' }}>
                      {t('cleaner.positiveFeedbackLabel')}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>📍 {location}</div>
                  </div>
                  <span className="text-xs ms-auto" style={{ color: 'var(--color-text-secondary)' }}>
                    {timeAgo(inc.reportedAt, lang)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
