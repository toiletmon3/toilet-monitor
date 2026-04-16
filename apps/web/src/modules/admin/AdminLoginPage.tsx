import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api';

export default function AdminLoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/admin/login', { email, password });
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('orgId', data.user.orgId);
      navigate('/admin');
    } catch {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6" style={{ background: 'var(--color-bg)' }}>
      <div
        className="w-full max-w-md p-10 rounded-2xl"
        style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.25)', boxShadow: '0 0 60px rgba(0,229,204,0.05)' }}
      >
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🏢</div>
          <h1 className="text-2xl font-bold text-white">{t('admin.login.title')}</h1>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('admin.login.email')}
            required
            className="w-full px-4 py-3 rounded-xl outline-none text-white"
            style={{ background: '#0a0e1a', border: '1px solid rgba(0,229,204,0.3)' }}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('admin.login.password')}
            required
            className="w-full px-4 py-3 rounded-xl outline-none text-white"
            style={{ background: '#0a0e1a', border: '1px solid rgba(0,229,204,0.3)' }}
          />

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-xl font-bold mt-2 transition-all"
            style={{ background: 'rgba(0,229,204,0.15)', border: '1px solid var(--color-accent)', color: 'var(--color-accent)' }}
          >
            {loading ? t('common.loading') : t('admin.login.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
