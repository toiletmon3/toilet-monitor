import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, UserCheck, CheckCircle, RefreshCw } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import toast from 'react-hot-toast';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  OPEN:        { bg: 'rgba(239,68,68,0.15)',  text: '#ef4444' },
  IN_PROGRESS: { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b' },
  RESOLVED:    { bg: 'rgba(34,197,94,0.15)',  text: '#22c55e' },
};

interface IncidentRowProps {
  inc: any;
  /** Pass cleaners list to enable assign / action buttons. Omit for read-only mode. */
  cleaners?: any[];
  /** Extra query keys to invalidate after a mutation (e.g. ['recent-incidents']) */
  extraInvalidateKeys?: string[][];
}

export function IncidentRow({ inc, cleaners, extraInvalidateKeys = [] }: IncidentRowProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [assignId, setAssignId] = useState(inc.assignedCleanerId ?? '');
  const qc = useQueryClient();

  const ACTION_LABEL: Record<string, string> = {
    REPORTED:     t('admin.incidents.actionReported'),
    ACKNOWLEDGED: t('admin.incidents.actionAcknowledged'),
    RESOLVED:     t('admin.incidents.actionResolved'),
    ESCALATED:    t('admin.incidents.actionEscalated'),
  };

  const mut = useMutation({
    mutationFn: (body: any) => api.patch(`/incidents/${inc.id}/admin-update`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] });
      for (const key of extraInvalidateKeys) {
        qc.invalidateQueries({ queryKey: key });
      }
      toast.success(t('admin.incidents.actionResolved'));
    },
    onError: () => toast.error(t('common.error')),
  });

  const st = STATUS_COLORS[inc.status] ?? STATUS_COLORS.OPEN;
  const location = [inc.restroom?.floor?.building?.name, inc.restroom?.floor?.name, inc.restroom?.name].filter(Boolean).join(' › ');

  const timeAgo = (() => {
    const diff = Date.now() - new Date(inc.reportedAt).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return t('admin.incidents.agoMinutes', { n: m });
    const h = Math.floor(m / 60);
    if (h < 24) return t('admin.incidents.agoHours', { n: h });
    return t('admin.incidents.agoDays', { n: Math.floor(h / 24) });
  })();

  const issueName = inc.issueType?.nameI18n?.[lang] ?? inc.issueType?.nameI18n?.he ?? t('common.error');

  const statusLabel = inc.status === 'OPEN'
    ? t('admin.incidents.open')
    : inc.status === 'IN_PROGRESS'
    ? t('admin.incidents.inProgress')
    : t('admin.incidents.resolved');

  const readonly = !cleaners;

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-bg)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-xl">{inc.issueType?.icon ?? '⚠️'}</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm" style={{ color: 'var(--color-text)' }}>{issueName}</div>
          <div className="text-xs mt-0.5 truncate" style={{ color: 'var(--color-text-secondary)' }}>{location}</div>
        </div>
        <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {inc.assignedCleaner && (
            <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,229,204,0.1)', color: 'var(--color-accent)' }}>
              👤 {inc.assignedCleaner.name}
            </span>
          )}
          <span>{timeAgo}</span>
          <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: st.bg, color: st.text }}>
            {statusLabel}
          </span>
          {open
            ? <ChevronDown size={14} style={{ color: 'var(--color-accent)' }} />
            : <ChevronRight size={14} style={{ color: 'var(--color-text-secondary)' }} />}
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 pt-2 flex flex-col gap-4" style={{ borderTop: '1px solid rgba(0,229,204,0.08)' }}>
          <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            <span>{t('admin.incidents.reportedAt')}: </span>
            <span>{new Date(inc.reportedAt).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US')}</span>
          </div>

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

          {!readonly && inc.status !== 'RESOLVED' && (
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{t('admin.incidents.assignCleaner')}</label>
                <select
                  value={assignId}
                  onChange={e => setAssignId(e.target.value)}
                  className="px-3 py-1.5 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.3)', color: 'var(--color-text)', minWidth: 150 }}
                >
                  <option value="">{t('admin.incidents.unassigned')}</option>
                  {cleaners!.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1 flex-1" style={{ minWidth: 180 }}>
                <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{t('admin.incidents.note')}</label>
                <input
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={t('admin.incidents.notePlaceholder')}
                  className="px-3 py-1.5 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.2)', color: 'var(--color-text)' }}
                />
              </div>

              <div className="flex gap-2">
                {inc.status === 'OPEN' && (
                  <button
                    onClick={() => mut.mutate({ status: 'IN_PROGRESS', assignedCleanerId: assignId || undefined, note: note || undefined })}
                    disabled={mut.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
                    style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.4)', color: '#f59e0b' }}
                  >
                    <UserCheck size={13} /> {t('admin.incidents.accept')}
                  </button>
                )}
                <button
                  onClick={() => mut.mutate({ status: 'RESOLVED', assignedCleanerId: assignId || undefined, note: note || undefined })}
                  disabled={mut.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
                  style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e' }}
                >
                  <CheckCircle size={13} /> {t('admin.incidents.markResolved')}
                </button>
                {assignId && inc.status === 'IN_PROGRESS' && (
                  <button
                    onClick={() => mut.mutate({ assignedCleanerId: assignId, note: note || undefined })}
                    disabled={mut.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium"
                    style={{ background: 'rgba(0,229,204,0.1)', border: '1px solid rgba(0,229,204,0.3)', color: 'var(--color-accent)' }}
                  >
                    <RefreshCw size={13} /> {t('admin.incidents.updateAssignment')}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
