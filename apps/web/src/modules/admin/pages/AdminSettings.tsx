import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, ChevronDown, ChevronRight, Building2, Layers2, Tablet, Trash2, Pencil, Check, X, Globe, Copy, ExternalLink, ShieldCheck } from 'lucide-react';
import api from '../../../lib/api';
import toast from 'react-hot-toast';

function LangButton({ value, current, onChange }: { value: string; current: string; onChange: (v: string) => void }) {
  const active = value === current;
  return (
    <button onClick={() => onChange(value)}
      className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
      style={{
        background: active ? 'rgba(0,229,204,0.15)' : 'rgba(255,255,255,0.05)',
        border: `1px solid ${active ? 'rgba(0,229,204,0.6)' : 'rgba(255,255,255,0.1)'}`,
        color: active ? '#00e5cc' : 'var(--color-text-secondary)',
      }}>
      {value === 'he' ? '🇮🇱 עברית' : '🇺🇸 English'}
    </button>
  );
}

function InlineEdit({ value, onSave, className }: { value: string; onSave: (v: string) => Promise<void>; className?: string }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!val.trim() || val === value) { setEditing(false); setVal(value); return; }
    setSaving(true);
    try { await onSave(val.trim()); setEditing(false); }
    catch { toast.error('Error'); setVal(value); }
    finally { setSaving(false); }
  };

  if (!editing) return (
    <button onClick={() => setEditing(true)} className={`group flex items-center gap-1 text-start ${className ?? ''}`}>
      <span>{value}</span>
      <Pencil size={11} className="opacity-0 group-hover:opacity-50 transition-opacity" />
    </button>
  );

  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setVal(value); } }}
        className="px-2 py-0.5 rounded-lg text-sm text-white outline-none"
        style={{ background: '#0a0e1a', border: '1px solid rgba(0,229,204,0.4)', minWidth: 120 }}
      />
      <button onClick={save} disabled={saving} className="text-green-400 hover:text-green-300"><Check size={14} /></button>
      <button onClick={() => { setEditing(false); setVal(value); }} className="text-gray-500 hover:text-gray-300"><X size={14} /></button>
    </div>
  );
}

// ─── tiny modal ────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-2xl p-6 flex flex-col gap-4" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.3)' }}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-xl px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-cyan-400";
const inputStyle = { background: '#0a0e1a', border: '1px solid rgba(255,255,255,0.1)' };
const btnPrimary = "px-4 py-2 rounded-xl text-sm font-medium transition-all";
const btnSecondary = "px-4 py-2 rounded-xl text-sm font-medium transition-all";

// ─── modals ────────────────────────────────────────────────────────────────────
function AddBuildingModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const mut = useMutation({
    mutationFn: () => api.post('/buildings', { name, address }),
    onSuccess: onDone,
  });
  return (
    <Modal title={t('admin.settings.addBuilding')} onClose={onClose}>
      <Field label={t('admin.settings.buildingName')}>
        <input className={inputCls} style={inputStyle} value={name} onChange={e => setName(e.target.value)} />
      </Field>
      <Field label={t('admin.settings.address')}>
        <input className={inputCls} style={inputStyle} value={address} onChange={e => setAddress(e.target.value)} />
      </Field>
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className={btnSecondary} style={{ background: 'rgba(255,255,255,0.05)', color: '#8a9bb0' }}>{t('common.cancel')}</button>
        <button
          onClick={() => mut.mutate()}
          disabled={!name || mut.isPending}
          className={btnPrimary}
          style={{ background: 'rgba(0,229,204,0.15)', border: '1px solid var(--color-accent)', color: 'var(--color-accent)' }}
        >
          {mut.isPending ? '...' : t('common.save')}
        </button>
      </div>
    </Modal>
  );
}

function AddFloorModal({ buildingId, onClose, onDone }: { buildingId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [floorNumber, setFloorNumber] = useState('');
  const [name, setName] = useState('');
  const mut = useMutation({
    mutationFn: () => api.post(`/buildings/${buildingId}/floors`, { floorNumber: Number(floorNumber), name }),
    onSuccess: onDone,
  });
  return (
    <Modal title={t('admin.settings.addFloor')} onClose={onClose}>
      <Field label={t('admin.settings.floorNumber')}>
        <input type="number" className={inputCls} style={inputStyle} value={floorNumber} onChange={e => setFloorNumber(e.target.value)} />
      </Field>
      <Field label={t('admin.settings.floorName')}>
        <input className={inputCls} style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder={t('admin.settings.floorNamePlaceholder')} />
      </Field>
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className={btnSecondary} style={{ background: 'rgba(255,255,255,0.05)', color: '#8a9bb0' }}>{t('common.cancel')}</button>
        <button
          onClick={() => mut.mutate()}
          disabled={!floorNumber || !name || mut.isPending}
          className={btnPrimary}
          style={{ background: 'rgba(0,229,204,0.15)', border: '1px solid var(--color-accent)', color: 'var(--color-accent)' }}
        >
          {mut.isPending ? '...' : t('common.save')}
        </button>
      </div>
    </Modal>
  );
}

function AddRestroomModal({ floorId, onClose, onDone }: { floorId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'UNISEX'>('UNISEX');
  const mut = useMutation({
    mutationFn: () => api.post(`/buildings/floors/${floorId}/restrooms`, { name, gender }),
    onSuccess: onDone,
  });
  return (
    <Modal title={t('admin.settings.addRestroom')} onClose={onClose}>
      <Field label={t('admin.settings.restroomName')}>
        <input className={inputCls} style={inputStyle} value={name} onChange={e => setName(e.target.value)} />
      </Field>
      <Field label={t('admin.settings.gender')}>
        <select
          className={inputCls}
          style={inputStyle}
          value={gender}
          onChange={e => setGender(e.target.value as any)}
        >
          <option value="MALE">🚹 {t('admin.settings.male')}</option>
          <option value="FEMALE">🚺 {t('admin.settings.female')}</option>
          <option value="UNISEX">🚻 {t('admin.settings.unisex')}</option>
        </select>
      </Field>
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className={btnSecondary} style={{ background: 'rgba(255,255,255,0.05)', color: '#8a9bb0' }}>{t('common.cancel')}</button>
        <button
          onClick={() => mut.mutate()}
          disabled={!name || mut.isPending}
          className={btnPrimary}
          style={{ background: 'rgba(0,229,204,0.15)', border: '1px solid var(--color-accent)', color: 'var(--color-accent)' }}
        >
          {mut.isPending ? '...' : t('common.save')}
        </button>
      </div>
    </Modal>
  );
}

function RegisterDeviceModal({ restroomId, onClose, onDone }: { restroomId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [deviceCode, setDeviceCode] = useState('');
  const mut = useMutation({
    mutationFn: () => api.post(`/buildings/restrooms/${restroomId}/devices`, { deviceCode }),
    onSuccess: onDone,
  });
  return (
    <Modal title={t('admin.settings.registerDevice')} onClose={onClose}>
      <Field label={t('admin.settings.deviceCode')}>
        <input
          className={inputCls}
          style={inputStyle}
          value={deviceCode}
          onChange={e => setDeviceCode(e.target.value.toUpperCase())}
          placeholder="KIOSK-F1-M"
        />
      </Field>
      <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
        {t('admin.settings.deviceCodeHint')}
      </p>
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className={btnSecondary} style={{ background: 'rgba(255,255,255,0.05)', color: '#8a9bb0' }}>{t('common.cancel')}</button>
        <button
          onClick={() => mut.mutate()}
          disabled={!deviceCode || mut.isPending}
          className={btnPrimary}
          style={{ background: 'rgba(0,229,204,0.15)', border: '1px solid var(--color-accent)', color: 'var(--color-accent)' }}
        >
          {mut.isPending ? '...' : t('common.save')}
        </button>
      </div>
    </Modal>
  );
}

// ─── tree nodes ────────────────────────────────────────────────────────────────
function RestroomRow({ room, onDeviceAdded, onDeleted }: { room: any; onDeviceAdded: () => void; onDeleted: () => void }) {
  const { t } = useTranslation();
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [gender, setGender] = useState(room.gender);

  const handleDeleteDevice = async (deviceId: string, deviceCode: string) => {
    if (!window.confirm(`${t('common.delete')} ${deviceCode}?`)) return;
    try { await api.delete(`/buildings/devices/${deviceId}`); onDeviceAdded(); }
    catch { toast.error('Error'); }
  };

  const handleDeleteRestroom = async () => {
    if (!window.confirm(`${t('common.delete')} ${room.name}?`)) return;
    try { await api.delete(`/buildings/restrooms/${room.id}`); onDeleted(); }
    catch { toast.error('Error'); }
  };

  const handleGenderChange = async (g: string) => {
    setGender(g);
    try { await api.patch(`/buildings/restrooms/${room.id}`, { gender: g }); onDeviceAdded(); }
    catch { toast.error('Error'); setGender(room.gender); }
  };

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-xl" style={{ background: 'rgba(0,0,0,0.2)' }}>
      <div className="flex items-center gap-2 min-w-0">
        <select value={gender} onChange={e => handleGenderChange(e.target.value)}
          className="text-sm rounded-lg px-1 py-0.5 outline-none" style={{ background: 'transparent', color: 'inherit', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>
          <option value="MALE">🚹</option>
          <option value="FEMALE">🚺</option>
          <option value="UNISEX">🚻</option>
        </select>
        <InlineEdit value={room.name} className="text-sm text-white"
          onSave={async v => { await api.patch(`/buildings/restrooms/${room.id}`, { name: v }); onDeviceAdded(); }} />
        <div className="flex items-center gap-1 ms-2">
          {(room.devices ?? []).map((d: any) => (
            <div key={d.id} className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-mono" style={{ background: 'rgba(255,255,255,0.05)', color: '#8a9bb0' }}>
              <span className={`w-1.5 h-1.5 rounded-full ${d.isOnline ? 'bg-green-400' : 'bg-red-400'}`} />
              {d.deviceCode}
              <button onClick={() => handleDeleteDevice(d.id, d.deviceCode)} className="hover:text-red-400 transition-colors ms-1"><Trash2 size={10} /></button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={() => setShowDeviceModal(true)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all"
          style={{ background: 'rgba(0,229,204,0.08)', border: '1px solid rgba(0,229,204,0.2)', color: 'var(--color-accent)' }}
        >
          <Tablet size={12} />
          <span>{t('admin.settings.addDevice')}</span>
        </button>
        <button onClick={handleDeleteRestroom} className="p-1.5 rounded-lg hover:bg-red-500/20 transition-all" style={{ color: 'rgba(239,68,68,0.6)' }}>
          <Trash2 size={13} />
        </button>
      </div>
      {showDeviceModal && (
        <RegisterDeviceModal
          restroomId={room.id}
          onClose={() => setShowDeviceModal(false)}
          onDone={() => { setShowDeviceModal(false); onDeviceAdded(); }}
        />
      )}
    </div>
  );
}

function FloorRow({ floor, onRestroomAdded, onDeleted }: { floor: any; onRestroomAdded: () => void; onDeleted: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const handleDeleteFloor = async () => {
    if (!window.confirm(`${t('common.delete')} ${floor.name}?`)) return;
    try {
      await api.delete(`/buildings/floors/${floor.id}`);
      onDeleted();
    } catch { toast.error('Error'); }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--color-accent)' }}>
          <button onClick={() => setOpen(o => !o)}>{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
          <Layers2 size={14} />
          <InlineEdit value={floor.name} className="font-medium"
            onSave={async v => { await api.patch(`/buildings/floors/${floor.id}`, { name: v }); onDeleted(); }} />
          <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(0,229,204,0.1)', color: 'var(--color-accent)' }}>
            {(floor.restrooms ?? []).length}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all"
            style={{ background: 'rgba(0,229,204,0.08)', border: '1px solid rgba(0,229,204,0.2)', color: 'var(--color-accent)' }}
          >
            <Plus size={12} />
            <span>{t('admin.settings.addRestroom')}</span>
          </button>
          <button onClick={handleDeleteFloor} className="p-1.5 rounded-lg hover:bg-red-500/20 transition-all" style={{ color: 'rgba(239,68,68,0.6)' }}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {open && (
        <div className="ms-4 flex flex-col gap-1.5">
          {(floor.restrooms ?? []).map((room: any) => (
            <RestroomRow key={room.id} room={room} onDeviceAdded={onRestroomAdded} onDeleted={onRestroomAdded} />
          ))}
          {(floor.restrooms ?? []).length === 0 && (
            <p className="text-xs ps-2" style={{ color: 'var(--color-text-secondary)' }}>{t('admin.settings.noRestrooms')}</p>
          )}
        </div>
      )}
      {showModal && (
        <AddRestroomModal
          floorId={floor.id}
          onClose={() => setShowModal(false)}
          onDone={() => { setShowModal(false); onRestroomAdded(); }}
        />
      )}
    </div>
  );
}

function BuildingCard({ building, onRefresh }: { building: any; onRefresh: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const [showFloorModal, setShowFloorModal] = useState(false);

  const handleDeleteBuilding = async () => {
    if (!window.confirm(`${t('common.delete')} ${building.name}?`)) return;
    try {
      await api.delete(`/buildings/${building.id}`);
      onRefresh();
    } catch { toast.error('Error'); }
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
      {/* header */}
      <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(0,229,204,0.1)' }}>
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-3 min-w-0">
          {open ? <ChevronDown size={16} style={{ color: 'var(--color-accent)' }} /> : <ChevronRight size={16} style={{ color: 'var(--color-accent)' }} />}
          <Building2 size={18} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
          <div className="min-w-0 text-start">
            <InlineEdit value={building.name} className="font-semibold text-white"
              onSave={async v => { await api.patch(`/buildings/${building.id}`, { name: v }); onRefresh(); }} />
            <InlineEdit value={building.address || '—'} className="text-xs"
              onSave={async v => { await api.patch(`/buildings/${building.id}`, { address: v }); onRefresh(); }} />
          </div>
        </button>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowFloorModal(true)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm transition-all"
            style={{ background: 'rgba(0,229,204,0.1)', border: '1px solid rgba(0,229,204,0.3)', color: 'var(--color-accent)' }}
          >
            <Plus size={14} />
            {t('admin.settings.addFloor')}
          </button>
          <button onClick={handleDeleteBuilding} className="p-1.5 rounded-lg hover:bg-red-500/20 transition-all" style={{ color: 'rgba(239,68,68,0.6)' }}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* floors */}
      {open && (
        <div className="flex flex-col gap-3 p-5">
          {(building.floors ?? []).map((floor: any) => (
            <FloorRow key={floor.id} floor={floor} onRestroomAdded={onRefresh} onDeleted={onRefresh} />
          ))}
          {(building.floors ?? []).length === 0 && (
            <p className="text-sm text-center py-2" style={{ color: 'var(--color-text-secondary)' }}>{t('admin.settings.noFloors')}</p>
          )}
        </div>
      )}

      {showFloorModal && (
        <AddFloorModal
          buildingId={building.id}
          onClose={() => setShowFloorModal(false)}
          onDone={() => { setShowFloorModal(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

// ─── devices panel ─────────────────────────────────────────────────────────────
function DevicesPanel({ structure }: { structure: any[] }) {
  const { t } = useTranslation();
  const devices = structure.flatMap((b: any) =>
    (b.floors ?? []).flatMap((f: any) =>
      (f.restrooms ?? []).flatMap((r: any) =>
        (r.devices ?? []).map((d: any) => ({
          ...d,
          restroomName: r.name,
          floorName: f.name,
          buildingName: b.name,
        }))
      )
    )
  );

  if (devices.length === 0) return null;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
      <div className="px-5 py-4 font-semibold text-white" style={{ borderBottom: '1px solid rgba(0,229,204,0.1)' }}>
        <div className="flex items-center gap-2">
          <Tablet size={16} style={{ color: 'var(--color-accent)' }} />
          {t('admin.devices.title')}
        </div>
      </div>
      <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        {devices.map((d: any) => (
          <div key={d.id} className="flex items-center justify-between px-5 py-3">
            <div>
              <div className="text-sm font-medium text-white font-mono">{d.deviceCode}</div>
              <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                {d.buildingName} › {d.floorName} › {d.restroomName}
              </div>
              {d.lastHeartbeat && (
                <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                  {t('admin.devices.lastSeen')}: {new Date(d.lastHeartbeat).toLocaleString()}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${d.isOnline ? 'bg-green-400' : 'bg-red-400'}`} />
              <span className="text-sm" style={{ color: d.isOnline ? '#22c55e' : '#ef4444' }}>
                {d.isOnline ? t('admin.devices.online') : t('admin.devices.offline')}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── URL guide ─────────────────────────────────────────────────────────────────
function CopyRow({ label, sub, url, accent }: { label: string; sub?: string; url: string; accent?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  const color = accent ?? 'var(--color-accent)';

  return (
    <div
      className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl"
      style={{ background: '#0a0e1a', border: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium text-white truncate">{label}</span>
        {sub && <span className="text-[11px] truncate" style={{ color: 'var(--color-text-secondary)' }}>{sub}</span>}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] font-mono truncate mt-0.5 hover:underline flex items-center gap-1"
          style={{ color }}
        >
          {url}
          <ExternalLink size={10} />
        </a>
      </div>
      <button
        onClick={copy}
        title="העתק"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0 transition-all"
        style={{
          background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
          color: copied ? '#22c55e' : 'var(--color-text-secondary)',
          border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.08)'}`,
        }}
      >
        {copied ? <><Check size={12} /> הועתק</> : <><Copy size={12} /> העתק</>}
      </button>
    </div>
  );
}

function UrlGuide({ structure }: { structure: any[] }) {
  const origin = window.location.origin;

  const allDevices: { deviceCode: string; buildingName: string; floorName: string; restroomName: string; isOnline: boolean }[] = [];
  for (const b of structure) {
    for (const f of b.floors ?? []) {
      for (const r of f.restrooms ?? []) {
        for (const d of r.devices ?? []) {
          allDevices.push({
            deviceCode: d.deviceCode,
            buildingName: b.name,
            floorName: f.name,
            restroomName: r.name,
            isOnline: d.isOnline,
          });
        }
      }
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Staff interfaces */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
        <div className="px-5 py-4 flex items-center gap-2 border-b" style={{ borderColor: 'rgba(0,229,204,0.1)' }}>
          <ShieldCheck size={15} style={{ color: 'var(--color-accent)' }} />
          <h2 className="font-semibold text-white">ממשקי צוות</h2>
        </div>
        <div className="flex flex-col gap-2 p-4">
          <CopyRow
            label="ממשק מנהל"
            sub="כניסה עם אימייל וסיסמה"
            url={`${origin}/admin`}
            accent="#00e5cc"
          />
          <CopyRow
            label="ממשק עובד"
            sub="כניסה עם תעודת זהות"
            url={`${origin}/cleaner`}
            accent="#8b5cf6"
          />
        </div>
      </div>

      {/* Kiosk tablets */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
        <div className="px-5 py-4 flex items-center gap-2 border-b" style={{ borderColor: 'rgba(0,229,204,0.1)' }}>
          <Tablet size={15} style={{ color: 'var(--color-accent)' }} />
          <h2 className="font-semibold text-white">קיוסקים — כתובת לכל טאבלט</h2>
          <span className="text-[11px] ms-auto" style={{ color: 'var(--color-text-secondary)' }}>
            פתח בדפדפן הטאבלט ✦ הוסף למסך הבית
          </span>
        </div>
        <div className="flex flex-col gap-2 p-4">
          {allDevices.length === 0 && (
            <p className="text-sm text-center py-4" style={{ color: 'var(--color-text-secondary)' }}>
              אין טאבלטים רשומים — הוסף מכשירים בעץ הבניין
            </p>
          )}
          {allDevices.map(d => (
            <div key={d.deviceCode} className="relative">
              <CopyRow
                label={`${d.restroomName}`}
                sub={`${d.buildingName} › ${d.floorName} › ${d.deviceCode}`}
                url={`${origin}/kiosk/${d.deviceCode}`}
                accent="#f59e0b"
              />
              <span
                className="absolute top-3 left-3 w-2 h-2 rounded-full"
                style={{ background: d.isOnline ? '#22c55e' : '#ef4444' }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── main page ─────────────────────────────────────────────────────────────────
export default function AdminSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showBuildingModal, setShowBuildingModal] = useState(false);

  const { data: structure = [], isLoading } = useQuery({
    queryKey: ['building-structure'],
    queryFn: async () => (await api.get('/buildings/structure')).data,
    refetchInterval: 30_000,
  });

  const { data: orgSettings } = useQuery({
    queryKey: ['org-settings'],
    queryFn: async () => (await api.get('/users/org-settings')).data,
  });

  const updateOrgSettings = async (patch: { kioskLang?: string; cleanerLang?: string | null }) => {
    await api.patch('/users/org-settings', patch);
    queryClient.invalidateQueries({ queryKey: ['org-settings'] });
    toast.success('עודכן');
  };

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['building-structure'] });

  return (
    <div className="flex flex-col gap-5">
      {/* ── Language Settings ── */}
      <div className="rounded-2xl p-5 flex flex-col gap-5" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
        <h2 className="font-semibold text-white flex items-center gap-2">
          <Globe size={16} style={{ color: 'var(--color-accent)' }} />
          הגדרות שפה
        </h2>

        {/* Kiosk language */}
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>📋 שפת קיוסק</div>
          <div className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>כל הקיוסקים יוצגו בשפה זו</div>
          <div className="flex gap-2">
            {['he', 'en'].map(l => (
              <LangButton key={l} value={l} current={orgSettings?.kioskLang ?? 'he'}
                onChange={v => updateOrgSettings({ kioskLang: v })} />
            ))}
          </div>
        </div>

        <div className="h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

        {/* Cleaner language */}
        <div className="flex flex-col gap-2">
          <div className="text-sm font-medium" style={{ color: 'var(--color-text)' }}>🧹 שפת מנקים</div>
          <div className="text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>
            "לכל מנקה בנפרד" — שומר על השפה שנקבעה לכל מנקה אישית. בחירת שפה כאן דורסת את כולם.
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => updateOrgSettings({ cleanerLang: null })}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={{
                background: !orgSettings?.cleanerLang ? 'rgba(0,229,204,0.15)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${!orgSettings?.cleanerLang ? 'rgba(0,229,204,0.6)' : 'rgba(255,255,255,0.1)'}`,
                color: !orgSettings?.cleanerLang ? '#00e5cc' : 'var(--color-text-secondary)',
              }}>
              👤 לכל מנקה בנפרד
            </button>
            {['he', 'en'].map(l => (
              <LangButton key={l} value={l} current={orgSettings?.cleanerLang ?? ''}
                onChange={v => updateOrgSettings({ cleanerLang: v })} />
            ))}
          </div>
        </div>
      </div>

      {/* page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">{t('admin.nav.settings')}</h1>
        <button
          onClick={() => setShowBuildingModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
          style={{ background: 'rgba(0,229,204,0.15)', border: '1px solid var(--color-accent)', color: 'var(--color-accent)' }}
        >
          <Plus size={16} />
          {t('admin.settings.addBuilding')}
        </button>
      </div>

      {/* buildings */}
      {isLoading ? (
        <div className="text-center py-12" style={{ color: 'var(--color-text-secondary)' }}>{t('common.loading')}</div>
      ) : structure.length === 0 ? (
        <div
          className="rounded-2xl flex flex-col items-center justify-center py-16 gap-4"
          style={{ background: 'var(--color-card)', border: '2px dashed rgba(0,229,204,0.2)' }}
        >
          <Building2 size={48} style={{ color: 'rgba(0,229,204,0.3)' }} />
          <div className="text-center">
            <div className="font-medium text-white mb-1">{t('admin.settings.noBuildings')}</div>
            <div className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{t('admin.settings.addFirstBuilding')}</div>
          </div>
          <button
            onClick={() => setShowBuildingModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(0,229,204,0.15)', border: '1px solid var(--color-accent)', color: 'var(--color-accent)' }}
          >
            <Plus size={16} />
            {t('admin.settings.addBuilding')}
          </button>
        </div>
      ) : (
        structure.map((b: any) => (
          <BuildingCard key={b.id} building={b} onRefresh={refresh} />
        ))
      )}

      {/* devices overview */}
      {structure.length > 0 && <DevicesPanel structure={structure} />}

      {/* ── URL Guide ── */}
      <UrlGuide structure={structure} />

      {showBuildingModal && (
        <AddBuildingModal
          onClose={() => setShowBuildingModal(false)}
          onDone={() => { setShowBuildingModal(false); refresh(); }}
        />
      )}
    </div>
  );
}
