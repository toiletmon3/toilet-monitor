import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  requireType?: string; // if set, user must type this string to confirm
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export default function ConfirmDialog({ title, description, confirmLabel = 'אשר', danger = true, requireType, onConfirm, onClose }: Props) {
  const [typed, setTyped] = useState('');
  const [loading, setLoading] = useState(false);

  const canConfirm = !requireType || typed === requireType;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setLoading(true);
    try { await onConfirm(); onClose(); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md rounded-2xl p-6 flex flex-col gap-4"
        style={{ background: 'var(--color-card)', border: `1px solid ${danger ? 'rgba(239,68,68,0.4)' : 'rgba(0,229,204,0.3)'}` }}>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: danger ? 'rgba(239,68,68,0.15)' : 'rgba(0,229,204,0.15)' }}>
            <AlertTriangle size={20} color={danger ? '#ef4444' : '#00e5cc'} />
          </div>
          <div>
            <h3 className="font-bold" style={{ color: 'var(--color-text)' }}>{title}</h3>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{description}</p>
          </div>
        </div>

        {requireType && (
          <div className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              הקלד <b style={{ color: '#ef4444' }}>{requireType}</b> לאישור
            </label>
            <input
              value={typed}
              onChange={e => setTyped(e.target.value)}
              className="px-3 py-2 rounded-xl text-sm outline-none"
              style={{ background: 'var(--color-bg)', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--color-text)' }}
              placeholder={requireType}
              autoFocus
            />
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--color-text-secondary)' }}>
            ביטול
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm || loading}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
            style={{
              background: danger ? 'rgba(239,68,68,0.15)' : 'rgba(0,229,204,0.15)',
              border: `1px solid ${danger ? 'rgba(239,68,68,0.5)' : 'rgba(0,229,204,0.5)'}`,
              color: danger ? '#f87171' : '#00e5cc',
            }}>
            {loading ? '...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
