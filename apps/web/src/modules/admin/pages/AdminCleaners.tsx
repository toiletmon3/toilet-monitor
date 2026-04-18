import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { UserPlus, Trash2, Building2, Globe, Pencil, X, Check } from 'lucide-react';
import api from '../../../lib/api';
import toast from 'react-hot-toast';

interface EditState { id: string; name: string; idNumber: string; phone: string }

export default function AdminCleaners() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', idNumber: '', phone: '', preferredLang: 'he' });
  const [editWorker, setEditWorker] = useState<EditState | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const { i18n } = useTranslation();
  const lang = i18n.language;

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
  });

  const { data: buildings = [] } = useQuery({
    queryKey: ['building-structure'],
    queryFn: async () => (await api.get('/buildings/structure')).data,
  });

  const cleaners = (users ?? []).filter((u: any) => u.role === 'CLEANER');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/users/cleaners', form);
      toast.success(lang === 'he' ? 'עובד נוסף בהצלחה' : 'Worker added');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowForm(false);
      setForm({ name: '', idNumber: '', phone: '', preferredLang: 'he' });
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Error');
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
      toast.success(lang === 'he' ? 'פרטים עודכנו' : 'Details updated');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setEditWorker(null);
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    await api.patch(`/users/${id}/toggle`, { isActive: !isActive });
    queryClient.invalidateQueries({ queryKey: ['users'] });
    toast.success(
      !isActive
        ? (lang === 'he' ? 'העובד הופעל — יוכל להתחבר' : 'Worker activated')
        : (lang === 'he' ? 'העובד הושבת — לא יוכל להתחבר' : 'Worker deactivated')
    );
  };

  const handleAssignBuilding = async (id: string, buildingId: string) => {
    try {
      await api.patch(`/users/${id}/building`, { buildingId: buildingId || null });
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(lang === 'he' ? 'בניין עודכן' : 'Building updated');
    } catch {
      toast.error('Error');
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

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(lang === 'he' ? `למחוק את ${name}?` : `Delete ${name}?`)) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success(lang === 'he' ? 'עובד נמחק' : 'Worker deleted');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Error');
    }
  };

  const shiftDuration = (arrivedAt: string) => {
    const mins = Math.floor((Date.now() - new Date(arrivedAt).getTime()) / 60000);
    if (mins < 60) return `${mins} דק'`;
    return `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')} שע'`;
  };

  return (
    <div className="flex flex-col gap-5">

      {/* ── Edit modal ── */}
      {editWorker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-sm rounded-2xl p-6 flex flex-col gap-4" style={{ background: 'var(--color-surface)', border: '1px solid rgba(0,229,204,0.25)' }}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-white">{lang === 'he' ? 'עריכת עובד' : 'Edit Worker'}</h2>
              <button onClick={() => setEditWorker(null)} style={{ color: 'var(--color-text-secondary)' }}><X size={18} /></button>
            </div>

            <div className="flex flex-col gap-3">
              {[
                { label: lang === 'he' ? 'שם מלא' : 'Full name', field: 'name' as const },
                { label: lang === 'he' ? 'תעודת זהות' : 'ID number', field: 'idNumber' as const },
                { label: lang === 'he' ? 'טלפון' : 'Phone', field: 'phone' as const },
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
                <Check size={15} />{lang === 'he' ? 'שמור' : 'Save'}
              </button>
              <button onClick={() => setEditWorker(null)} className="px-4 py-2.5 rounded-xl text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                {lang === 'he' ? 'ביטול' : 'Cancel'}
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
            {lang === 'he' ? 'כרגע בעבודה' : 'Currently on shift'}
          </h2>
          <span className="text-xs px-2 py-1 rounded-full font-semibold"
            style={{ background: activeCleaners.length > 0 ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)', color: activeCleaners.length > 0 ? '#22c55e' : 'var(--color-text-secondary)' }}>
            {activeCleaners.length} {lang === 'he' ? 'עובדים' : 'workers'}
          </span>
        </div>

        {activeCleaners.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: 'var(--color-text-secondary)' }}>
            {lang === 'he' ? 'אין עובדים בעבודה כרגע' : 'No workers on shift right now'}
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
                    🕐 {new Date(a.arrivedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
                    {' '}({shiftDuration(a.arrivedAt)})
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
            {lang === 'he' ? 'ניהול עובדים' : 'Workers'}
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            {lang === 'he'
              ? '● פעיל = יכול להתחבר למערכת   ○ מושבת = חסום מכניסה (למשל עובד שעזב)'
              : '● Active = can log in   ○ Disabled = blocked from login (e.g. former employee)'}
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: 'rgba(0,229,204,0.15)', border: '1px solid var(--color-accent)', color: 'var(--color-accent)' }}
        >
          <UserPlus size={16} />
          {lang === 'he' ? 'הוסף עובד' : 'Add Worker'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-2xl p-5 flex flex-col gap-3"
          style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.25)' }}
        >
          <h2 className="font-semibold" style={{ color: 'var(--color-text)' }}>{lang === 'he' ? 'עובד חדש' : 'New Worker'}</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { key: 'name', placeholder: lang === 'he' ? 'שם מלא' : 'Full Name' },
              { key: 'idNumber', placeholder: lang === 'he' ? 'תעודת זהות' : 'ID Number' },
              { key: 'phone', placeholder: lang === 'he' ? 'טלפון' : 'Phone' },
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
                  {/* Edit button */}
                  <button
                    onClick={() => setEditWorker({ id: c.id, name: c.name, idNumber: c.idNumber, phone: c.phone ?? '' })}
                    className="p-1.5 rounded-lg hover:bg-white/10 transition-all"
                    style={{ color: 'rgba(0,229,204,0.6)' }}
                    title={lang === 'he' ? 'ערוך פרטים' : 'Edit details'}
                  >
                    <Pencil size={14} />
                  </button>

                  {/* Active / Disabled toggle */}
                  <button
                    onClick={() => handleToggle(c.id, c.isActive)}
                    title={lang === 'he'
                      ? (c.isActive ? 'פעיל — לחץ להשבית (יחסום כניסה)' : 'מושבת — לחץ להפעיל (יאפשר כניסה)')
                      : (c.isActive ? 'Active — click to disable (blocks login)' : 'Disabled — click to activate (allows login)')}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{
                      background: c.isActive ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                      color: c.isActive ? '#22c55e' : '#ef4444',
                      border: `1px solid ${c.isActive ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    }}
                  >
                    {c.isActive
                      ? (lang === 'he' ? '● פעיל' : '● Active')
                      : (lang === 'he' ? '○ מושבת' : '○ Disabled')}
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => handleDelete(c.id, c.name)}
                    className="p-1.5 rounded-lg transition-all hover:bg-red-500/20"
                    style={{ color: 'rgba(239,68,68,0.6)' }}
                    title={lang === 'he' ? 'מחק' : 'Delete'}
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
                  <option value="">{lang === 'he' ? '— ללא שיוך לבניין (רואה הכל) —' : '— No building (sees all) —'}</option>
                  {buildings.map((b: any) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>

                {/* Per-worker language */}
                <div className="flex items-center gap-1.5" title={globalCleanerLang ? (lang === 'he' ? 'שפה גלובלית קובעת — שנה בהגדרות' : 'Global lang override — change in Settings') : ''}>
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
                      {lang === 'he' ? '(גלובלי)' : '(global)'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
          {cleaners.length === 0 && (
            <div className="px-5 py-8 text-center" style={{ color: 'var(--color-text-secondary)' }}>
              {lang === 'he' ? 'אין עובדים' : 'No workers yet'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
