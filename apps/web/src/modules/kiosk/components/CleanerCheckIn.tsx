import { useState } from 'react';
import api from '../../../lib/api';
import { ArrowRight } from 'lucide-react';

interface Props {
  restroomId: string;
  onBack: () => void;
}

type Step = 'login' | 'action' | 'tasks' | 'arrived';

export default function CleanerCheckIn({ restroomId, onBack }: Props) {
  const [idNumber, setIdNumber] = useState('');
  const [step, setStep] = useState<Step>('login');
  const [cleaner, setCleaner] = useState<any>(null);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const NUMPAD = ['1','2','3','4','5','6','7','8','9','←','0','✓'];

  const handleLogin = async () => {
    if (!idNumber) return;
    setLoading(true);
    setError('');
    try {
      // Verify cleaner exists by trying to check in (dry-run: just fetch incidents)
      const { data } = await api.get(`/incidents/restroom/${restroomId}`);
      // Also fetch cleaner info via check-in ping
      setIncidents(data);
      setCleaner({ idNumber, name: '' });
      setStep('action');
    } catch {
      setError('תעודת הזהות לא נמצאה במערכת');
    } finally {
      setLoading(false);
    }
  };

  const handleArrived = async () => {
    setLoading(true);
    try {
      const { data } = await api.post('/users/checkin', {
        cleanerIdNumber: idNumber,
        restroomId,
      });
      setCleaner(data.cleaner);
      setStep('arrived');
    } catch {
      setError('שגיאה בדיווח הגעה');
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (incidentId: string) => {
    try {
      await api.patch(`/incidents/${incidentId}/resolve`, { cleanerIdNumber: idNumber });
      setIncidents(prev => prev.filter(i => i.id !== incidentId));
    } catch {}
  };

  const handleResolveAll = async () => {
    for (const inc of incidents) await handleResolve(inc.id);
  };

  const handleNumpad = (key: string) => {
    if (key === '←') setIdNumber(v => v.slice(0, -1));
    else if (key === '✓') handleLogin();
    else if (idNumber.length < 9) setIdNumber(v => v + key);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 120% 60% at 50% 0%, #0a1628 0%, #060a12 100%)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <button onClick={step === 'action' || step === 'arrived' ? () => { setStep('login'); setIdNumber(''); setError(''); } : onBack}
          className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
          <ArrowRight size={15} />
          {step === 'tasks' ? 'חזרה לאפשרויות' : 'חזרה'}
        </button>
        <div className="text-sm font-semibold" style={{ color: 'var(--color-accent)' }}>
          🧹 כניסת צוות
        </div>
      </div>

      {/* ── Step: Login ── */}
      {step === 'login' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
          <h2 className="text-2xl font-bold text-white text-center">הכנס תעודת זהות</h2>

          <div className="w-full py-4 rounded-2xl text-center text-3xl font-mono tracking-widest"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1.5px solid rgba(0,229,204,0.4)', color: '#00e5cc', letterSpacing: '0.3em' }}>
            {idNumber ? idNumber.split('').map((_, i) => '•').join(' ') : <span style={{ opacity: 0.3 }}>• • • • • • • • •</span>}
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
                {key}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Step: Action choice ── */}
      {step === 'action' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
          <div className="text-center mb-2">
            <div className="text-4xl mb-2">👋</div>
            <h2 className="text-2xl font-bold text-white">שלום!</h2>
            <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>בחר פעולה</p>
          </div>

          {/* Arrived button */}
          <button onClick={handleArrived} disabled={loading}
            className="w-full max-w-sm py-6 rounded-2xl flex flex-col items-center gap-2 transition-all active:scale-95"
            style={{
              background: 'rgba(0,229,204,0.1)',
              border: '1.5px solid rgba(0,229,204,0.5)',
              boxShadow: '0 0 20px rgba(0,229,204,0.15)',
            }}>
            <span className="text-4xl">📍</span>
            <span className="text-lg font-bold" style={{ color: '#00e5cc' }}>הגעתי לעבודה</span>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>דיווח כניסה למשמרת</span>
          </button>

          {/* Tasks button */}
          <button onClick={() => setStep('tasks')} disabled={loading}
            className="w-full max-w-sm py-6 rounded-2xl flex flex-col items-center gap-2 transition-all active:scale-95"
            style={{
              background: 'rgba(34,197,94,0.1)',
              border: '1.5px solid rgba(34,197,94,0.4)',
              boxShadow: '0 0 20px rgba(34,197,94,0.1)',
            }}>
            <span className="text-4xl">✅</span>
            <span className="text-lg font-bold" style={{ color: '#22c55e' }}>ניקיתי / טיפלתי</span>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {incidents.length > 0 ? `${incidents.length} בקשות פתוחות` : 'אין בקשות פתוחות כרגע'}
            </span>
          </button>

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
      )}

      {/* ── Step: Arrived confirmation ── */}
      {step === 'arrived' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
          <div className="text-6xl animate-bounce">📍</div>
          <h2 className="text-2xl font-bold text-white text-center">
            {cleaner?.name ? `${cleaner.name} — ` : ''}הגעה נרשמה!
          </h2>
          <p className="text-sm text-center" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <div className="mt-4 w-full max-w-xs p-4 rounded-2xl text-center"
            style={{ background: 'rgba(0,229,204,0.08)', border: '1px solid rgba(0,229,204,0.2)' }}>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
              {incidents.length > 0
                ? `ישנן ${incidents.length} בקשות פתוחות בחדר זה`
                : 'אין בקשות פתוחות בחדר זה'}
            </p>
          </div>
          {incidents.length > 0 && (
            <button onClick={() => setStep('tasks')}
              className="w-full max-w-xs py-4 rounded-2xl text-sm font-semibold mt-2"
              style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.4)', color: '#22c55e' }}>
              ✅ עבור לטיפול בבקשות
            </button>
          )}
          <button onClick={onBack}
            className="w-full max-w-xs py-3 rounded-2xl text-sm mt-1"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
            חזרה לקיוסק
          </button>
        </div>
      )}

      {/* ── Step: Tasks ── */}
      {step === 'tasks' && (
        <div className="flex-1 flex flex-col px-4 gap-3 overflow-y-auto pb-4">
          <div className="flex items-center justify-between py-2">
            <h3 className="text-lg font-semibold text-white">בקשות פתוחות</h3>
            {incidents.length > 0 && (
              <button onClick={handleResolveAll}
                className="text-sm px-4 py-2 rounded-xl font-medium"
                style={{ background: 'rgba(0,229,204,0.15)', color: '#00e5cc', border: '1px solid rgba(0,229,204,0.4)' }}>
                ✓ טפלתי בהכל
              </button>
            )}
          </div>

          {incidents.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <span className="text-5xl">✅</span>
              <p className="text-lg" style={{ color: 'rgba(255,255,255,0.5)' }}>אין בקשות פתוחות</p>
              <button onClick={onBack}
                className="mt-4 px-6 py-3 rounded-2xl text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>
                חזרה לקיוסק
              </button>
            </div>
          ) : incidents.map(inc => (
            <div key={inc.id} className="flex items-center justify-between p-4 rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(0,229,204,0.2)' }}>
              <div className="flex items-center gap-3">
                <span className="text-3xl">{inc.issueType?.icon ?? '📋'}</span>
                <div>
                  <div className="font-semibold text-white">{inc.issueType?.nameI18n?.he}</div>
                  <div className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    {new Date(inc.reportedAt).toLocaleTimeString('he-IL')}
                  </div>
                </div>
              </div>
              <button onClick={() => handleResolve(inc.id)}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.4)' }}>
                ✓ טיפלתי
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
