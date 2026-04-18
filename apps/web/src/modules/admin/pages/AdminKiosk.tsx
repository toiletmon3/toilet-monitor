import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Check, X, LayoutTemplate, Palette, Tablet } from 'lucide-react';
import api from '../../../lib/api';
import toast from 'react-hot-toast';

const ICON_OPTIONS = ['Scroll','Wind','ShowerHead','Trash2','Droplets','Wrench','SmilePlus','Star','Bell','AlertCircle'];

const THEMES = [
  {
    id: 'default',
    title: 'קלאסי',
    desc: 'זכוכית עם צבעים שונים לכל כפתור',
    preview: { bg: 'linear-gradient(135deg, #0a1628 0%, #060a12 100%)', border: 'rgba(0,229,204,0.4)', glow: 'rgba(0,229,204,0.2)' },
  },
  {
    id: 'neon',
    title: 'ניאון',
    desc: 'רקע שחור עם מסגרות ציאן בוהקות',
    preview: { bg: '#000000', border: '#00E5FF', glow: 'rgba(0,229,255,0.5)' },
  },
];

function ThemePicker({ current, onChange }: { current: string; onChange: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {THEMES.map(theme => {
        const active = current === theme.id;
        return (
          <button
            key={theme.id}
            onClick={() => onChange(theme.id)}
            type="button"
            className="relative rounded-xl p-3 text-right transition-all"
            style={{
              background: active ? 'rgba(0,229,204,0.08)' : 'rgba(0,0,0,0.2)',
              border: `2px solid ${active ? 'var(--color-accent)' : 'rgba(255,255,255,0.05)'}`,
            }}
          >
            <div
              className="w-full h-20 rounded-lg mb-2 flex items-center justify-center"
              style={{
                background: theme.preview.bg,
                border: `2px solid ${theme.preview.border}`,
                boxShadow: `0 0 18px ${theme.preview.glow}`,
              }}
            >
              <span className="text-[11px] font-bold tracking-wide" style={{ color: theme.preview.border, textShadow: `0 0 6px ${theme.preview.glow}` }}>
                {theme.title.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{theme.title}</span>
                <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>{theme.desc}</span>
              </div>
              {active && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'var(--color-accent)', color: '#0a0e1a' }}>
                  פעיל
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ButtonEditor({ btn, onChange }: { btn: any; onChange: (b: any) => void }) {
  return (
    <div className="flex items-center gap-2 py-2 px-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.2)' }}>
      <input
        type="checkbox"
        checked={btn.enabled}
        onChange={e => onChange({ ...btn, enabled: e.target.checked })}
        className="w-4 h-4 accent-cyan-400"
      />
      <div className="flex flex-col gap-1 flex-1">
        <div className="flex gap-2">
          <input
            value={btn.nameHe}
            onChange={e => onChange({ ...btn, nameHe: e.target.value })}
            placeholder="שם בעברית"
            className="flex-1 px-2 py-1 rounded-lg text-xs outline-none"
            style={{ background: '#0a0e1a', border: '1px solid rgba(0,229,204,0.2)', color: 'white' }}
          />
          <input
            value={btn.nameEn}
            onChange={e => onChange({ ...btn, nameEn: e.target.value })}
            placeholder="English name"
            className="flex-1 px-2 py-1 rounded-lg text-xs outline-none"
            style={{ background: '#0a0e1a', border: '1px solid rgba(0,229,204,0.2)', color: 'white' }}
          />
        </div>
      </div>
      <select
        value={btn.icon}
        onChange={e => onChange({ ...btn, icon: e.target.value })}
        className="px-2 py-1 rounded-lg text-xs outline-none"
        style={{ background: '#0a0e1a', border: '1px solid rgba(0,229,204,0.2)', color: 'white' }}
      >
        {ICON_OPTIONS.map(i => <option key={i} value={i}>{i}</option>)}
      </select>
    </div>
  );
}

function TemplateCard({ template, buildings, devices, onRefresh }: { template: any; buildings: any[]; devices: any[]; onRefresh: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(template.name);
  const [buttons, setButtons] = useState<any[]>(template.buttons ?? []);
  const [theme, setTheme] = useState<string>(template.theme ?? 'default');

  const saveMut = useMutation({
    mutationFn: () => api.patch(`/buildings/kiosk-templates/${template.id}`, { name, buttons, theme }),
    onSuccess: () => { setEditing(false); onRefresh(); toast.success('נשמר'); },
    onError: () => toast.error('שגיאה'),
  });

  const quickThemeMut = useMutation({
    mutationFn: (nextTheme: string) => api.patch(`/buildings/kiosk-templates/${template.id}`, { theme: nextTheme }),
    onSuccess: () => { onRefresh(); toast.success('עיצוב עודכן'); },
    onError: () => toast.error('שגיאה'),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/buildings/kiosk-templates/${template.id}`),
    onSuccess: () => { onRefresh(); toast.success('נמחק'); },
  });

  const assignedBuildings = buildings.filter(b => b.kioskTemplateId === template.id);
  const assignedDevices = devices.filter(d => d.kioskTemplateId === template.id);
  const currentTheme = editing ? theme : (template.theme ?? 'default');
  const themeMeta = THEMES.find(t => t.id === currentTheme) ?? THEMES[0];

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
      <div className="flex items-center justify-between px-5 py-4 gap-2 flex-wrap" style={{ borderBottom: editing ? '1px solid rgba(0,229,204,0.1)' : 'none' }}>
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          <LayoutTemplate size={16} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          {editing ? (
            <input value={name} onChange={e => setName(e.target.value)}
              className="px-2 py-1 rounded-lg text-sm outline-none font-semibold"
              style={{ background: '#0a0e1a', border: '1px solid rgba(0,229,204,0.4)', color: 'white', minWidth: 150 }} />
          ) : (
            <span className="font-semibold" style={{ color: 'var(--color-text)' }}>{template.name}</span>
          )}
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide"
            style={{
              background: themeMeta.preview.bg,
              color: themeMeta.preview.border,
              border: `1px solid ${themeMeta.preview.border}`,
              boxShadow: `0 0 6px ${themeMeta.preview.glow}`,
            }}
          >
            {themeMeta.title}
          </span>
          {assignedBuildings.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,229,204,0.1)', color: 'var(--color-accent)' }}>
              {assignedBuildings.map((b: any) => b.name).join(', ')}
            </span>
          )}
          {assignedDevices.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: 'rgba(168,85,247,0.1)', color: '#c084fc' }}>
              <Tablet size={11} /> {assignedDevices.length} טאבלטים
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
                className="p-1.5 rounded-lg hover:bg-green-500/20 transition-all" style={{ color: '#22c55e' }}>
                <Check size={15} />
              </button>
              <button onClick={() => { setEditing(false); setName(template.name); setButtons(template.buttons); setTheme(template.theme ?? 'default'); }}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-all" style={{ color: 'var(--color-text-secondary)' }}>
                <X size={15} />
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-all" style={{ color: 'var(--color-text-secondary)' }}>
                <Pencil size={14} />
              </button>
              <button onClick={() => { if (window.confirm(`מחק ${template.name}?`)) deleteMut.mutate(); }}
                className="p-1.5 rounded-lg hover:bg-red-500/20 transition-all" style={{ color: 'rgba(239,68,68,0.6)' }}>
                <Trash2 size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {!editing && (
        <div className="px-5 py-3 flex items-center gap-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
          <Palette size={13} style={{ color: 'var(--color-text-secondary)' }} />
          <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>עיצוב:</span>
          <div className="flex gap-1">
            {THEMES.map(t => {
              const active = (template.theme ?? 'default') === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => { if (!active) quickThemeMut.mutate(t.id); }}
                  disabled={quickThemeMut.isPending}
                  className="text-[11px] px-2 py-1 rounded-md font-medium transition-all"
                  style={{
                    background: active ? 'var(--color-accent)' : 'rgba(0,0,0,0.25)',
                    color: active ? '#0a0e1a' : 'var(--color-text-secondary)',
                    border: `1px solid ${active ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)'}`,
                  }}
                >
                  {t.title}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {editing && (
        <div className="p-5 flex flex-col gap-4">
          <div>
            <p className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)' }}>
              <Palette size={12} /> עיצוב הקיוסק
            </p>
            <ThemePicker current={theme} onChange={setTheme} />
          </div>
          <div>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--color-text-secondary)' }}>כפתורים</p>
            <div className="flex flex-col gap-2">
              {buttons.map((btn, i) => (
                <ButtonEditor key={btn.code} btn={btn}
                  onChange={updated => setButtons(bs => bs.map((b, j) => j === i ? updated : b))} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminKiosk() {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const [showNew, setShowNew] = useState(false);

  const { data: templates = [], refetch } = useQuery({
    queryKey: ['kiosk-templates'],
    queryFn: async () => (await api.get('/buildings/kiosk-templates')).data,
  });

  const { data: structure = [] } = useQuery({
    queryKey: ['building-structure'],
    queryFn: async () => (await api.get('/buildings/structure')).data,
  });

  const createMut = useMutation({
    mutationFn: () => api.post('/buildings/kiosk-templates', { name: newName }),
    onSuccess: () => { setNewName(''); setShowNew(false); refetch(); toast.success('טמפלט נוצר'); },
    onError: () => toast.error('שגיאה'),
  });

  const assignBuildingMut = useMutation({
    mutationFn: ({ buildingId, templateId }: { buildingId: string; templateId: string | null }) =>
      api.patch(`/buildings/${buildingId}/kiosk-template`, { templateId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['building-structure'] }); toast.success('עודכן'); },
  });

  const assignDeviceMut = useMutation({
    mutationFn: ({ deviceId, templateId }: { deviceId: string; templateId: string | null }) =>
      api.patch(`/buildings/devices/${deviceId}/kiosk-template`, { templateId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['building-structure'] }); toast.success('עודכן'); },
  });

  // Flatten all devices across the structure for per-device assignment.
  const allDevices: any[] = [];
  for (const b of structure as any[]) {
    for (const f of b.floors ?? []) {
      for (const r of f.restrooms ?? []) {
        for (const d of r.devices ?? []) {
          allDevices.push({
            ...d,
            buildingName: b.name,
            floorName: f.name,
            restroomName: r.name,
          });
        }
      }
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>טמפלטים לקיוסק</h1>
        <button onClick={() => setShowNew(v => !v)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
          style={{ background: 'rgba(0,229,204,0.15)', border: '1px solid var(--color-accent)', color: 'var(--color-accent)' }}>
          <Plus size={15} /> טמפלט חדש
        </button>
      </div>

      {showNew && (
        <div className="flex gap-2 items-center p-4 rounded-2xl" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.2)' }}>
          <input value={newName} onChange={e => setNewName(e.target.value)}
            placeholder="שם הטמפלט..."
            className="flex-1 px-3 py-2 rounded-xl text-sm outline-none"
            style={{ background: '#0a0e1a', border: '1px solid rgba(0,229,204,0.3)', color: 'white' }} />
          <button onClick={() => createMut.mutate()} disabled={!newName || createMut.isPending}
            className="px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(0,229,204,0.15)', border: '1px solid var(--color-accent)', color: 'var(--color-accent)' }}>
            צור
          </button>
        </div>
      )}

      {templates.length === 0 && (
        <div className="rounded-2xl p-12 text-center" style={{ background: 'var(--color-card)', border: '2px dashed rgba(0,229,204,0.2)' }}>
          <LayoutTemplate size={40} className="mx-auto mb-3" style={{ color: 'rgba(0,229,204,0.3)' }} />
          <p style={{ color: 'var(--color-text-secondary)' }}>אין טמפלטים עדיין — צור אחד חדש</p>
        </div>
      )}

      {templates.map((t: any) => (
        <TemplateCard key={t.id} template={t} buildings={structure} devices={allDevices} onRefresh={refetch} />
      ))}

      {/* Assign templates to buildings */}
      {structure.length > 0 && templates.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
          <div className="px-5 py-4 font-semibold flex items-center gap-2" style={{ borderBottom: '1px solid rgba(0,229,204,0.1)', color: 'var(--color-text)' }}>
            <LayoutTemplate size={14} style={{ color: 'var(--color-accent)' }} />
            שיוך טמפלט לבניין
            <span className="text-[11px] font-normal mr-auto" style={{ color: 'var(--color-text-secondary)' }}>
              ברירת מחדל לכל הטאבלטים בבניין
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
            {structure.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm" style={{ color: 'var(--color-text)' }}>{b.name}</span>
                <select
                  value={b.kioskTemplateId ?? ''}
                  onChange={e => assignBuildingMut.mutate({ buildingId: b.id, templateId: e.target.value || null })}
                  className="px-3 py-1.5 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--color-bg)', border: '1px solid rgba(0,229,204,0.3)', color: 'var(--color-text)', minWidth: 180 }}
                >
                  <option value="">— ברירת מחדל —</option>
                  {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-device assignment */}
      {allDevices.length > 0 && templates.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
          <div className="px-5 py-4 font-semibold flex items-center gap-2" style={{ borderBottom: '1px solid rgba(0,229,204,0.1)', color: 'var(--color-text)' }}>
            <Tablet size={14} style={{ color: 'var(--color-accent)' }} />
            שיוך טמפלט לטאבלט
            <span className="text-[11px] font-normal mr-auto" style={{ color: 'var(--color-text-secondary)' }}>
              דורס את הגדרת הבניין עבור טאבלט ספציפי
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
            {allDevices.map(d => (
              <div key={d.id} className="flex items-center justify-between px-5 py-3 gap-3">
                <div className="flex flex-col min-w-0">
                  <span className="text-sm truncate" style={{ color: 'var(--color-text)' }}>{d.deviceCode}</span>
                  <span className="text-[11px] truncate" style={{ color: 'var(--color-text-secondary)' }}>
                    {d.buildingName} • {d.floorName} • {d.restroomName}
                  </span>
                </div>
                <select
                  value={d.kioskTemplateId ?? ''}
                  onChange={e => assignDeviceMut.mutate({ deviceId: d.id, templateId: e.target.value || null })}
                  className="px-3 py-1.5 rounded-xl text-sm outline-none flex-shrink-0"
                  style={{ background: 'var(--color-bg)', border: '1px solid rgba(0,229,204,0.3)', color: 'var(--color-text)', minWidth: 180 }}
                >
                  <option value="">— מהבניין —</option>
                  {templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
