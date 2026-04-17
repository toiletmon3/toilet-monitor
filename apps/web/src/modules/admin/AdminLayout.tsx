import { useEffect, useState, useRef } from 'react';
import { Outlet, useNavigate, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { setLanguage } from '../../i18n';
import { LayoutDashboard, AlertCircle, BarChart2, Users, Settings, LogOut, Sun, Moon, LayoutTemplate } from 'lucide-react';
import { getSocket, joinOrg } from '../../lib/socket';
import toast from 'react-hot-toast';

function useClock() {
  const [now, setNow] = useState(new Date());
  const ref = useRef<ReturnType<typeof setInterval>>(null);
  useEffect(() => {
    ref.current = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(ref.current!);
  }, []);
  return now;
}

export default function AdminLayout() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') ?? '{}');
  const lang = i18n.language as 'he' | 'en';
  const now = useClock();
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('adminTheme') as 'dark' | 'light') ?? 'dark'
  );

  const qc = useQueryClient();
  const [bypassReady, setBypassReady] = useState(!!localStorage.getItem('accessToken'));
  useEffect(() => {
    if (bypassReady) return;
    fetch('/api/auth/admin-bypass')
      .then(r => r.json())
      .then(data => {
        if (data?.accessToken) {
          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('refreshToken', data.refreshToken);
          localStorage.setItem('user', JSON.stringify(data.user));
          setBypassReady(true);
        } else {
          navigate('/admin/login');
        }
      })
      .catch(() => navigate('/admin/login'));
  }, [bypassReady, navigate]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('adminTheme', theme);
  }, [theme]);

  // WebSocket — join org room and refresh incidents in real-time
  useEffect(() => {
    if (!bypassReady) return;
    const orgId = user.orgId;
    if (!orgId) return;
    joinOrg(orgId);
    const socket = getSocket();
    const refresh = () => {
      qc.invalidateQueries({ queryKey: ['incidents'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    };
    const onCreated = () => { toast('📋 תקלה חדשה!', { duration: 4000 }); refresh(); };
    socket.on('incident:created', onCreated);
    socket.on('incident:updated', refresh);
    socket.on('incident:resolved', refresh);
    return () => {
      socket.off('incident:created', onCreated);
      socket.off('incident:updated', refresh);
      socket.off('incident:resolved', refresh);
    };
  }, [bypassReady, user.orgId, qc]);

  if (!bypassReady) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)', color: 'var(--color-text)' }}>
        <div className="text-center">
          <div className="text-4xl mb-3">⏳</div>
          <div>מתחבר...</div>
        </div>
      </div>
    );
  }

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
          <div className="mt-3 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(0,229,204,0.06)', border: '1px solid rgba(0,229,204,0.12)' }}>
            <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--color-accent)' }}>
              {now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
              {now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
          </div>
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
