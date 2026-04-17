import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/api';
import { ArrowLeft } from 'lucide-react';

interface Props {
  restroomId: string;
  onBack: () => void;
}

export default function CleanerCheckIn({ restroomId, onBack }: Props) {
  const { t } = useTranslation();
  const [idNumber, setIdNumber] = useState('');
  const [step, setStep] = useState<'login' | 'tasks'>('login');
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/incidents/restroom/${restroomId}`);
      setIncidents(data);
      setStep('tasks');
    } catch {
      setError(t('cleaner.login.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (incidentId: string) => {
    try {
      await api.patch(`/incidents/${incidentId}/resolve`, { cleanerIdNumber: idNumber });
      setIncidents((prev) => prev.filter((i) => i.id !== incidentId));
    } catch {}
  };

  const handleResolveAll = async () => {
    for (const incident of incidents) {
      await handleResolve(incident.id);
    }
  };

  const NUMPAD = ['1','2','3','4','5','6','7','8','9','←','0','✓'];

  const handleNumpad = (key: string) => {
    if (key === '←') setIdNumber((v) => v.slice(0, -1));
    else if (key === '✓') handleLogin();
    else if (idNumber.length < 9) setIdNumber((v) => v + key);
  };

  return (
    <div className="kiosk-root h-screen flex flex-col" style={{ background: 'var(--color-bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-6 pb-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <ArrowLeft size={18} />
          {t('kiosk.cleanerMode.back')}
        </button>
        <div className="text-sm font-medium" style={{ color: 'var(--color-accent)' }}>
          🧹 {t('cleaner.title')}
        </div>
      </div>

      {step === 'login' ? (
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6">
          <h2 className="text-2xl font-bold text-white">{t('kiosk.cleanerMode.enterPin')}</h2>

          {/* ID display */}
          <div
            className="w-full py-4 rounded-xl text-center text-3xl font-mono tracking-widest"
            style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.3)', color: 'var(--color-accent)' }}
          >
            {idNumber || '•••••••••'}
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          {/* Numpad */}
          <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
            {NUMPAD.map((key) => (
              <button
                key={key}
                onPointerDown={() => handleNumpad(key)}
                disabled={loading}
                className="py-5 rounded-xl text-xl font-bold transition-all active:scale-90"
                style={{
                  background: key === '✓' ? 'rgba(0,229,204,0.15)' : 'var(--color-card)',
                  border: `1px solid ${key === '✓' ? 'var(--color-accent)' : 'rgba(0,229,204,0.2)'}`,
                  color: key === '✓' ? 'var(--color-accent)' : 'var(--color-text)',
                }}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col px-4 gap-3 overflow-y-auto scrollbar-hidden">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">{t('kiosk.cleanerMode.openIssues')}</h3>
            {incidents.length > 0 && (
              <button
                onClick={handleResolveAll}
                className="text-sm px-3 py-1 rounded-lg"
                style={{ background: 'rgba(0,229,204,0.15)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}
              >
                {t('kiosk.cleanerMode.resolveAll')}
              </button>
            )}
          </div>

          {incidents.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-lg" style={{ color: 'var(--color-text-secondary)' }}>
              ✅ {t('kiosk.cleanerMode.noIssues')}
            </div>
          ) : (
            incidents.map((inc) => (
              <div
                key={inc.id}
                className="flex items-center justify-between p-4 rounded-xl"
                style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.2)' }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{inc.issueType?.icon ?? '📋'}</span>
                  <div>
                    <div className="font-medium">{inc.issueType?.nameI18n?.he}</div>
                    <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                      {new Date(inc.reportedAt).toLocaleTimeString('he-IL')}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleResolve(inc.id)}
                  className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ background: 'rgba(0,229,204,0.15)', color: 'var(--color-accent)', border: '1px solid var(--color-accent)' }}
                >
                  ✓ {t('kiosk.cleanerMode.resolve')}
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
