import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LogOut, RefreshCw, ChevronDown } from 'lucide-react';
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

  // Filter state
  const [filterFloorId, setFilterFloorId] = useState<string>('');
  const [filterRestroomId, setFilterRestroomId] = useState<string>('');
  const [showFilter, setShowFilter] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('accessToken')) navigate('/cleaner/login');
  }, [navigate]);

  // Fetch building structure for floor/restroom filter (only if cleaner has a building)
  const { data: structure } = useQuery({
    queryKey: ['cleaner-structure'],
    queryFn: async () => {
      const { data } = await api.get('/buildings/structure');
      // find the cleaner's building
      const myBuilding = data.find((b: any) => b.id === user.buildingId);
      return myBuilding ?? null;
    },
    enabled: !!user.buildingId,
  });

  const floors: any[] = structure?.floors ?? [];
  const activeFloor = floors.find(f => f.id === filterFloorId);
  const restrooms: any[] = activeFloor?.restrooms ?? [];

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['cleaner-incidents', filterFloorId, filterRestroomId],
    queryFn: async () => {
      // fetch OPEN + IN_PROGRESS so accepted tasks stay visible
      const [open, inProgress] = await Promise.all([
        api.get('/incidents', { params: { status: 'OPEN',        limit: 50, ...(filterFloorId && { floorId: filterFloorId }), ...(filterRestroomId && { restroomId: filterRestroomId }) } }),
        api.get('/incidents', { params: { status: 'IN_PROGRESS', limit: 50, ...(filterFloorId && { floorId: filterFloorId }), ...(filterRestroomId && { restroomId: filterRestroomId }) } }),
      ]);
      const items = [
        ...(inProgress.data.items ?? []),  // IN_PROGRESS first (I already accepted them)
        ...(open.data.items ?? []),
      ];
      return { items, total: items.length };
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
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-4 sticky top-0 z-10"
        style={{ background: 'var(--color-surface)', borderBottom: '1px solid rgba(0,229,204,0.15)' }}
      >
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--color-text)' }}>{t('cleaner.title')}</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            {user.name}
            {user.buildingName && (
              <span className="ms-2 px-1.5 py-0.5 rounded text-xs" style={{ background: 'rgba(0,229,204,0.12)', color: 'var(--color-accent)' }}>
                🏢 {user.buildingName}
              </span>
            )}
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
              {activeFiltersLabel || (lang === 'he' ? 'כל הקומות והשירותים' : 'All floors & restrooms')}
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
                  {lang === 'he' ? 'הכל' : 'All'}
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
                    {lang === 'he' ? 'כל השירותים' : 'All restrooms'}
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
      <div className="flex-1 px-4 py-4 flex flex-col gap-3">
        {isLoading && (
          <div className="flex-1 flex items-center justify-center" style={{ color: 'var(--color-text-secondary)' }}>
            {t('common.loading')}
          </div>
        )}

        {!isLoading && incidents.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center pt-16">
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
          const inProgress = inc.status === 'IN_PROGRESS';

          return (
            <div
              key={inc.id}
              className="rounded-2xl p-4 flex flex-col gap-3"
              style={{
                background: inProgress ? 'rgba(245,158,11,0.06)' : 'var(--color-card)',
                border: `1px solid ${inProgress ? 'rgba(245,158,11,0.35)' : 'rgba(0,229,204,0.2)'}`,
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{inc.issueType?.icon ?? '📋'}</span>
                  <div>
                    <div className="font-semibold" style={{ color: 'var(--color-text)' }}>
                      {inc.issueType?.nameI18n?.[lang] ?? inc.issueType?.nameI18n?.he}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                      📍 {location}
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {inProgress ? (
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold animate-pulse"
                      style={{ background: 'rgba(245,158,11,0.2)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.5)' }}>
                      {lang === 'he' ? '⚙ בטיפולי' : '⚙ In progress'}
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                      {lang === 'he' ? '● חדש' : '● New'}
                    </span>
                  )}
                  <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {timeAgo(inc.reportedAt, lang)}
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                {inc.status === 'OPEN' && (
                  <button
                    onClick={() => handleAccept(inc.id)}
                    className="flex-1 py-2 rounded-xl text-sm font-medium transition-all active:scale-95"
                    style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.4)' }}
                  >
                    {lang === 'he' ? '👋 קיבלתי — בדרך' : '👋 On my way'}
                  </button>
                )}
                <button
                  onClick={() => handleResolve(inc.id)}
                  className="flex-1 py-2 rounded-xl text-sm font-medium transition-all active:scale-95"
                  style={{ background: 'rgba(0,229,204,0.15)', color: 'var(--color-accent)', border: '1px solid rgba(0,229,204,0.4)' }}
                >
                  {lang === 'he' ? '✓ סיימתי לטפל' : '✓ Done'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
