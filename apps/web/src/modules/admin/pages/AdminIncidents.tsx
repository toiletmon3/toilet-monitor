import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Clock, Wrench, CheckSquare, AlertTriangle } from 'lucide-react';
import api from '../../../lib/api';
import { IncidentRow } from '../components/IncidentRow';

function Section({
  title, icon, count, color, children, defaultOpen = true,
}: {
  title: string; icon: React.ReactNode; count: number; color: string;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="flex flex-col gap-2">
      <button className="flex items-center gap-3 px-1 py-1 w-full text-start" onClick={() => setOpen(o => !o)}>
        <span style={{ color }}>{icon}</span>
        <span className="font-bold text-base" style={{ color: 'var(--color-text)' }}>{title}</span>
        <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: `${color}22`, color }}>
          {count}
        </span>
        <span className="ms-auto" style={{ color: 'var(--color-text-secondary)' }}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-2">
          {count === 0
            ? <div className="text-sm px-4 py-6 text-center rounded-xl" style={{ color: 'var(--color-text-secondary)', background: 'var(--color-card)' }}>{t('admin.incidents.empty')}</div>
            : children}
        </div>
      )}
    </div>
  );
}

export default function AdminIncidents() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [showResolved, setShowResolved] = useState(false);

  const { data: urgentData = [] } = useQuery({
    queryKey: ['incidents', 'urgent'],
    queryFn: async () => (await api.get('/incidents/urgent')).data,
    refetchInterval: 15_000,
  });

  const { data: activeData, isLoading: loadingActive } = useQuery({
    queryKey: ['incidents', 'active'],
    queryFn: async () => (await api.get('/incidents', { params: { limit: 200 } })).data,
    refetchInterval: 15_000,
  });

  const { data: resolvedData, isLoading: loadingResolved } = useQuery({
    queryKey: ['incidents', 'resolved'],
    queryFn: async () => (await api.get('/incidents', { params: { status: 'RESOLVED', limit: 50 } })).data,
    enabled: showResolved,
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
  });
  const cleaners = (users ?? []).filter((u: any) => u.role === 'CLEANER' && u.isActive);

  const allActive: any[] = activeData?.items ?? [];
  const inProgress = allActive.filter(i => i.status === 'IN_PROGRESS' && i.issueType?.code !== 'positive_feedback');
  const openItems  = allActive.filter(i => i.status === 'OPEN'        && i.issueType?.code !== 'positive_feedback');
  const resolved: any[]       = (resolvedData?.items ?? []).filter((i: any) => i.issueType?.code !== 'positive_feedback');
  const positiveFeedback: any[] = (resolvedData?.items ?? []).filter((i: any) => i.issueType?.code === 'positive_feedback');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{t('admin.incidents.title')}</h1>
          <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{inProgress.length + openItems.length} {t('admin.incidents.active')}</span>
        </div>
      </div>

      {loadingActive ? (
        <div className="p-12 text-center" style={{ color: 'var(--color-text-secondary)' }}>{t('common.loading')}</div>
      ) : (
        <>
          {urgentData.length > 0 && (
            <Section title={t('admin.incidents.urgentSection')} icon={<AlertTriangle size={18} />} count={urgentData.length} color="#ef4444">
              {urgentData.map((inc: any) => (
                <div key={inc.id} className="rounded-xl overflow-hidden" style={{ background: 'var(--color-bg)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="text-xl">{inc.issueType?.icon ?? '⚠️'}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm" style={{ color: 'var(--color-text)' }}>
                        {inc.issueType?.nameI18n?.[lang] ?? inc.issueType?.nameI18n?.he}
                      </div>
                      <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                        📍 {[inc.restroom?.floor?.building?.name, inc.restroom?.floor?.name, inc.restroom?.name].filter(Boolean).join(' › ')}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                        ⏱ {inc.minutesOpen} {t('common.minutes')}
                      </span>
                      {inc.escalationRound > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                          ⚠️ ×{inc.escalationRound}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </Section>
          )}

          <Section title={t('admin.incidents.inProgressSection')} icon={<Wrench size={18} />} count={inProgress.length} color="#f59e0b">
            {inProgress.map(inc => <IncidentRow key={inc.id} inc={inc} cleaners={cleaners} />)}
          </Section>

          <Section title={t('admin.incidents.waitingSection')} icon={<Clock size={18} />} count={openItems.length} color="#ef4444">
            {openItems.map(inc => <IncidentRow key={inc.id} inc={inc} cleaners={cleaners} />)}
          </Section>

          {/* RESOLVED toggle */}
          <div className="flex flex-col gap-2">
            <button onClick={() => setShowResolved(v => !v)} className="flex items-center gap-3 px-1 py-1 w-full text-start">
              <span style={{ color: '#22c55e' }}><CheckSquare size={18} /></span>
              <span className="font-bold text-base" style={{ color: 'var(--color-text)' }}>{t('admin.incidents.resolvedSection')}</span>
              {resolvedData && (
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(34,197,94,0.13)', color: '#22c55e' }}>
                  {resolved.length}
                </span>
              )}
              <span className="ms-auto text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {showResolved ? t('admin.incidents.hide') : t('admin.incidents.show')}
              </span>
            </button>

            {showResolved && (
              loadingResolved
                ? <div className="text-sm px-4 py-6 text-center" style={{ color: 'var(--color-text-secondary)' }}>{t('common.loading')}</div>
                : resolved.length === 0
                  ? <div className="text-sm px-4 py-6 text-center rounded-xl" style={{ color: 'var(--color-text-secondary)', background: 'var(--color-card)' }}>{t('admin.incidents.noData')}</div>
                  : <div className="flex flex-col gap-2">
                      {resolved.map(inc => <IncidentRow key={inc.id} inc={inc} cleaners={cleaners} />)}
                    </div>
            )}
          </div>

          {showResolved && positiveFeedback.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 px-1 py-1">
                <span>😊</span>
                <span className="font-bold text-base" style={{ color: 'var(--color-text)' }}>{t('admin.incidents.positiveFeedback')}</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(250,204,21,0.13)', color: '#facc15' }}>
                  {positiveFeedback.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {positiveFeedback.map((inc: any) => {
                  const location = [inc.restroom?.floor?.building?.name, inc.restroom?.floor?.name, inc.restroom?.name].filter(Boolean).join(' › ');
                  const diff = Date.now() - new Date(inc.reportedAt).getTime();
                  const m = Math.floor(diff / 60000);
                  const timeAgo = m < 60 ? t('admin.incidents.agoMinutes', { n: m })
                    : Math.floor(m / 60) < 24 ? t('admin.incidents.agoHours', { n: Math.floor(m / 60) })
                    : t('admin.incidents.agoDays', { n: Math.floor(m / 1440) });
                  return (
                    <div key={inc.id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                      style={{ background: 'var(--color-bg)', border: '1px solid rgba(250,204,21,0.15)' }}>
                      <span className="text-2xl">😊</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>{t('admin.incidents.positiveFeedbackLabel')}</div>
                        <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-secondary)' }}>📍 {location}</div>
                      </div>
                      <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{timeAgo}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
