/**
 * KioskSelector — Admin Setup Screen
 *
 * Shown when navigating to /kiosk (no device code).
 * Only an admin (ORG_ADMIN / MANAGER) with a registered ID number can
 * configure which restroom this tablet serves.
 * After selecting a restroom the device is registered as ROOM-{restroomId}
 * and the browser navigates to /kiosk/ROOM-{restroomId}.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, ArrowRight } from 'lucide-react';
import api from '../../lib/api';

type SetupStep = 'pin' | 'building' | 'floor' | 'restroom' | 'done';

const NUMPAD = ['1','2','3','4','5','6','7','8','9','←','0','✓'];

export default function KioskSelector() {
  const navigate = useNavigate();

  const [step, setStep] = useState<SetupStep>('pin');
  const [idNumber, setIdNumber] = useState('');
  const [adminName, setAdminName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Building tree
  const [buildings, setBuildings] = useState<any[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<any>(null);
  const [selectedFloor, setSelectedFloor] = useState<any>(null);

  // Load org structure once admin is verified
  const loadStructure = async () => {
    try {
      const { data: org } = await api.get('/auth/default-org');
      const { data } = await api.get(`/buildings/public-structure/${org.orgId}`);
      setBuildings(data);
      if (data?.length === 1) { setSelectedBuilding(data[0]); setStep('floor'); }
      else setStep('building');
    } catch {
      setError('שגיאה בטעינת המבנה');
    }
  };

  const handleNumpad = (key: string) => {
    if (key === '←') setIdNumber(v => v.slice(0, -1));
    else if (key === '✓') handleVerify();
    else if (idNumber.length < 20) setIdNumber(v => v + key);
  };

  const handleVerify = async () => {
    if (!idNumber) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/users/verify-admin', { idNumber });
      if (!data.found) {
        setError('תעודת זהות לא נמצאה — רק מנהל מערכת יכול להגדיר טאבלט');
        setIdNumber('');
        setLoading(false);
        return;
      }
      setAdminName(data.name);
      await loadStructure();
    } catch {
      setError('שגיאה — נסה שוב');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRestroom = async (restroom: any) => {
    setStep('done');
    const deviceCode = `ROOM-${restroom.id}`;
    // Register / update the device on the server
    try { await api.patch(`/auth/kiosk/${deviceCode}/restroom`, { restroomId: restroom.id }); } catch {}
    navigate(`/kiosk/${deviceCode}`);
  };

  const genderIcon  = (g: string) => g === 'MALE' ? '🚹' : g === 'FEMALE' ? '🚺' : '🚻';
  const genderLabel = (g: string) => g === 'MALE' ? 'גברים' : g === 'FEMALE' ? 'נשים' : 'משותף';

  return (
    <div className="flex flex-col overflow-hidden"
      style={{ height: '100dvh', minHeight: '-webkit-fill-available', background: 'radial-gradient(ellipse 120% 60% at 50% 0%, #0a1628 0%, #060a12 100%)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--color-accent)' }}>
          <Settings size={16} /> הגדרת טאבלט
        </div>
        {step !== 'pin' && (
          <button
            onClick={() => { setStep('pin'); setIdNumber(''); setError(''); setSelectedBuilding(null); setSelectedFloor(null); }}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
            <ArrowRight size={14} /> ביטול
          </button>
        )}
      </div>

      {/* ── PIN step ── */}
      {step === 'pin' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
          <div className="text-center">
            <div className="text-5xl mb-3">🔐</div>
            <h1 className="text-2xl font-bold text-white">טאבלט לא מוגדר</h1>
            <p className="text-sm mt-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
              הכנס תעודת זהות של מנהל מערכת כדי להגדיר
            </p>
          </div>

          <div className="w-full max-w-xs py-4 rounded-2xl text-center text-3xl font-mono"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1.5px solid rgba(0,229,204,0.4)', color: '#00e5cc', letterSpacing: '0.2em', minHeight: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {idNumber
              ? <span>{idNumber}</span>
              : <span style={{ opacity: 0.2, letterSpacing: '0.3em' }}>_ _ _ _ _ _ _ _ _</span>
            }
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
            {NUMPAD.map(key => (
              <button key={key} onPointerDown={() => handleNumpad(key)} disabled={loading}
                className="py-5 rounded-2xl text-2xl font-bold transition-all active:scale-90"
                style={{
                  background: key === '✓' ? 'rgba(0,229,204,0.18)' : key === '←' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.08)',
                  border: `1.5px solid ${key === '✓' ? 'rgba(0,229,204,0.6)' : 'rgba(255,255,255,0.12)'}`,
                  color: key === '✓' ? '#00e5cc' : 'white',
                  boxShadow: key === '✓' ? '0 0 16px rgba(0,229,204,0.2)' : 'none',
                }}>
                {loading && key === '✓' ? '...' : key}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Building selector ── */}
      {step === 'building' && (
        <div className="flex-1 flex flex-col items-center px-6 pt-8 gap-4">
          <div className="text-center mb-2">
            <p className="text-lg font-bold text-white">שלום, {adminName}</p>
            <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>בחר בניין</p>
          </div>
          <div className="flex flex-col gap-3 w-full max-w-md">
            {buildings.map(b => (
              <button key={b.id} onClick={() => { setSelectedBuilding(b); setStep('floor'); }}
                className="w-full py-5 px-5 rounded-2xl text-white font-semibold text-lg text-start transition-all active:scale-95"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,229,204,0.25)' }}>
                🏢 {b.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Floor selector ── */}
      {step === 'floor' && selectedBuilding && (
        <div className="flex-1 flex flex-col items-center px-6 pt-8 gap-4">
          <div className="text-center mb-2">
            <p className="text-sm font-medium" style={{ color: 'var(--color-accent)' }}>{selectedBuilding.name}</p>
            <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>בחר קומה</p>
          </div>
          <button onClick={() => setStep('building')} className="self-start text-sm mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
            ← חזרה
          </button>
          <div className="flex flex-col gap-3 w-full max-w-md">
            {selectedBuilding.floors.map((f: any) => (
              <button key={f.id} onClick={() => { setSelectedFloor(f); setStep('restroom'); }}
                className="w-full py-5 px-5 rounded-2xl text-white font-semibold text-lg text-start transition-all active:scale-95"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,229,204,0.25)' }}>
                🏬 {f.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Restroom selector ── */}
      {step === 'restroom' && selectedFloor && (
        <div className="flex-1 flex flex-col items-center px-6 pt-8 gap-4">
          <div className="text-center mb-2">
            <p className="text-sm font-medium" style={{ color: 'var(--color-accent)' }}>{selectedBuilding?.name} — {selectedFloor.name}</p>
            <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>בחר שירותים</p>
          </div>
          <button onClick={() => setStep('floor')} className="self-start text-sm mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
            ← חזרה
          </button>
          <div className="flex flex-col gap-3 w-full max-w-md">
            {selectedFloor.restrooms.map((r: any) => (
              <button key={r.id} onClick={() => handleSelectRestroom(r)}
                className="w-full py-6 px-5 rounded-2xl text-white font-semibold text-xl text-center transition-all active:scale-95"
                style={{ background: 'rgba(0,229,204,0.1)', border: '1.5px solid rgba(0,229,204,0.4)', boxShadow: '0 0 20px rgba(0,229,204,0.1)' }}>
                {genderIcon(r.gender)} {r.name} — {genderLabel(r.gender)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Done ── */}
      {step === 'done' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
          <div className="text-6xl animate-bounce">✅</div>
          <h2 className="text-2xl font-bold text-white text-center">הטאבלט מוגדר!</h2>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>מעבר לקיוסק...</p>
        </div>
      )}
    </div>
  );
}
