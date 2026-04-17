import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, UserCheck, CheckCircle, RefreshCw, Clock, Wrench, CheckSquare, Trash2 } from 'lucide-react';
import api from '../../../lib/api';
import toast from 'react-hot-toast';
import ConfirmDialog from '../../../components/ConfirmDialog';

type DeleteDialog = { scope: 'resolved' | 'older' | 'all'; olderThanDays?: number } | null;

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  OPEN:        { bg: 'rgba(239,68,68,0.15)',  text: '#ef4444' },
  IN_PROGRESS: { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b' },
  RESOLVED:    { bg: 'rgba(34,197,94,0.15)',  text: '#22c55e' },
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
  const timeAgo = (() => {
    const diff = Date.now() - new Date(inc.reportedAt).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `לפני ${m} דק'`;
    const h = Math.floor(m / 60);
    if (h < 24) return `לפני ${h} שע'`;
    return `לפני ${Math.floor(h / 24)} ימים`;
  })();

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--color-bg)', border: '1px solid rgba(255,255,255,0.06)' }}>
      {/* Row header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-xl">{inc.issueType?.icon ?? '⚠️'}</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm" style={{ color: 'var(--color-text)' }}>{inc.issueType?.nameI18n?.he ?? 'תקלה'}</div>
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
            {inc.status === 'OPEN' ? 'ממתין' : inc.status === 'IN_PROGRESS' ? 'בטיפול' : 'טופל'}
          </span>
          {open
            ? <ChevronDown size={14} style={{ color: 'var(--color-accent)' }} />
            : <ChevronRight size={14} style={{ color: 'var(--color-text-secondary)' }} />}
        </div>
      </div>

      {/* Expanded details */}
      {open && (
        <div className="px-4 pb-4 pt-2 flex flex-col gap-4" style={{ borderTop: '1px solid rgba(0,229,204,0.08)' }}>
          {/* Time detail */}
          <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            <span>דווח: </span>
            <span>{new Date(inc.reportedAt).toLocaleString('he-IL')}</span>
          </div>

          {/* Timeline */}
          {(inc.actions ?? []).length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>היסטוריה</p>
              {inc.actions.map((a: any) => (
                <div key={a.id} className="flex items-start gap-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                  <span className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: 'var(--color-accent)' }} />
                  <span>
                    <b style={{ color: 'var(--color-text)' }}>{ACTION_LABEL[a.actionType] ?? a.actionType}</b>
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
              <div className="flex flex-col gap-1">
                <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>שייך מנקה</label>
                <select
                  value={assignId}
                  onChange={e => setAssignId(e.target.value)}
                  className="px-3 py-1.5 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.3)', color: 'var(--color-text)', minWidth: 150 }}
                >
                  <option value="">— לא משויך —</option>
                  {cleaners.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="flex flex-col gap-1 flex-1" style={{ minWidth: 180 }}>
                <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>הערה</label>
                <input
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="הוסף הערה..."
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
                {assignId && inc.status === 'IN_PROGRESS' && (
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
      )}
    </div>
  );
}

function Section({
  title, icon, count, color, children, defaultOpen = true,
}: {
  title: string; icon: React.ReactNode; count: number; color: string;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="flex flex-col gap-2">
      <button
        className="flex items-center gap-3 px-1 py-1 w-full text-start"
        onClick={() => setOpen(o => !o)}
      >
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
            ? <div className="text-sm px-4 py-6 text-center rounded-xl" style={{ color: 'var(--color-text-secondary)', background: 'var(--color-card)' }}>אין בקשות</div>
            : children}
        </div>
      )}
    </div>
  );
}

export default function AdminIncidents() {
  const [showResolved, setShowResolved] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialog>(null);
  const qc = useQueryClient();

  const handleDelete = async () => {
    if (!deleteDialog) return;
    const params = new URLSearchParams({ scope: deleteDialog.scope });
    if (deleteDialog.olderThanDays) params.set('olderThanDays', String(deleteDialog.olderThanDays));
    const { data } = await api.delete(`/incidents/bulk?${params}`);
    toast.success(`נמחקו ${data.deleted} דיווחים`);
    qc.invalidateQueries({ queryKey: ['incidents'] });
  };

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
  const open = allActive.filter(i => i.status === 'OPEN' && i.issueType?.code !== 'positive_feedback');
  const resolved: any[] = (resolvedData?.items ?? []).filter((i: any) => i.issueType?.code !== 'positive_feedback');
  const positiveFeedback: any[] = (resolvedData?.items ?? []).filter((i: any) => i.issueType?.code === 'positive_feedback');

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>תקלות</h1>
          <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{inProgress.length + open.length} פעילות</span>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setDeleteDialog({ scope: 'resolved' })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
            <Trash2 size={12} /> מחק טופלו
          </button>
          <button onClick={() => setDeleteDialog({ scope: 'older', olderThanDays: 30 })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
            <Trash2 size={12} /> ישנים מ-30 יום
          </button>
          <button onClick={() => setDeleteDialog({ scope: 'all' })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', color: '#ef4444' }}>
            <Trash2 size={12} /> מחק הכל
          </button>
        </div>
      </div>

      {deleteDialog && (
        <ConfirmDialog
          title={
            deleteDialog.scope === 'resolved' ? 'מחיקת דיווחים שטופלו' :
            deleteDialog.scope === 'older' ? 'מחיקת דיווחים ישנים מ-30 יום' :
            '⚠️ מחיקת כל הדיווחים'
          }
          description={
            deleteDialog.scope === 'resolved' ? 'כל הדיווחים עם סטטוס "טופל" יימחקו לצמיתות.' :
            deleteDialog.scope === 'older' ? 'כל הדיווחים שדווחו לפני יותר מ-30 יום יימחקו לצמיתות.' :
            'כל הדיווחים במערכת יימחקו לצמיתות. פעולה זו לא ניתנת לביטול.'
          }
          confirmLabel="מחק"
          requireType={deleteDialog.scope === 'all' ? 'מחק הכל' : undefined}
          onConfirm={handleDelete}
          onClose={() => setDeleteDialog(null)}
        />
      )}

      {loadingActive ? (
        <div className="p-12 text-center" style={{ color: 'var(--color-text-secondary)' }}>טוען...</div>
      ) : (
        <>
          {/* IN PROGRESS */}
          <Section
            title="בטיפול"
            icon={<Wrench size={18} />}
            count={inProgress.length}
            color="#f59e0b"
          >
            {inProgress.map(inc => <IncidentRow key={inc.id} inc={inc} cleaners={cleaners} />)}
          </Section>

          {/* OPEN */}
          <Section
            title="ממתין לטיפול"
            icon={<Clock size={18} />}
            count={open.length}
            color="#ef4444"
          >
            {open.map(inc => <IncidentRow key={inc.id} inc={inc} cleaners={cleaners} />)}
          </Section>

          {/* RESOLVED toggle */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setShowResolved(v => !v)}
              className="flex items-center gap-3 px-1 py-1 w-full text-start"
            >
              <span style={{ color: '#22c55e' }}><CheckSquare size={18} /></span>
              <span className="font-bold text-base" style={{ color: 'var(--color-text)' }}>טופלו</span>
              {resolvedData && (
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(34,197,94,0.13)', color: '#22c55e' }}>
                  {resolved.length}
                </span>
              )}
              <span className="ms-auto text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {showResolved ? 'הסתר' : 'הצג'}
              </span>
            </button>

            {showResolved && (
              loadingResolved
                ? <div className="text-sm px-4 py-6 text-center" style={{ color: 'var(--color-text-secondary)' }}>טוען...</div>
                : resolved.length === 0
                  ? <div className="text-sm px-4 py-6 text-center rounded-xl" style={{ color: 'var(--color-text-secondary)', background: 'var(--color-card)' }}>אין</div>
                  : <div className="flex flex-col gap-2">
                      {resolved.map(inc => <IncidentRow key={inc.id} inc={inc} cleaners={cleaners} />)}
                    </div>
            )}
          </div>

          {/* POSITIVE FEEDBACK — read-only log */}
          {showResolved && positiveFeedback.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 px-1 py-1">
                <span>😊</span>
                <span className="font-bold text-base" style={{ color: 'var(--color-text)' }}>משובים חיוביים</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(250,204,21,0.13)', color: '#facc15' }}>
                  {positiveFeedback.length}
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {positiveFeedback.map((inc: any) => {
                  const location = [inc.restroom?.floor?.building?.name, inc.restroom?.floor?.name, inc.restroom?.name].filter(Boolean).join(' › ');
                  const timeAgo = (() => {
                    const diff = Date.now() - new Date(inc.reportedAt).getTime();
                    const m = Math.floor(diff / 60000);
                    if (m < 60) return `לפני ${m} דק'`;
                    const h = Math.floor(m / 60);
                    if (h < 24) return `לפני ${h} שע'`;
                    return `לפני ${Math.floor(h / 24)} ימים`;
                  })();
                  return (
                    <div key={inc.id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                      style={{ background: 'var(--color-bg)', border: '1px solid rgba(250,204,21,0.15)' }}>
                      <span className="text-2xl">😊</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>עבודה טובה / משוב חיובי</div>
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
