import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '../../i18n';
import api from '../../lib/api';

export default function CleanerLoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [idNumber, setIdNumber] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const lang = i18n.language as 'he' | 'en';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/cleaner/login', { idNumber });
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('orgId', data.user.orgId);
      navigate('/cleaner');
    } catch {
      setError(t('cleaner.login.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'var(--color-bg)' }}
    >
      {/* Language toggle */}
      <div className="absolute top-4 right-4 flex gap-2">
        {(['he', 'en'] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLanguage(l)}
            className={`px-2 py-1 rounded text-xs ${lang === l ? 'text-cyan-400 font-bold' : 'text-gray-500'}`}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      <div
        className="w-full max-w-sm p-8 rounded-2xl"
        style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.25)' }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🧹</div>
          <h1 className="text-2xl font-bold text-white">{t('cleaner.login.title')}</h1>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div>
            <label className="text-sm mb-1 block" style={{ color: 'var(--color-text-secondary)' }}>
              {t('cleaner.login.idLabel')}
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              placeholder={t('cleaner.login.idPlaceholder')}
              required
              className="w-full px-4 py-3 rounded-xl outline-none text-white text-lg tracking-widest"
              style={{
                background: '#0a0e1a',
                border: '1px solid rgba(0,229,204,0.3)',
              }}
            />
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !idNumber}
            className="w-full py-4 rounded-xl text-base font-bold mt-2 transition-all active:scale-95"
            style={{
              background: 'rgba(0,229,204,0.15)',
              border: '1px solid var(--color-accent)',
              color: 'var(--color-accent)',
              opacity: loading || !idNumber ? 0.5 : 1,
            }}
          >
            {loading ? t('common.loading') : t('cleaner.login.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
