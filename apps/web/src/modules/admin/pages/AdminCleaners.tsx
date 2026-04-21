import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { UserPlus, Trash2, Building2, Globe, Pencil, X, Check, KeyRound, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import api from '../../../lib/api';
import toast from 'react-hot-toast';

interface EditState { id: string; name: string; idNumber: string; phone: string }

// ── Password change modal ───────────────────────────────────────────────────────
function PasswordModal({ userId, userName, onClose }: { userId: string; userName: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const valid = pw.length >= 6 && pw === confirm;

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      await api.patch(`/users/${userId}/password`, { password: pw });
      toast.success(t('admin.cleaners.passwordSaved'));
      onClose();
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { background: '#0a0e1a', border: '1px solid rgba(0,229,204,0.25)', color: 'white' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4" style={{ background: 'var(--color-surface)', border: '1px solid rgba(0,229,204,0.25)' }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-white flex items-center gap-2">
              <KeyRound size={16} style={{ color: 'var(--color-accent)' }} />
              {t('admin.cleaners.changePasswordTitle')}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{userName}</p>
          </div>
          <button onClick={onClose} style={{ color: 'var(--color-text-secondary)' }}><X size={18} /></button>
        </div>

        <div className="flex flex-col gap-3">
          {[
            { label: t('admin.cleaners.newPassword'), val: pw, set: setPw },
            { label: t('admin.cleaners.confirmPassword'), val: confirm, set: setConfirm },
          ].map(({ label, val, set }) => (
            <div key={label}>
              <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>{label}</label>
              <div className="relative">
                <input
                  type={show ? 'text' : 'password'}
                  value={val}
                  onChange={e => set(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl outline-none text-sm pr-10"
                  style={inputStyle}
                  placeholder={t('admin.cleaners.passwordMin')}
                />
                <button
                  type="button"
                  onClick={() => setShow(s => !s)}
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>
          ))}
          {confirm && pw !== confirm && (
            <p className="text-xs" style={{ color: '#ef4444' }}>{t('admin.cleaners.passwordMismatch')}</p>
          )}
          {pw && pw.length < 6 && (
            <p className="text-xs" style={{ color: '#f59e0b' }}>{t('admin.cleaners.passwordTooShort')}</p>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={save}
            disabled={!valid || saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium"
            style={{
              background: valid ? 'rgba(0,229,204,0.15)' : 'rgba(255,255,255,0.05)',
              border: `1px solid ${valid ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)'}`,
              color: valid ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              opacity: saving ? 0.6 : 1,
            }}
          >
            <Check size={15} /> {t('admin.cleaners.savePassword')}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Admin user edit modal ───────────────────────────────────────────────────────
function AdminEditModal({ user, onClose, onSaved }: { user: any; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(user.name ?? '');
  const [email, setEmail] = useState(user.email ?? '');
  // idNumber for admins: if it equals the email (legacy default) show empty so admin can set a real one
  const currentId = user.idNumber === user.email ? '' : (user.idNumber ?? '');
  const [idNumber, setIdNumber] = useState(currentId);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.patch(`/users/${user.id}/admin`, {
        name: name.trim(),
        email: email.trim(),
        ...(idNumber.trim() && { idNumber: idNumber.trim() }),
      });
      toast.success(t('admin.cleaners.savedMsg'));
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { background: '#0a0e1a', border: '1px solid rgba(0,229,204,0.25)', color: 'white' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4" style={{ background: 'var(--color-surface)', border: '1px solid rgba(0,229,204,0.25)' }}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <Pencil size={15} style={{ color: 'var(--color-accent)' }} />
            {t('admin.cleaners.editAdmin')}
          </h2>
          <button onClick={onClose} style={{ color: 'var(--color-text-secondary)' }}><X size={18} /></button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>{t('admin.cleaners.adminName')}</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={inputStyle} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>{t('admin.cleaners.adminEmail')}</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2.5 rounded-xl outline-none text-sm" style={inputStyle} />
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>
              {t('admin.cleaners.idNumber')}
              <span className="ms-1 opacity-60 text-[10px]">{t('admin.cleaners.kioskLoginHint')}</span>
            </label>
            <input
              value={idNumber}
              onChange={e => setIdNumber(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl outline-none text-sm font-mono"
              style={inputStyle}
              placeholder={t('admin.cleaners.idPlaceholder')}
              inputMode="numeric"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={save}
            disabled={!name.trim() || saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(0,229,204,0.15)', border: '1px solid var(--color-accent)', color: 'var(--color-accent)', opacity: saving ? 0.6 : 1 }}
          >
            <Check size={15} /> {t('common.save')}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminCleaners() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();

  // current logged-in user — for self-only password change
  const currentUser: { id?: string } = JSON.parse(localStorage.getItem('user') ?? '{}');
  const currentUserId = currentUser.id ?? '';

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', idNumber: '', phone: '', preferredLang: 'he' });
  const [showAdminForm, setShowAdminForm] = useState(false);
  const [adminForm, setAdminForm] = useState({ name: '', email: '', password: '', idNumber: '', role: 'MANAGER' });
  const [adminFormShow, setAdminFormShow] = useState(false);
  const [editWorker, setEditWorker] = useState<EditState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [pwUser, setPwUser] = useState<{ id: string; name: string } | null>(null);
  const [editAdmin, setEditAdmin] = useState<any | null>(null);
  const [filterBuildingWorkers, setFilterBuildingWorkers] = useState('');
  const [filterBuildingAdmins, setFilterBuildingAdmins] = useState('');

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
  });

  const { data: buildings = [] } = useQuery({
    queryKey: ['building-structure'],
    queryFn: async () => (await api.get('/buildings/structure')).data,
  });

  const allWorkers = (users ?? []).filter((u: any) => u.role === 'CLEANER');
  const cleaners = filterBuildingWorkers
    ? allWorkers.filter((u: any) => u.buildingId === filterBuildingWorkers)
    : allWorkers;

  const allAdmins = (users ?? []).filter((u: any) => u.role === 'ORG_ADMIN' || u.role === 'MANAGER' || u.role === 'SHIFT_SUPERVISOR');
  const admins = filterBuildingAdmins
    ? allAdmins.filter((u: any) => u.buildingId === filterBuildingAdmins || u.role === 'ORG_ADMIN')
    : allAdmins;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/users/cleaners', form);
      toast.success(t('admin.cleaners.addedMsg'));
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowForm(false);
      setForm({ name: '', idNumber: '', phone: '', preferredLang: 'he' });
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? t('common.error'));
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminForm.name.trim() || !adminForm.email.trim() || adminForm.password.length < 6) return;
    try {
      const payload: any = { name: adminForm.name.trim(), email: adminForm.email.trim(), password: adminForm.password, role: adminForm.role };
      await api.post('/users/admins', payload);
      // If ID number supplied, update it immediately
      if (adminForm.idNumber.trim()) {
        const { data: all } = await api.get('/users');
        const created = all.find((u: any) => u.email === adminForm.email.trim());
        if (created) await api.patch(`/users/${created.id}/admin`, { idNumber: adminForm.idNumber.trim() });
      }
      toast.success(t('admin.cleaners.adminAdded'));
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowAdminForm(false);
      setAdminForm({ name: '', email: '', password: '', idNumber: '', role: 'MANAGER' });
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? t('common.error'));
    }
  };

  const handleSaveEdit = async () => {
    if (!editWorker) return;
    setSavingEdit(true);
    try {
      await api.patch(`/users/${editWorker.id}`, {
        name: editWorker.name.trim(),
        idNumber: editWorker.idNumber.trim(),
        phone: editWorker.phone.trim(),
      });
      toast.success(t('admin.cleaners.savedMsg'));
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditWorker(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? t('common.error'));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    await api.patch(`/users/${id}/toggle`, { isActive: !isActive });
    queryClient.invalidateQueries({ queryKey: ['users'] });
    toast.success(!isActive ? t('admin.cleaners.activateMsg') : t('admin.cleaners.deactivateMsg'));
  };

  const handleAssignBuilding = async (id: string, buildingId: string) => {
    try {
      await api.patch(`/users/${id}/building`, { buildingId: buildingId || null });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(t('admin.cleaners.buildingUpdated'));
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleLangChange = async (id: string, preferredLang: string) => {
    await api.patch(`/users/${id}/lang`, { preferredLang });
    queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const { data: orgSettings } = useQuery({
    queryKey: ['org-settings'],
    queryFn: async () => (await api.get('/users/org-settings')).data,
  });
  const globalCleanerLang: string | null = orgSettings?.cleanerLang ?? null;

  const { data: activeCleaners = [] } = useQuery({
    queryKey: ['active-cleaners'],
    queryFn: async () => (await api.get('/users/active-cleaners')).data,
    refetchInterval: 30_000,
  });

  const { data: mismatches = [] } = useQuery({
    queryKey: ['mismatches'],
    queryFn: async () => (await api.get('/users/mismatches')).data,
    refetchInterval: 30_000,
  });

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(t('admin.cleaners.deleteConfirm', { name }))) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success(t('admin.cleaners.deletedMsg'));
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? t('common.error'));
    }
  };

  const shiftDuration = (arrivedAt: string) => {
    const mins = Math.floor((Date.now() - new Date(arrivedAt).getTime()) / 60000);
    if (mins < 60) return `${mins} ${t('common.minutes')}`;
    return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')} ${t('common.hours')}`;
  };

  return (
    <div className="flex flex-col gap-5">

      {/* ── Password modal (self only) ── */}
      {pwUser && <PasswordModal userId={pwUser.id} userName={pwUser.name} onClose={() => setPwUser(null)} />}

      {/* ── Admin edit modal ── */}
      {editAdmin && (
        <AdminEditModal
          user={editAdmin}
          onClose={() => setEditAdmin(null)}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['users'] })}
        />
      )}

      {/* ── Edit worker modal ── */}
      {editWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4" style={{ background: 'var(--color-surface)', border: '1px solid rgba(0,229,204,0.25)' }}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">{t('admin.cleaners.editWorker')}</h2>
              <button onClick={() => setEditWorker(null)} style={{ color: 'var(--color-text-secondary)' }}><X size={18} /></button>
            </div>
            <div className="flex flex-col gap-3">
              {[
                { label: t('admin.cleaners.fullName'), field: 'name' as const },
                { label: t('admin.cleaners.idNumber'), field: 'idNumber' as const },
                { label: t('admin.cleaners.phone'), field: 'phone' as const },
              ].map(({ label, field }) => (
                <div key={field}>
                  <label className="text-xs mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>{label}</label>
                  <input
                    value={editWorker[field]}
                    onChange={e => setEditWorker(prev => prev ? { ...prev, [field]: e.target.value } : prev)}
                    className="w-full px-3 py-2.5 rounded-xl outline-none text-sm"
                    style={{ background: '#0a0e1a', border: '1px solid rgba(0,229,204,0.25)', color: 'white' }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit || !editWorker.name.trim() || !editWorker.idNumber.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(0,229,204,0.15)', border: '1px solid var(--color-accent)', color: 'var(--color-accent)', opacity: savingEdit ? 0.6 : 1 }}
              >
                <Check size={15} /> {t('common.save')}
              </button>
              <button onClick={() => setEditWorker(null)} className="px-4 py-2.5 rounded-xl text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Active workers now ── */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#22c55e' }} />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ background: '#22c55e' }} />
            </span>
            {t('admin.cleaners.onShift')}
          </h2>
          <span className="text-xs px-2 py-1 rounded-full font-semibold"
            style={{ background: activeCleaners.length > 0 ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)', color: activeCleaners.length > 0 ? '#22c55e' : 'var(--color-text-secondary)' }}>
            {activeCleaners.length} {t('admin.cleaners.workers')}
          </span>
        </div>
        {activeCleaners.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: 'var(--color-text-secondary)' }}>
            {t('admin.cleaners.noOnShift')}
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {activeCleaners.map((a: any) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg font-bold"
                  style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                  {a.user.name.charAt(0)}
                </div>
                <div>
                  <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{a.user.name}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {a.user.building?.name && <span>🏢 {a.user.building.name} · </span>}
                    🕐 {new Date(a.arrivedAt).toLocaleTimeString(lang === 'he' ? 'he-IL' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                    {' '}({shiftDuration(a.arrivedAt)})
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Mismatch alerts ── */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--color-card)', border: '1px solid rgba(239,68,68,0.2)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <span style={{ color: '#ef4444' }}>⚠️</span>
            {t('admin.cleaners.mismatchTitle')}
          </h2>
          <span className="text-xs px-2 py-1 rounded-full font-semibold"
            style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
            {mismatches.length}
          </span>
        </div>
        <div className="text-xs mb-3" style={{ color: 'var(--color-text-secondary)' }}>
          {t('admin.cleaners.mismatchDesc')}
        </div>
        {mismatches.length === 0 ? (
          <div className="text-center py-6" style={{ color: 'var(--color-text-secondary)' }}>
            <div className="text-2xl mb-2">✅</div>
            <div className="text-sm">{t('admin.cleaners.mismatchEmpty')}</div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {mismatches.map((m: any) => (
              <div key={m.arrivalId} className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg font-bold"
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                  {m.user.name.charAt(0)}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{m.user.name}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {m.user.building?.name && <span>🏢 {m.user.building.name} · </span>}
                    🕐 {t('admin.cleaners.checkedInAgo', { n: m.minutesSinceArrival })}
                  </div>
                </div>
                <span className="text-xs px-2 py-1 rounded-full font-bold"
                  style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
                  {m.minutesSinceArrival} {t('common.minutes')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{t('admin.cleaners.manage')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{t('admin.cleaners.activeDesc')}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterBuildingWorkers}
            onChange={e => setFilterBuildingWorkers(e.target.value)}
            className="px-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: 'rgba(0,229,204,0.08)', border: '1px solid rgba(0,229,204,0.25)', color: filterBuildingWorkers ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}
          >
            <option value="">{t('admin.cleaners.allBuildings')}</option>
            {buildings.map((b: any) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(0,229,204,0.15)', border: '1px solid var(--color-accent)', color: 'var(--color-accent)' }}
          >
            <UserPlus size={16} /> {t('admin.cleaners.addWorker')}
          </button>
        </div>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleCreate} className="rounded-2xl p-5 flex flex-col gap-3"
          style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.25)' }}>
          <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>{t('admin.cleaners.newWorker')}</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'name',     placeholder: t('admin.cleaners.fullName') },
              { key: 'idNumber', placeholder: t('admin.cleaners.idNumber') },
              { key: 'phone',    placeholder: t('admin.cleaners.phone') },
            ].map(({ key, placeholder }) => (
              <input
                key={key}
                value={(form as any)[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                required={key !== 'phone'}
                className="px-4 py-3 rounded-xl outline-none"
                style={{ background: '#0a0e1a', border: '1px solid rgba(0,229,204,0.2)', color: 'white' }}
              />
            ))}
            <select
              value={form.preferredLang}
              onChange={(e) => setForm((f) => ({ ...f, preferredLang: e.target.value }))}
              className="px-4 py-3 rounded-xl outline-none"
              style={{ background: '#0a0e1a', border: '1px solid rgba(0,229,204,0.2)', color: 'white' }}
            >
              <option value="he">עברית</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="px-6 py-2 rounded-xl text-sm font-medium"
              style={{ background: 'rgba(0,229,204,0.15)', border: '1px solid var(--color-accent)', color: 'var(--color-accent)' }}>
              {t('common.save')}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2 rounded-xl text-sm"
              style={{ color: 'var(--color-text-secondary)' }}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {/* Workers list */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
        <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          {cleaners.map((c: any) => (
            <div key={c.id} className="px-5 py-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium" style={{ color: 'var(--color-text)' }}>{c.name}</div>
                  <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                    🪪 {c.idNumber}{c.phone && ` · 📞 ${c.phone}`}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => setEditWorker({ id: c.id, name: c.name, idNumber: c.idNumber, phone: c.phone ?? '' })}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-all"
                    style={{ color: 'rgba(0,229,204,0.6)' }}
                    title={t('common.edit')}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleToggle(c.id, c.isActive)}
                    title={c.isActive ? t('admin.cleaners.active') : t('admin.cleaners.inactive')}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{
                      background: c.isActive ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                      color: c.isActive ? '#22c55e' : '#ef4444',
                      border: `1px solid ${c.isActive ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    }}
                  >
                    {c.isActive ? t('admin.cleaners.active') : t('admin.cleaners.inactive')}
                  </button>
                  <button
                    onClick={() => handleDelete(c.id, c.name)}
                    className="p-1.5 rounded-lg transition-all hover:bg-red-500/20"
                    style={{ color: 'rgba(239,68,68,0.6)' }}
                    title={t('common.delete')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Building + Language row */}
              <div className="flex items-center gap-2 ps-1 flex-wrap">
                <Building2 size={13} style={{ color: 'var(--color-accent)', opacity: 0.7, flexShrink: 0 }} />
                <select
                  value={c.buildingId ?? ''}
                  onChange={e => handleAssignBuilding(c.id, e.target.value)}
                  className="flex-1 min-w-0 px-3 py-1.5 rounded-xl text-sm outline-none"
                  style={{
                    background: c.buildingId ? 'rgba(0,229,204,0.08)' : 'var(--color-bg)',
                    border: `1px solid ${c.buildingId ? 'rgba(0,229,204,0.3)' : 'rgba(255,255,255,0.1)'}`,
                    color: c.buildingId ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  }}
                >
                  <option value="">{t('admin.cleaners.noBuilding')}</option>
                  {buildings.map((b: any) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>

                <div className="flex items-center gap-1.5" title={globalCleanerLang ? t('admin.cleaners.globalLangHint') : ''}>
                  <Globe size={13} style={{ color: globalCleanerLang ? 'rgba(255,255,255,0.2)' : 'rgba(0,229,204,0.7)', flexShrink: 0 }} />
                  <select
                    value={globalCleanerLang ?? c.preferredLang ?? 'he'}
                    disabled={!!globalCleanerLang}
                    onChange={e => handleLangChange(c.id, e.target.value)}
                    className="px-2 py-1.5 rounded-lg text-xs outline-none"
                    style={{
                      background: globalCleanerLang ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${globalCleanerLang ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.15)'}`,
                      color: globalCleanerLang ? 'rgba(255,255,255,0.25)' : 'var(--color-text-secondary)',
                      opacity: globalCleanerLang ? 0.5 : 1,
                    }}
                  >
                    <option value="he">🇮🇱 עברית</option>
                    <option value="en">🇺🇸 English</option>
                  </select>
                  {globalCleanerLang && (
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
                      {t('admin.cleaners.globalLang')}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {cleaners.length === 0 && (
            <div className="px-5 py-8 text-center" style={{ color: 'var(--color-text-secondary)' }}>
              {t('admin.cleaners.noWorkers')}
            </div>
          )}
        </div>
      </div>

      {/* ── Admins & Managers ── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-card)', border: '1px solid rgba(139,92,246,0.2)' }}>
        {/* Title row */}
        <div className="px-5 py-3 flex items-center gap-2 border-b" style={{ borderColor: 'rgba(139,92,246,0.15)' }}>
          <ShieldCheck size={16} style={{ color: '#8b5cf6' }} />
          <h2 className="font-semibold text-white">{t('admin.cleaners.adminsSection')}</h2>
          <span className="text-xs px-2 py-0.5 rounded-full ms-1" style={{ background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>
            {allAdmins.length}
          </span>
          <div className="ms-auto flex items-center gap-2">
            <select
              value={filterBuildingAdmins}
              onChange={e => setFilterBuildingAdmins(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs outline-none"
              style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.3)', color: filterBuildingAdmins ? '#a78bfa' : 'rgba(167,139,250,0.5)' }}
            >
              <option value="">{t('admin.cleaners.allBuildings')}</option>
              {buildings.map((b: any) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>
        {/* Action row */}
        <div className="px-5 py-2.5 flex items-center gap-2 border-b" style={{ borderColor: 'rgba(139,92,246,0.08)', background: 'rgba(139,92,246,0.03)' }}>
          <button
            onClick={() => setShowAdminForm(v => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)', color: '#a78bfa' }}
          >
            <UserPlus size={13} />
            {t('admin.cleaners.addAdmin')}
          </button>
          <a
            href="/supervisor/login"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b' }}
          >
            🛡️ {t('admin.cleaners.openSupervisorInterface')}
          </a>
        </div>

        {/* ── Add admin form ── */}
        {showAdminForm && (
          <form onSubmit={handleCreateAdmin}
            className="px-5 py-4 flex flex-col gap-3 border-b"
            style={{ borderColor: 'rgba(139,92,246,0.1)', background: 'rgba(139,92,246,0.04)' }}>
            <h3 className="text-sm font-semibold" style={{ color: '#a78bfa' }}>
              {t('admin.cleaners.newAdmin')}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                value={adminForm.name}
                onChange={e => setAdminForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t('admin.cleaners.fullName')}
                required
                className="px-4 py-2.5 rounded-xl outline-none text-sm"
                style={{ background: '#0a0e1a', border: '1px solid rgba(139,92,246,0.3)', color: 'white' }}
              />
              <input
                type="email"
                value={adminForm.email}
                onChange={e => setAdminForm(f => ({ ...f, email: e.target.value }))}
                placeholder={t('admin.cleaners.adminEmail')}
                required
                className="px-4 py-2.5 rounded-xl outline-none text-sm"
                style={{ background: '#0a0e1a', border: '1px solid rgba(139,92,246,0.3)', color: 'white' }}
              />
              <div className="relative">
                <input
                  type={adminFormShow ? 'text' : 'password'}
                  value={adminForm.password}
                  onChange={e => setAdminForm(f => ({ ...f, password: e.target.value }))}
                  placeholder={t('admin.cleaners.passwordMin')}
                  required
                  minLength={6}
                  className="w-full px-4 py-2.5 rounded-xl outline-none text-sm pr-10"
                  style={{ background: '#0a0e1a', border: '1px solid rgba(139,92,246,0.3)', color: 'white' }}
                />
                <button type="button" onClick={() => setAdminFormShow(v => !v)}
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'rgba(255,255,255,0.3)' }}>
                  {adminFormShow ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <input
                value={adminForm.idNumber}
                onChange={e => setAdminForm(f => ({ ...f, idNumber: e.target.value }))}
                placeholder={t('admin.cleaners.adminIdPlaceholder')}
                inputMode="numeric"
                className="px-4 py-2.5 rounded-xl outline-none text-sm font-mono"
                style={{ background: '#0a0e1a', border: '1px solid rgba(139,92,246,0.25)', color: 'white' }}
              />
              <select
                value={adminForm.role}
                onChange={e => setAdminForm(f => ({ ...f, role: e.target.value }))}
                className="px-4 py-2.5 rounded-xl outline-none text-sm"
                style={{ background: '#0a0e1a', border: '1px solid rgba(139,92,246,0.3)', color: 'white' }}
              >
                <option value="MANAGER">{t('admin.cleaners.manager')}</option>
                <option value="SHIFT_SUPERVISOR">{t('admin.cleaners.shiftSupervisor')}</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button type="submit"
                className="px-5 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.5)', color: '#a78bfa' }}>
                {t('common.save')}
              </button>
              <button type="button" onClick={() => { setShowAdminForm(false); setAdminForm({ name: '', email: '', password: '', idNumber: '', role: 'MANAGER' }); }}
                className="px-5 py-2 rounded-xl text-sm"
                style={{ color: 'var(--color-text-secondary)' }}>
                {t('common.cancel')}
              </button>
            </div>
          </form>
        )}

        <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
          {admins.map((a: any) => {
            const isSelf = a.id === currentUserId;
            return (
              <div key={a.id} className="px-5 py-4 flex items-center gap-3 flex-wrap">
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0"
                  style={{ background: 'rgba(139,92,246,0.15)', color: '#8b5cf6' }}>
                  {(a.name ?? '?').charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white truncate">
                    {a.name}
                    {isSelf && <span className="ms-2 text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,229,204,0.12)', color: 'var(--color-accent)' }}>you</span>}
                  </div>
                  <div className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
                    {a.email}
                    {' · '}
                    <span style={{ color: a.role === 'ORG_ADMIN' ? '#8b5cf6' : '#f59e0b' }}>
                      {a.role === 'ORG_ADMIN' ? t('admin.cleaners.orgAdmin') : a.role === 'SHIFT_SUPERVISOR' ? t('admin.cleaners.shiftSupervisor') : t('admin.cleaners.manager')}
                    </span>
                  </div>
                  {/* Show ID number if set (not equal to email = legacy default) */}
                  {a.idNumber && a.idNumber !== a.email && (
                    <div className="text-xs mt-0.5 font-mono" style={{ color: 'rgba(0,229,204,0.6)' }}>
                      🪪 {a.idNumber}
                    </div>
                  )}
                  {(!a.idNumber || a.idNumber === a.email) && (
                    <div className="text-xs mt-0.5" style={{ color: 'rgba(239,68,68,0.5)' }}>
                      {t('admin.cleaners.idWarning')}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Edit (name/email) — available for all */}
                  <button
                    onClick={() => setEditAdmin(a)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--color-text-secondary)' }}
                    title={t('admin.cleaners.edit')}
                  >
                    <Pencil size={12} /> {t('admin.cleaners.edit')}
                  </button>

                  {/* Change password — only for self */}
                  {isSelf && (
                    <button
                      onClick={() => setPwUser({ id: a.id, name: a.name })}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', color: '#8b5cf6' }}
                      title={t('admin.cleaners.changeMyPassword')}
                    >
                      <KeyRound size={12} /> {t('admin.cleaners.changeMyPassword')}
                    </button>
                  )}

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(a.id, a.name)}
                    className="p-1.5 rounded-lg hover:bg-red-500/20 transition-all"
                    style={{ color: 'rgba(239,68,68,0.5)' }}
                    title={t('common.delete')}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
          {admins.length === 0 && (
            <div className="px-5 py-6 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {t('admin.cleaners.noAdmins')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
