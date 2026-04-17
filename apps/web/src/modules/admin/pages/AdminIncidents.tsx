import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, UserCheck, CheckCircle, RefreshCw } from 'lucide-react';
import api from '../../../lib/api';
import toast from 'react-hot-toast';

const FILTERS = ['all', 'OPEN', 'IN_PROGRESS', 'RESOLVED'] as const;
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  OPEN:        { bg: 'rgba(239,68,68,0.15)',  text: '#ef4444' },
  IN_PROGRESS: { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b' },
  RESOLVED:    { bg: 'rgba(34,197,94,0.15)',  text: '#22c55e' },
};
const STATUS_LABEL: Record<string, string> = {
  OPEN: 'פתוח', IN_PROGRESS: 'בטיפול', RESOLVED: 'טופל',
};
const ACTION_LABEL: Record<string, string> = {
  REPORTED: 'דווח', ACKNOWLEDGED: 'התקבל', RESOLVED: 'טופל', ESCALATED: 'הועבר',
};

function IncidentRow({ inc, cleaners }: { inc: any; cleaners: any[] }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [assignId, setAssignId] = useState(inc.assignedCleanerId ?? '');
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: (body: any) => api.patch(`/incidents/${inc.id}/admin-update`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incidents'] }); toast.success('עודכן'); },
    onError: () => toast.error('שגיאה'),
  });

  const st = STATUS_COLORS[inc.status] ?? STATUS_COLORS.OPEN;
  const location = [inc.restroom?.floor?.building?.name, inc.restroom?.floor?.name, inc.restroom?.name].filter(Boolean).join(' › ');

  return (
    <>
      <tr
        className="cursor-pointer transition-colors"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
        onClick={() => setOpen(o => !o)}
      >
        <td className="px-4 py-3 w-6">
          {open ? <ChevronDown size={14} style={{ color: 'var(--color-accent)' }} /> : <ChevronRight size={14} style={{ color: 'var(--color-text-secondary)' }} />}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <span>{inc.issueType?.icon}</span>
            <span className="font-medium" style={{ color: 'var(--color-text)' }}>{inc.issueType?.nameI18n?.he}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{location}</td>
        <td className="px-4 py-3 text-sm whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>
          {new Date(inc.reportedAt).toLocaleString('he-IL')}
        </td>
        <td className="px-4 py-3 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          {inc.assignedCleaner?.name ?? '—'}
        </td>
        <td className="px-4 py-3">
          <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: st.bg, color: st.text }}>
            {STATUS_LABEL[inc.status] ?? inc.status}
          </span>
        </td>
      </tr>

      {open && (
        <tr style={{ background: 'rgba(0,229,204,0.03)', borderBottom: '1px solid rgba(0,229,204,0.1)' }}>
          <td colSpan={6} className="px-6 py-4">
            <div className="flex flex-col gap-4">

              {/* Timeline */}
              {(inc.actions ?? []).length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>היסטוריה</p>
                  {inc.actions.map((a: any) => (
                    <div key={a.id} className="flex items-start gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: 'var(--color-accent)' }} />
                      <span><b style={{ color: 'var(--color-text)' }}>{ACTION_LABEL[a.actionType] ?? a.actionType}</b>
                        {a.user && ` — ${a.user.name}`}
                        {a.notes && ` — "${a.notes}"`}
                        <span className="ms-2 opacity-50">{new Date(a.performedAt).toLocaleTimeString('he-IL')}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              {inc.status !== 'RESOLVED' && (
                <div className="flex flex-wrap gap-3 items-end">
                  {/* Assign cleaner */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>שייך מנקה</label>
                    <select
                      value={assignId}
                      onChange={e => setAssignId(e.target.value)}
                      className="px-3 py-1.5 rounded-xl text-sm outline-none"
                      style={{ background: 'var(--color-bg)', border: '1px solid rgba(0,229,204,0.3)', color: 'var(--color-text)', minWidth: 150 }}
                    >
                      <option value="">— לא משויך —</option>
                      {cleaners.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>

                  {/* Note */}
                  <div className="flex flex-col gap-1 flex-1" style={{ minWidth: 180 }}>
                    <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>הערה</label>
                    <input
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      placeholder="הוסף הערה..."
                      className="px-3 py-1.5 rounded-xl text-sm outline-none"
                      style={{ background: 'var(--color-bg)', border: '1px solid rgba(0,229,204,0.2)', color: 'var(--color-text)' }}
                    />
                  </div>

                  {/* Buttons */}
                  <div className="flex gap-2">
                    {inc.status === 'OPEN' && (
                      <button
                        onClick={() => mut.mutate({ status: 'IN_PROGRESS', assignedCleanerId: assignId || undefined, note: note || undefined })}
                        disabled={mut.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
                        style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b' }}
                      >
                        <UserCheck size={13} /> קבל לטיפול
                      </button>
                    )}
                    <button
                      onClick={() => mut.mutate({ status: 'RESOLVED', assignedCleanerId: assignId || undefined, note: note || undefined })}
                      disabled={mut.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
                      style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e' }}
                    >
                      <CheckCircle size={13} /> סמן כטופל
                    </button>
                    {assignId && (
                      <button
                        onClick={() => mut.mutate({ assignedCleanerId: assignId, note: note || undefined })}
                        disabled={mut.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
                        style={{ background: 'rgba(0,229,204,0.1)', border: '1px solid rgba(0,229,204,0.3)', color: 'var(--color-accent)' }}
                      >
                        <RefreshCw size={13} /> עדכן שיוך
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

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
    refetchInterval: 15_000,
  });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
  });
  const cleaners = (users ?? []).filter((u: any) => u.role === 'CLEANER' && u.isActive);

  const incidents = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{t('admin.incidents.title')}</h1>
        <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{total} בקשות</div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => { setFilter(f); setPage(0); }}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              background: filter === f ? 'rgba(0,229,204,0.15)' : 'var(--color-card)',
              border: `1px solid ${filter === f ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)'}`,
              color: filter === f ? 'var(--color-accent)' : 'var(--color-text-secondary)',
            }}>
            {f === 'all' ? 'הכל' : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
        {isLoading ? (
          <div className="p-8 text-center" style={{ color: 'var(--color-text-secondary)' }}>{t('common.loading')}</div>
        ) : incidents.length === 0 ? (
          <div className="p-8 text-center" style={{ color: 'var(--color-text-secondary)' }}>אין בקשות</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', color: 'var(--color-text-secondary)' }}>
                  <th className="px-4 py-3 w-6" />
                  <th className="px-4 py-3 text-start">בעיה</th>
                  <th className="px-4 py-3 text-start">מיקום</th>
                  <th className="px-4 py-3 text-start">זמן</th>
                  <th className="px-4 py-3 text-start">מנקה</th>
                  <th className="px-4 py-3 text-start">סטטוס</th>
                </tr>
              </thead>
              <tbody>
                {incidents.map((inc: any) => <IncidentRow key={inc.id} inc={inc} cleaners={cleaners} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {total > LIMIT && (
        <div className="flex justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="px-4 py-2 rounded-xl text-sm disabled:opacity-30"
            style={{ background: 'var(--color-card)', color: 'var(--color-text-secondary)' }}>←</button>
          <span className="px-4 py-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>{page + 1} / {Math.ceil(total / LIMIT)}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={(page + 1) * LIMIT >= total}
            className="px-4 py-2 rounded-xl text-sm disabled:opacity-30"
            style={{ background: 'var(--color-card)', color: 'var(--color-text-secondary)' }}>→</button>
        </div>
      )}
    </div>
  );
}
