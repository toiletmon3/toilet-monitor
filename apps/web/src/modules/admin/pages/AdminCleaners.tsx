import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { UserPlus, Trash2 } from 'lucide-react';
import api from '../../../lib/api';
import toast from 'react-hot-toast';

export default function AdminCleaners() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', idNumber: '', phone: '', preferredLang: 'he' });

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
  });

  const cleaners = (users ?? []).filter((u: any) => u.role === 'CLEANER');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/users/cleaners', form);
      toast.success(lang === 'he' ? 'מנקה נוסף בהצלחה' : 'Cleaner added');
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowForm(false);
      setForm({ name: '', idNumber: '', phone: '', preferredLang: 'he' });
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Error');
    }
  };

  const handleToggle = async (id: string, isActive: boolean) => {
    await api.patch(`/users/${id}/toggle`, { isActive: !isActive });
    queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(lang === 'he' ? `למחוק את ${name}?` : `Delete ${name}?`)) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success(lang === 'he' ? 'מנקה נמחק' : 'Cleaner deleted');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'Error');
    }
  };

  const { i18n } = useTranslation();
  const lang = i18n.language;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">{t('admin.nav.cleaners')}</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: 'rgba(0,229,204,0.15)', border: '1px solid var(--color-accent)', color: 'var(--color-accent)' }}
        >
          <UserPlus size={16} />
          {lang === 'he' ? 'הוסף מנקה' : 'Add Cleaner'}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="rounded-2xl p-5 flex flex-col gap-3"
          style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.25)' }}
        >
          <h2 className="font-semibold text-white">{lang === 'he' ? 'מנקה חדש' : 'New Cleaner'}</h2>
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
                className="px-4 py-3 rounded-xl text-white outline-none"
                style={{ background: '#0a0e1a', border: '1px solid rgba(0,229,204,0.2)' }}
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
            <button type="submit" className="px-6 py-2 rounded-xl text-sm font-medium" style={{ background: 'rgba(0,229,204,0.15)', border: '1px solid var(--color-accent)', color: 'var(--color-accent)' }}>
              {t('common.save')}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2 rounded-xl text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {/* Cleaners list */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
        <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
          {cleaners.map((c: any) => (
            <div key={c.id} className="px-5 py-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-white">{c.name}</div>
                <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                  🪪 {c.idNumber} {c.phone && `· 📞 ${c.phone}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleToggle(c.id, c.isActive)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium"
                  style={{
                    background: c.isActive ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                    color: c.isActive ? '#22c55e' : '#ef4444',
                    border: `1px solid ${c.isActive ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                  }}
                >
                  {c.isActive ? (lang === 'he' ? '● פעיל' : '● Active') : (lang === 'he' ? '○ לא פעיל' : '○ Inactive')}
                </button>
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
          ))}
          {cleaners.length === 0 && (
            <div className="px-5 py-8 text-center" style={{ color: 'var(--color-text-secondary)' }}>
              {lang === 'he' ? 'אין מנקים' : 'No cleaners yet'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
