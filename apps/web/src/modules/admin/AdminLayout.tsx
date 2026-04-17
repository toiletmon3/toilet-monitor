import { useEffect, useState } from 'react';
import { Outlet, useNavigate, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '../../i18n';
import { LayoutDashboard, AlertCircle, BarChart2, Users, Settings, LogOut, Sun, Moon, LayoutTemplate } from 'lucide-react';

export default function AdminLayout() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') ?? '{}');
  const lang = i18n.language as 'he' | 'en';
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('adminTheme') as 'dark' | 'light') ?? 'dark'
  );

  // Auto-login bypass — if no token, fetch one automatically
  useEffect(() => {
    if (!localStorage.getItem('accessToken')) {
      import('../../lib/api').then(({ default: api }) => {
        api.get('/auth/admin-bypass').then(({ data }) => {
          if (data?.accessToken) {
            localStorage.setItem('accessToken', data.accessToken);
            localStorage.setItem('refreshToken', data.refreshToken);
            localStorage.setItem('user', JSON.stringify(data.user));
            window.location.reload();
          }
        });
      });
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('adminTheme', theme);
  }, [theme]);

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    navigate('/admin/login');
  };

  const NAV = [
    { to: '/admin', icon: LayoutDashboard, label: t('admin.nav.dashboard'), end: true },
    { to: '/admin/incidents', icon: AlertCircle, label: t('admin.nav.incidents') },
    { to: '/admin/analytics', icon: BarChart2, label: t('admin.nav.analytics') },
    { to: '/admin/cleaners', icon: Users, label: t('admin.nav.cleaners') },
    { to: '/admin/settings', icon: Settings, label: t('admin.nav.settings') },
    { to: '/admin/kiosk', icon: LayoutTemplate, label: 'קיוסק' },
  ];

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* Sidebar */}
      <aside
        className="w-56 flex flex-col py-6 px-3 fixed h-full top-0 start-0"
        style={{ background: 'var(--color-surface)', borderInlineEnd: '1px solid rgba(0,229,204,0.1)' }}
      >
        {/* Brand */}
        <div className="px-3 mb-8">
          <div className="text-xl font-bold" style={{ color: 'var(--color-accent)' }}>🚾 ToiletMon</div>
          <div className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>{user.name}</div>
        </div>

        {/* Nav links */}
        <nav className="flex flex-col gap-1 flex-1">
          {NAV.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive ? 'text-cyan-400' : 'text-gray-400 hover:text-white'
                }`
              }
              style={({ isActive }) => ({
                background: isActive ? 'rgba(0,229,204,0.1)' : 'transparent',
                border: isActive ? '1px solid rgba(0,229,204,0.2)' : '1px solid transparent',
              })}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div className="flex flex-col gap-2 px-1">
          {/* Language + theme toggles */}
          <div className="flex items-center justify-between px-2 gap-1">
            <div className="flex gap-1">
              {(['he', 'en'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLanguage(l)}
                  className={`px-2 py-1 rounded text-xs ${lang === l ? 'text-cyan-400 font-bold' : 'text-gray-600'}`}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              className="p-1.5 rounded-lg transition-all hover:bg-white/10"
              style={{ color: 'var(--color-text-secondary)' }}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-red-400 hover:bg-red-400/10 transition-all"
          >
            <LogOut size={16} />
            {t('cleaner.logout')}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="ms-56 flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
