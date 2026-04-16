import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/api';

const FILTERS = ['all', 'OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  OPEN: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' },
  IN_PROGRESS: { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b' },
  RESOLVED: { bg: 'rgba(34,197,94,0.15)', text: '#22c55e' },
};

export default function AdminIncidents() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<'all' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'>('all');
  const [page, setPage] = useState(0);
  const LIMIT = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['incidents', filter, page],
    queryFn: async () => {
      const params: any = { limit: LIMIT, offset: page * LIMIT };
      if (filter !== 'all') params.status = filter;
      return (await api.get('/incidents', { params })).data;
    },
    refetchInterval: 30_000,
  });

  const incidents = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">{t('admin.incidents.title')}</h1>
        <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {total} {t('admin.incidents.title').toLowerCase()}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(0); }}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              background: filter === f ? 'rgba(0,229,204,0.15)' : 'var(--color-card)',
              border: `1px solid ${filter === f ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)'}`,
              color: filter === f ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            }}
          >
            {f === 'all' ? t('admin.incidents.all') : t(`admin.incidents.${f === 'IN_PROGRESS' ? 'inProgress' : f.toLowerCase()}`)}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
        {isLoading ? (
          <div className="p-8 text-center" style={{ color: 'var(--color-text-secondary)' }}>{t('common.loading')}</div>
        ) : incidents.length === 0 ? (
          <div className="p-8 text-center" style={{ color: 'var(--color-text-secondary)' }}>{t('admin.incidents.empty')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'var(--color-text-secondary)' }}>
                  <th className="px-4 py-3 text-left">{t('admin.incidents.issue')}</th>
                  <th className="px-4 py-3 text-left">{t('admin.incidents.location')}</th>
                  <th className="px-4 py-3 text-left">{t('admin.incidents.reported')}</th>
                  <th className="px-4 py-3 text-left">{t('admin.incidents.cleaner')}</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                {incidents.map((inc: any) => {
                  const st = STATUS_COLORS[inc.status] ?? STATUS_COLORS.OPEN;
                  const location = [inc.restroom?.floor?.building?.name, inc.restroom?.floor?.name].filter(Boolean).join(' › ');
                  return (
                    <tr key={inc.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span>{inc.issueType?.icon}</span>
                          <span className="text-white font-medium">{inc.issueType?.nameI18n?.he}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                        <div>{location}</div>
                        <div className="text-xs">{inc.restroom?.name}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>
                        {new Date(inc.reportedAt).toLocaleString('he-IL')}
                      </td>
                      <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)' }}>
                        {inc.assignedCleaner?.name ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: st.bg, color: st.text }}>
                          {t(`admin.incidents.${inc.status === 'IN_PROGRESS' ? 'inProgress' : inc.status.toLowerCase()}`)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > LIMIT && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-4 py-2 rounded-xl text-sm disabled:opacity-30"
            style={{ background: 'var(--color-card)', color: 'var(--color-text-secondary)' }}
          >
            ←
          </button>
          <span className="px-4 py-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {page + 1} / {Math.ceil(total / LIMIT)}
          </span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={(page + 1) * LIMIT >= total}
            className="px-4 py-2 rounded-xl text-sm disabled:opacity-30"
            style={{ background: 'var(--color-card)', color: 'var(--color-text-secondary)' }}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
