import { useEffect, useState, useRef } from 'react';
import { Outlet, useNavigate, NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { setLanguage } from '../../i18n';
import {
  LayoutDashboard, AlertCircle, BarChart2, Users, Settings, LogOut,
  Sun, Moon, LayoutTemplate, Menu, X, ChevronLeft, ChevronRight,
} from 'lucide-react';
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
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user') ?? '{}');
  const lang = i18n.language as 'he' | 'en';
  const now = useClock();

  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('adminTheme') as 'dark' | 'light') ?? 'dark'
  );

  // Desktop: sidebar collapsed (icons only) vs expanded
  const [collapsed, setCollapsed] = useState(() =>
    localStorage.getItem('adminSidebarCollapsed') === 'true'
  );
  // Mobile: sidebar open/closed
  const [mobileOpen, setMobileOpen] = useState(false);

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

  useEffect(() => {
    localStorage.setItem('adminSidebarCollapsed', String(collapsed));
  }, [collapsed]);

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

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
    { to: '/admin/kiosk', icon: LayoutTemplate, label: lang === 'he' ? 'קיוסק' : 'Kiosk' },
  ];

  const sidebarW = collapsed ? 64 : 224;

  const SidebarContent = ({ mobile = false }: { mobile?: boolean }) => (
    <div className="flex flex-col h-full py-5 px-2">

      {/* Brand + collapse toggle */}
      <div className={`flex items-center mb-6 px-1 ${collapsed && !mobile ? 'justify-center' : 'justify-between'}`}>
        {(!collapsed || mobile) && (
          <div>
            <div className="text-lg font-bold leading-tight" style={{ color: 'var(--color-accent)' }}>🚾 ToiletMon</div>
            <div className="text-xs mt-0.5 truncate max-w-[140px]" style={{ color: 'var(--color-text-secondary)' }}>{user.name}</div>
          </div>
        )}
        {mobile ? (
          <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10" style={{ color: 'var(--color-text-secondary)' }}>
            <X size={20} />
          </button>
        ) : (
          <button
            onClick={() => setCollapsed(c => !c)}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-all"
            style={{ color: 'var(--color-text-secondary)' }}
            title={collapsed ? 'הרחב תפריט' : 'כווץ תפריט'}
          >
            {lang === 'he'
              ? (collapsed ? <ChevronLeft size={16} /> : <ChevronRight size={16} />)
              : (collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />)
            }
          </button>
        )}
      </div>

      {/* Clock — hidden when collapsed on desktop */}
      {(!collapsed || mobile) && (
        <div className="mx-1 mb-5 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(0,229,204,0.06)', border: '1px solid rgba(0,229,204,0.12)' }}>
          <div className="text-xl font-bold tabular-nums" style={{ color: 'var(--color-accent)' }}>
            {now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            {now.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>
      )}

      {/* Nav links */}
      <nav className="flex flex-col gap-1 flex-1">
        {NAV.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed && !mobile ? label : undefined}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl text-sm font-medium transition-all ${
                collapsed && !mobile ? 'justify-center px-2 py-3' : 'px-3 py-2.5'
              } ${isActive ? 'text-cyan-400' : 'text-gray-400 hover:text-white'}`
            }
            style={({ isActive }) => ({
              background: isActive ? 'rgba(0,229,204,0.1)' : 'transparent',
              border: isActive ? '1px solid rgba(0,229,204,0.2)' : '1px solid transparent',
            })}
          >
            <Icon size={18} />
            {(!collapsed || mobile) && label}
          </NavLink>
        ))}
      </nav>

      {/* Bottom controls */}
      <div className="flex flex-col gap-2 mt-4">
        {/* Lang + Theme */}
        {(!collapsed || mobile) ? (
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
            >
              {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            className="flex justify-center p-2 rounded-lg hover:bg-white/10"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className={`flex items-center gap-2 rounded-xl text-sm text-red-400 hover:bg-red-400/10 transition-all ${
            collapsed && !mobile ? 'justify-center px-2 py-2.5' : 'px-3 py-2'
          }`}
          title={collapsed && !mobile ? t('cleaner.logout') : undefined}
        >
          <LogOut size={16} />
          {(!collapsed || mobile) && t('cleaner.logout')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex overflow-x-hidden" style={{ height: '100dvh', background: 'var(--color-bg)' }} dir={lang === 'he' ? 'rtl' : 'ltr'}>

      {/* ── Desktop sidebar ── */}
      <aside
        className="hidden lg:flex flex-col flex-shrink-0 transition-all duration-200"
        style={{
          width: sidebarW,
          background: 'var(--color-surface)',
          borderInlineEnd: '1px solid rgba(0,229,204,0.1)',
        }}
      >
        <SidebarContent />
      </aside>

      {/* ── Mobile: backdrop ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile: sliding sidebar ── */}
      <aside
        className="fixed top-0 z-50 h-full w-64 flex flex-col lg:hidden transition-transform duration-200"
        style={{
          background: 'var(--color-surface)',
          borderInlineEnd: '1px solid rgba(0,229,204,0.1)',
          [lang === 'he' ? 'right' : 'left']: 0,
          transform: mobileOpen ? 'translateX(0)' : lang === 'he' ? 'translateX(100%)' : 'translateX(-100%)',
        }}
      >
        <SidebarContent mobile />
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">

        {/* Mobile top-bar */}
        <header
          className="lg:hidden flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ background: 'var(--color-surface)', borderBottom: '1px solid rgba(0,229,204,0.1)' }}
        >
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-xl hover:bg-white/10 transition-all"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <Menu size={22} />
          </button>
          <span className="text-base font-bold" style={{ color: 'var(--color-accent)' }}>🚾 ToiletMon</span>
          <div className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-accent)' }}>
            {now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
