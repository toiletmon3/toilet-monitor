import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../../lib/api';
import {
  queueAction, queueReplay, syncPending, flushOffline, getQueuedIncidents,
  cacheStaff, getCachedStaff, setCachedCheckedIn, refreshRoster,
  cacheRestroomIncidents, getCachedRestroomIncidents,
  cacheIssueTypes, getCachedIssueType,
  markResolvedLocal, getResolvedLocal, clearResolvedLocal,
} from '../../../lib/offline';
import { ArrowRight, Settings } from 'lucide-react';

const AUTO_CLOSE_SEC = 25;

/** Axios reports a lost connection with no `response` (or a timeout code) — the
 *  signal we use to fall back to the offline cache instead of erroring out. */
const isNetworkError = (e: any) =>
  !e?.response || e?.code === 'ERR_NETWORK' || e?.code === 'ECONNABORTED';

const FALLBACK_ISSUE = { icon: '📋', nameI18n: { he: 'בקשת טיפול' } };

interface Props {
  restroomId: string;
  deviceCode?: string;
  onBack: () => void;
  onReassigned?: (newRestroomId: string) => void;
}

type Step =
  | 'login'
  | 'action'
  | 'tasks'
  | 'arrived'
  | 'checkout_done'
  // Admin-only steps
  | 'admin_action'
  | 'admin_building'
  | 'admin_floor'
  | 'admin_restroom'
  | 'admin_done';

export default function CleanerCheckIn({ restroomId, deviceCode, onBack, onReassigned }: Props) {
  const [idNumber, setIdNumber] = useState('');
  const [step, setStep] = useState<Step>('login');
  const [cleaner, setCleaner] = useState<any>(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(!navigator.onLine);
  const [countdown, setCountdown] = useState(AUTO_CLOSE_SEC);

  // Restroom picker state (admin only)
  const [buildings, setBuildings] = useState<any[]>([]);
  const [selBuilding, setSelBuilding] = useState<any>(null);
  const [selFloor, setSelFloor] = useState<any>(null);

  // Radar presence-sensor status for this tablet's restroom. Shown only on the
  // manager screen (moved off the public kiosk, where the badge used to overlap
  // and block the team button).
  const [sensor, setSensor] = useState<{ present: boolean; online: boolean } | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resetCountdown = () => setCountdown(AUTO_CLOSE_SEC);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { onBack(); return AUTO_CLOSE_SEC; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current!);
  }, [onBack]);

  // ── Incident loading (online → server + cache; offline → cache + queue) ─────
  const loadIncidentsOffline = useCallback(async (rid: string) => {
    const resolved = getResolvedLocal();
    const cached = getCachedRestroomIncidents(rid)
      .filter((i: any) => !resolved.has(i.id))
      .map((i: any) => ({ ...i, __source: 'server' as const }));
    const queued = (await getQueuedIncidents(rid))
      .filter(q => !resolved.has(q.clientId))
      .map(q => ({
        id: q.clientId,
        clientId: q.clientId,
        reportedAt: q.reportedAt,
        issueType: q.issueType ?? getCachedIssueType(q.issueTypeId) ?? FALLBACK_ISSUE,
        __source: 'queued' as const,
      }));
    setIncidents([...cached, ...queued]);
  }, []);

  const loadIncidents = useCallback(async (rid: string) => {
    if (!navigator.onLine) { setOffline(true); await loadIncidentsOffline(rid); return; }
    try {
      // Push anything queued while offline first, so the fresh list is accurate.
      await flushOffline().catch(() => {});
      const { data: incs } = await api.get(`/incidents/restroom/${rid}`);
      cacheRestroomIncidents(rid, incs ?? []);
      cacheIssueTypes((incs ?? []).map((i: any) => i.issueType).filter(Boolean));
      clearResolvedLocal();
      setIncidents((incs ?? []).map((i: any) => ({ ...i, __source: 'server' as const })));
      setOffline(false);
    } catch (e: any) {
      // Network error → work from cache; any other failure → still don't block
      // the cleaner, fall back to whatever we last saw for this restroom.
      if (isNetworkError(e)) setOffline(true);
      await loadIncidentsOffline(rid);
    }
  }, [loadIncidentsOffline]);

  // Best-effort: cache the issue-type catalogue while online so queued incidents
  // reported offline still render with the right icon/name on the team screen.
  useEffect(() => {
    if (!navigator.onLine) return;
    // Keep the offline login roster fresh whenever the team screen opens online.
    refreshRoster(deviceCode);
    (async () => {
      try {
        const { data: org } = await api.get('/auth/default-org');
        if (org?.orgId) {
          const { data: types } = await api.get(`/buildings/issue-types/${org.orgId}`);
          cacheIssueTypes(types ?? []);
        }
      } catch { /* offline / no org — fall back to icons cached from incidents */ }
    })();
  }, [deviceCode]);

  // React to the tablet regaining/losing connectivity while the screen is open.
  useEffect(() => {
    const onOnline = async () => {
      setOffline(false);
      refreshRoster(deviceCode);
      await flushOffline().catch(() => {});
      if (!isAdmin && (step === 'action' || step === 'tasks' || step === 'arrived')) {
        await loadIncidents(restroomId).catch(() => {});
      }
    };
    const onOffline = () => setOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [isAdmin, step, restroomId, loadIncidents]);

  const NUMPAD = ['1','2','3','4','5','6','7','8','9','←','0','✓'];

  // ── Login: try cleaner first, then admin ──────────────────────────────────
  const handleLogin = async () => {
    if (!idNumber) return;
    setLoading(true);
    setError('');
    try {
      // 1. Try as cleaner
      const { data: cv } = await api.post('/users/verify-cleaner', { idNumber, deviceCode });
      if (cv.found) {
        // Remember this worker so they can still identify themselves if the
        // tablet later loses internet ("what was known until there was internet").
        cacheStaff(idNumber, { name: cv.name, isAdmin: false, checkedIn: !!cv.checkedIn });
        await loadIncidents(restroomId);
        setCleaner({ idNumber, name: cv.name });
        setCheckedIn(!!cv.checkedIn);
        setIsAdmin(false);
        setStep('action');
        return;
      }
      // Blocked: this worker belongs to a different property than this kiosk.
      if (cv.wrongProperty) {
        setError('העובד משויך לנכס אחר — אין הרשאה לקיוסק הזה');
        setIdNumber('');
        return;
      }

      // 2. Try as admin
      const { data: av } = await api.post('/users/verify-admin', { idNumber });
      if (av.found) {
        cacheStaff(idNumber, { name: av.name, isAdmin: true });
        setCleaner({ idNumber, name: av.name });
        setIsAdmin(true);
        setStep('admin_action');
        // Load the paired presence sensor's status for this tablet, shown on
        // the manager screen. Best-effort — a missing config never blocks login.
        if (deviceCode) {
          api.get(`/buildings/kiosk-config/${deviceCode}`)
            .then(r => setSensor(r.data?.sensor ?? null))
            .catch(() => {});
        }
        return;
      }

      // 3. Not found
      setError(cv.inactive ? 'החשבון מושבת — פנה למנהל' : 'תעודת זהות לא נמצאה במערכת');
      setIdNumber('');
    } catch (e: any) {
      if (isNetworkError(e)) {
        // No internet on the tablet — identify against the offline roster of
        // people who have logged in here before.
        setOffline(true);
        const cached = getCachedStaff(idNumber);
        if (cached && cached.isAdmin) {
          setCleaner({ idNumber, name: cached.name });
          setIsAdmin(true);
          setStep('admin_action');
        } else if (cached) {
          await loadIncidentsOffline(restroomId);
          setCleaner({ idNumber, name: cached.name });
          setCheckedIn(cached.checkedIn);
          setIsAdmin(false);
          setStep('action');
        } else {
          setError('אין חיבור לאינטרנט — כדי להזדהות בפעם הראשונה נדרש חיבור');
          setIdNumber('');
        }
      } else {
        setError('שגיאה בהתחברות — נסה שוב');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Cleaner actions ───────────────────────────────────────────────────────
  const handleArrived = async () => {
    setLoading(true);
    const finishOffline = async () => {
      await queueReplay({ method: 'post', url: '/users/checkin', data: { cleanerIdNumber: idNumber, restroomId } });
      setOffline(true);
      setCheckedIn(true);
      setCachedCheckedIn(idNumber, true);
      setStep('arrived');
    };
    if (!navigator.onLine) { await finishOffline(); setLoading(false); return; }
    try {
      const { data } = await api.post('/users/checkin', { cleanerIdNumber: idNumber, restroomId });
      setCleaner(data.cleaner);
      setCheckedIn(true);
      setCachedCheckedIn(idNumber, true);
      setStep('arrived');
    } catch (e: any) {
      if (isNetworkError(e)) await finishOffline();
      else setError('שגיאה בדיווח הגעה');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckout = async () => {
    setLoading(true);
    const finishOffline = async () => {
      await queueReplay({ method: 'post', url: '/users/checkout', data: { cleanerIdNumber: idNumber } });
      setOffline(true);
      setCheckedIn(false);
      setCachedCheckedIn(idNumber, false);
      setStep('checkout_done' as Step);
    };
    if (!navigator.onLine) { await finishOffline(); setLoading(false); return; }
    try {
      const { data } = await api.post('/users/checkout', { cleanerIdNumber: idNumber });
      setCleaner(data.cleaner);
      setCheckedIn(false);
      setCachedCheckedIn(idNumber, false);
      setStep('checkout_done' as Step);
    } catch (e: any) {
      if (isNetworkError(e)) await finishOffline();
      else setError('שגיאה בדיווח יציאה');
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async (inc: any) => {
    const key = inc.clientId ?? inc.id;
    const removeFromList = () => setIncidents(prev => prev.filter(i => (i.clientId ?? i.id) !== key));

    // Reported offline and not on the server yet → resolve through the
    // incident-clientId sync path (which creates + resolves it on flush).
    if (inc.__source === 'queued') {
      await queueAction({
        incidentClientId: inc.clientId,
        actionType: 'RESOLVED',
        cleanerIdNumber: idNumber,
        performedAt: new Date().toISOString(),
      });
      markResolvedLocal(key);
      removeFromList();
      if (navigator.onLine) syncPending().catch(() => {});
      else setOffline(true);
      return;
    }

    // A real server incident: resolve live, or queue a replay if there's no net.
    if (!navigator.onLine) {
      await queueReplay({ method: 'patch', url: `/incidents/${inc.id}/resolve`, data: { cleanerIdNumber: idNumber } });
      markResolvedLocal(key);
      setOffline(true);
      removeFromList();
      return;
    }
    try {
      await api.patch(`/incidents/${inc.id}/resolve`, { cleanerIdNumber: idNumber });
      removeFromList();
    } catch (e: any) {
      if (isNetworkError(e)) {
        await queueReplay({ method: 'patch', url: `/incidents/${inc.id}/resolve`, data: { cleanerIdNumber: idNumber } });
        markResolvedLocal(key);
        setOffline(true);
        removeFromList();
      }
    }
  };

  const handleResolveAll = async () => {
    for (const inc of [...incidents]) await handleResolve(inc);
  };

  // ── Admin: load building structure ────────────────────────────────────────
  const loadStructure = async () => {
    try {
      const { data: org } = await api.get('/auth/default-org');
      const { data } = await api.get(`/buildings/public-structure/${org.orgId}`);
      setBuildings(data);
      if (data?.length === 1) { setSelBuilding(data[0]); setStep('admin_floor'); }
      else setStep('admin_building');
    } catch (e: any) {
      setError(isNetworkError(e) ? 'אין חיבור לאינטרנט — הגדרת שירותים דורשת חיבור' : 'שגיאה בטעינת המבנה');
    }
  };

  // ── Admin: reassign device ────────────────────────────────────────────────
  const handleReassign = async (restroom: any) => {
    if (!deviceCode) return;
    setLoading(true);
    try {
      await api.patch(`/auth/kiosk/${deviceCode}/restroom`, { restroomId: restroom.id });
      setStep('admin_done');
      setTimeout(() => {
        if (onReassigned) onReassigned(restroom.id);
        else onBack();
      }, 2000);
    } catch (e: any) {
      setError(isNetworkError(e) ? 'אין חיבור לאינטרנט — נסה שוב כשהחיבור יחזור' : 'שגיאה בהגדרת השירותים');
    } finally {
      setLoading(false);
    }
  };

  const handleNumpad = (key: string) => {
    resetCountdown();
    if (key === '←') setIdNumber(v => v.slice(0, -1));
    else if (key === '✓') handleLogin();
    else if (idNumber.length < 20) setIdNumber(v => v + key);
  };

  const genderIcon  = (g: string) => g === 'MALE' ? '🚹' : g === 'FEMALE' ? '🚺' : '🚻';
  const genderLabel = (g: string) => g === 'MALE' ? 'גברים' : g === 'FEMALE' ? 'נשים' : 'משותף';

  const goBack = () => {
    resetCountdown();
    const adminSteps: Step[] = ['admin_action', 'admin_building', 'admin_floor', 'admin_restroom'];
    if (adminSteps.includes(step)) { setStep('login'); setIdNumber(''); setError(''); return; }
    if (step === 'action' || step === 'arrived' || step === 'checkout_done') { setStep('login'); setIdNumber(''); setError(''); return; }
    onBack();
  };

  return (
    <div className="flex flex-col overflow-hidden"
      style={{ height: '100dvh', minHeight: '-webkit-fill-available', background: 'radial-gradient(ellipse 120% 60% at 50% 0%, #0a1628 0%, #060a12 100%)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3">
        <button onClick={goBack}
          className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
          <ArrowRight size={15} />
          {step === 'tasks' ? 'חזרה לאפשרויות' : 'חזרה'}
        </button>
        <div className="text-sm font-semibold" style={{ color: isAdmin ? '#f59e0b' : 'var(--color-accent)' }}>
          {isAdmin ? '⚙️ כניסת מנהל' : '🧹 כניסת צוות'}
        </div>
        <div className="text-xs px-2.5 py-1 rounded-full tabular-nums"
          style={{
            background: countdown <= 5 ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)',
            color: countdown <= 5 ? '#f87171' : 'rgba(255,255,255,0.35)',
            border: `1px solid ${countdown <= 5 ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.1)'}`,
          }}>
          {countdown}s
        </div>
      </div>

      {/* Offline banner — staff can keep working; everything syncs on reconnect */}
      {offline && (
        <div className="mx-5 mb-2 px-3 py-2 rounded-xl text-center text-xs"
          style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.35)', color: '#fbbf24' }}>
          📴 אין חיבור לאינטרנט — הפעולות נשמרות ויסונכרנו אוטומטית כשהחיבור יחזור
        </div>
      )}

      {/* ── LOGIN ── */}
      {step === 'login' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
          <h2 className="text-2xl font-bold text-white text-center">הכנס תעודת זהות</h2>
          <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
            עובד או מנהל מערכת
          </p>

          <div className="w-full py-4 rounded-2xl text-center text-3xl font-mono"
            style={{ background: 'rgba(0,0,0,0.4)', border: '1.5px solid rgba(0,229,204,0.4)', color: '#00e5cc', letterSpacing: '0.25em', minHeight: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

      {/* ── CLEANER: action choice ── */}
      {step === 'action' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
          <div className="text-center mb-2">
            <div className="text-4xl mb-2">👋</div>
            <h2 className="text-2xl font-bold text-white">שלום{cleaner?.name ? ` ${cleaner.name}` : ''}!</h2>
            <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.5)' }}>בחר פעולה</p>
          </div>

          {/* Check-in / check-out are mutually exclusive: a worker who hasn't
              checked in today sees only "הגעתי לעבודה"; once on shift, only
              "סיום משמרת" (server reports the state via verify-cleaner). */}
          {!checkedIn && (
            <button onClick={handleArrived} disabled={loading}
              className="w-full max-w-sm py-6 rounded-2xl flex flex-col items-center gap-2 transition-all active:scale-95"
              style={{ background: 'rgba(0,229,204,0.1)', border: '1.5px solid rgba(0,229,204,0.5)', boxShadow: '0 0 20px rgba(0,229,204,0.15)' }}>
              <span className="text-4xl">📍</span>
              <span className="text-lg font-bold" style={{ color: '#00e5cc' }}>הגעתי לעבודה</span>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>דיווח כניסה למשמרת</span>
            </button>
          )}

          <button onClick={() => setStep('tasks')} disabled={loading}
            className="w-full max-w-sm py-6 rounded-2xl flex flex-col items-center gap-2 transition-all active:scale-95"
            style={{ background: 'rgba(34,197,94,0.1)', border: '1.5px solid rgba(34,197,94,0.4)', boxShadow: '0 0 20px rgba(34,197,94,0.1)' }}>
            <span className="text-4xl">✅</span>
            <span className="text-lg font-bold" style={{ color: '#22c55e' }}>ניקיתי / טיפלתי</span>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {incidents.length > 0 ? `${incidents.length} בקשות פתוחות` : 'אין בקשות פתוחות כרגע'}
            </span>
          </button>

          {checkedIn && (
            <button onClick={handleCheckout} disabled={loading}
              className="w-full max-w-sm py-6 rounded-2xl flex flex-col items-center gap-2 transition-all active:scale-95"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1.5px solid rgba(239,68,68,0.35)', boxShadow: '0 0 20px rgba(239,68,68,0.08)' }}>
              <span className="text-4xl">🏁</span>
              <span className="text-lg font-bold" style={{ color: '#ef4444' }}>סיום משמרת</span>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>דיווח יציאה מעבודה</span>
            </button>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
      )}

      {/* ── CLEANER: arrived confirmation ── */}
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
              {incidents.length > 0 ? `ישנן ${incidents.length} בקשות פתוחות בחדר זה` : 'אין בקשות פתוחות בחדר זה'}
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

      {/* ── CLEANER: checkout confirmation ── */}
      {step === 'checkout_done' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
          <div className="text-6xl animate-bounce">🏁</div>
          <h2 className="text-2xl font-bold text-white text-center">
            {cleaner?.name ? `${cleaner.name} — ` : ''}יציאה נרשמה!
          </h2>
          <p className="text-sm text-center" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <button onClick={onBack}
            className="w-full max-w-xs py-3 rounded-2xl text-sm mt-4"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
            חזרה לקיוסק
          </button>
        </div>
      )}

      {/* ── CLEANER: tasks ── */}
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
              <button onClick={() => handleResolve(inc)}
                className="px-4 py-2 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.4)' }}>
                ✓ טיפלתי
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── ADMIN: action choice ── */}
      {step === 'admin_action' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-5">
          <div className="text-center mb-2">
            <div className="text-4xl mb-2">👑</div>
            <h2 className="text-2xl font-bold text-white">שלום, {cleaner?.name}</h2>
            <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>כניסת מנהל מערכת</p>
          </div>

          {/* Radar presence-sensor status for this tablet's restroom. Moved here
              from the public kiosk, where the badge overlapped the team button. */}
          {sensor?.present && (
            <div
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${sensor.online ? 'rgba(74,222,128,0.35)' : 'rgba(248,113,113,0.35)'}`,
                color: sensor.online ? '#4ade80' : '#f87171',
              }}>
              <span
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: sensor.online ? '#4ade80' : '#f87171',
                  boxShadow: sensor.online ? '0 0 8px rgba(74,222,128,0.8)' : 'none',
                }}
              />
              📡 {sensor.online ? 'חיישן פעיל' : 'חיישן מנותק'}
            </div>
          )}

          {deviceCode && (
            <button
              onClick={() => { loadStructure(); }}
              className="w-full max-w-sm py-6 rounded-2xl flex flex-col items-center gap-2 transition-all active:scale-95"
              style={{ background: 'rgba(245,158,11,0.1)', border: '1.5px solid rgba(245,158,11,0.5)', boxShadow: '0 0 20px rgba(245,158,11,0.1)' }}>
              <Settings size={36} style={{ color: '#f59e0b' }} />
              <span className="text-lg font-bold" style={{ color: '#f59e0b' }}>הגדר שירותים לטאבלט</span>
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>שנה לאיזה שירותים שייך הטאבלט הזה</span>
            </button>
          )}

          <button onClick={onBack}
            className="w-full max-w-sm py-4 rounded-2xl text-sm font-medium"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }}>
            חזרה לקיוסק
          </button>
        </div>
      )}

      {/* ── ADMIN: building selector ── */}
      {step === 'admin_building' && (
        <div className="flex-1 flex flex-col items-center px-6 pt-6 gap-4 overflow-y-auto">
          <div className="text-center mb-2 w-full">
            <p className="text-sm" style={{ color: '#f59e0b' }}>הגדרת שירותים — בחר בניין</p>
          </div>
          <div className="flex flex-col gap-3 w-full max-w-md">
            {buildings.map(b => (
              <button key={b.id} onClick={() => { setSelBuilding(b); setStep('admin_floor'); }}
                className="w-full py-5 px-5 rounded-2xl text-white font-semibold text-lg text-start transition-all active:scale-95"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
                🏢 {b.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── ADMIN: floor selector ── */}
      {step === 'admin_floor' && selBuilding && (
        <div className="flex-1 flex flex-col items-center px-6 pt-6 gap-4 overflow-y-auto">
          <div className="text-center mb-2 w-full">
            <p className="text-sm" style={{ color: '#f59e0b' }}>{selBuilding.name} — בחר קומה</p>
          </div>
          <button onClick={() => setStep('admin_building')} className="self-start text-sm mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>← חזרה</button>
          <div className="flex flex-col gap-3 w-full max-w-md">
            {selBuilding.floors.map((f: any) => (
              <button key={f.id} onClick={() => { setSelFloor(f); setStep('admin_restroom'); }}
                className="w-full py-5 px-5 rounded-2xl text-white font-semibold text-lg text-start transition-all active:scale-95"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
                🏬 {f.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── ADMIN: restroom selector ── */}
      {step === 'admin_restroom' && selFloor && (
        <div className="flex-1 flex flex-col items-center px-6 pt-6 gap-4 overflow-y-auto">
          <div className="text-center mb-2 w-full">
            <p className="text-sm" style={{ color: '#f59e0b' }}>{selBuilding?.name} › {selFloor.name} — בחר שירותים</p>
          </div>
          <button onClick={() => setStep('admin_floor')} className="self-start text-sm mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>← חזרה</button>
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <div className="flex flex-col gap-3 w-full max-w-md">
            {selFloor.restrooms.map((r: any) => (
              <button key={r.id} onClick={() => handleReassign(r)} disabled={loading}
                className="w-full py-6 px-5 rounded-2xl text-white font-semibold text-xl text-center transition-all active:scale-95"
                style={{
                  background: r.id === restroomId ? 'rgba(0,229,204,0.15)' : 'rgba(245,158,11,0.08)',
                  border: `1.5px solid ${r.id === restroomId ? 'rgba(0,229,204,0.5)' : 'rgba(245,158,11,0.4)'}`,
                }}>
                {genderIcon(r.gender)} {r.name} — {genderLabel(r.gender)}
                {r.id === restroomId && <span className="block text-xs mt-1" style={{ color: 'var(--color-accent)' }}>← מוגדר כרגע</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── ADMIN: done ── */}
      {step === 'admin_done' && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
          <div className="text-6xl animate-bounce">✅</div>
          <h2 className="text-2xl font-bold text-white text-center">השירותים עודכנו!</h2>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>הקיוסק מתרענן...</p>
        </div>
      )}
    </div>
  );
}
