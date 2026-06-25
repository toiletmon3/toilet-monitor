/**
 * KioskPageNeonImage — "image background" template.
 *
 * Instead of recreating the buttons in CSS/SVG (like the `neon` / `neon-pro`
 * templates), this template uses the designer's exact PNG mockup as a
 * full-screen background and overlays transparent, click-through-disabled
 * hotspot buttons exactly on top of each tile. The hotspots are positioned in
 * percentages of the image itself (inside an aspect-ratio-locked wrapper), so
 * they track the artwork precisely on any screen size — no drift, no
 * letterbox misalignment.
 *
 * This template is intentionally report-only: the ONLY interactive elements are
 * the issue-report hotspots. There is deliberately no team/cleaner-mode entry
 * and no language switcher — taps can only create reports.
 *
 * The background file lives in `apps/web/public/kiosk-templates/` so a missing
 * file never breaks the build; drop the PNG there to activate the look.
 *
 * Tip: append `?hotspots=1` to the kiosk URL to draw outlines over every
 * hotspot, which makes fine-tuning the coordinates below trivial.
 */
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../../../lib/api';
import { queueIncident, syncPending, getPendingCount } from '../../../../lib/offline';
import { joinRestroom, sendHeartbeat } from '../../../../lib/socket';
import KioskConfirmation from '../../components/KioskConfirmation';

/** Background artwork served from /public. Drop the PNG here to activate. */
const BG_URL = '/kiosk-templates/neon-image-bg.png';

/** The artwork's native aspect ratio (width / height). Locking the wrapper to
 *  the real pixel dimensions keeps the % hotspots glued to the artwork with no
 *  letterbox drift. */
const IMG_W = 937;
const IMG_H = 1679;

/** Default positions of the live overlay elements, as % of the stage. `right` =
 *  distance of the element's right edge from the physical right edge. Open the
 *  kiosk with ?edit=1 to nudge these on-screen and read off the final values. */
const NUM_POS = {
  usersNum:   { top: 9.5,  right: 16 },
  periodWord: { top: 9.5,  right: 58 },
  minutesNum: { top: 13.0, right: 16 },
};

const NUM_STYLE = {
  position: 'absolute', color: '#eafffb', fontWeight: 700, fontSize: 'clamp(0.95rem, 2.6vh, 1.6rem)',
  textShadow: '0 0 12px rgba(124,246,232,0.55)', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 2,
} as const;

const EBTN = {
  background: '#0b2b2b', color: '#7CF6E8', border: '1px solid #1a5', borderRadius: 4,
  width: 24, height: 24, fontSize: 14, cursor: 'pointer', lineHeight: 1,
} as const;

type ConnectionStatus = 'online' | 'offline' | 'syncing';

/**
 * Hotspot rectangles, measured as percentages of the 1080×1920 artwork.
 * `code` maps to the same issue-type codes the other templates use, so each
 * tap creates exactly the same incident. Tweak these with `?hotspots=1`.
 */
const HOTSPOTS: { code: string; left: number; top: number; width: number; height: number }[] = [
  // Big "positive feedback" button across the top.
  { code: 'positive_feedback', left: 8.8, top: 22.9, width: 82.4, height: 13.0 },
  // Grid — row 1
  { code: 'toilet_paper',     left: 8.8,  top: 38.0, width: 38.4, height: 17.7 },
  { code: 'floor_cleaning',   left: 52.8, top: 38.0, width: 38.4, height: 17.7 },
  // Grid — row 2
  { code: 'trash_empty',      left: 8.8,  top: 58.1, width: 38.4, height: 17.7 },
  { code: 'toilet_cleaning',  left: 52.8, top: 58.1, width: 38.4, height: 17.7 },
  // Grid — row 3
  { code: 'fault_report',     left: 8.8,  top: 78.1, width: 38.4, height: 17.7 },
  { code: 'soap_refill',      left: 52.8, top: 78.1, width: 38.4, height: 17.7 },
];

export default function KioskPageNeonImage() {
  const { deviceCode } = useParams<{ deviceCode: string }>();
  const { i18n } = useTranslation();
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [issueTypes, setIssueTypes] = useState<any[]>([]);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState(false);
  const [, setConnectionStatus] = useState<ConnectionStatus>('online');
  const [pendingCount, setPendingCount] = useState(0);
  const [stats, setStats] = useState<{ weeklyReports: number; dailyReports: number; avgResponseMinutes: number | null } | null>(null);
  const [statsView, setStatsView] = useState<'week' | 'today'>('week');
  const [pos, setPos] = useState(NUM_POS);
  const lang = i18n.language as 'he' | 'en';
  const qp = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const showHotspots = qp.has('hotspots');
  const editing = qp.has('edit');

  useEffect(() => {
    async function init() {
      try {
        const { data: device } = await api.get(`/auth/kiosk/${deviceCode}`);
        setDeviceInfo(device);
        const orgId = device.restroom.floor.building.orgId;
        const { data: types } = await api.get(`/buildings/issue-types/${orgId}`);
        setIssueTypes(types);
        const buildingId = device.restroom.floor.building.id;
        api.get(`/analytics/kiosk-stats/building/${buildingId}`).then(r => setStats(r.data)).catch(() => {});
        api.get('/auth/default-org').then(r => {
          if (r.data?.kioskLang) import('../../../../i18n').then(m => m.setLanguage(r.data.kioskLang));
        }).catch(() => {});
        joinRestroom(device.restroom.id);
        const heartbeatInterval = setInterval(() => {
          api.patch(`/buildings/devices/${deviceCode}/heartbeat`).catch(() => {});
          sendHeartbeat(device.id, device.restroom.id);
        }, 60_000);
        return () => clearInterval(heartbeatInterval);
      } catch {
        setConnectionStatus('offline');
      }
    }
    init();
  }, [deviceCode]);

  useEffect(() => {
    const handleOnline = async () => {
      setConnectionStatus('syncing');
      const count = await getPendingCount();
      if (count > 0 && deviceInfo) await syncPending(deviceInfo.id);
      setConnectionStatus('online');
      setPendingCount(0);
    };
    const handleOffline = () => setConnectionStatus('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [deviceInfo]);

  useEffect(() => {
    let wakeLock: WakeLockSentinel | null = null;
    const requestWakeLock = async () => {
      try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch {}
    };
    requestWakeLock();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    });
    return () => { wakeLock?.release(); };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => window.location.reload(), 6 * 60 * 60 * 1000);
    return () => clearTimeout(timer);
  }, []);

  // Alternate the top stat between "this week" and "today" every 10s.
  useEffect(() => {
    const id = setInterval(() => setStatsView(v => (v === 'week' ? 'today' : 'week')), 10_000);
    return () => clearInterval(id);
  }, []);

  const nudge = (k: keyof typeof NUM_POS, dTop: number, dRight: number) =>
    setPos(p => ({ ...p, [k]: { top: +(p[k].top + dTop).toFixed(1), right: +(p[k].right + dRight).toFixed(1) } }));

  const handleIssuePress = useCallback(async (issueCode: string) => {
    if (!deviceInfo) return;
    const issueType = issueTypes.find((it) => it.code === issueCode);
    if (!issueType) return;
    const reportedAt = new Date().toISOString();
    if (navigator.onLine) {
      try {
        const { v4: uuidv4 } = await import('uuid');
        await api.post('/incidents', {
          restroomId: deviceInfo.restroom.id,
          issueTypeId: issueType.id,
          deviceId: deviceInfo.id,
          reportedAt,
          clientId: uuidv4(),
        });
      } catch (err: any) {
        if (err.response?.status === 409) {
          setDuplicate(true);
          setTimeout(() => setDuplicate(false), 5000);
          return;
        }
        await queueIncident({ restroomId: deviceInfo.restroom.id, issueTypeId: issueType.id, deviceId: deviceInfo.id, reportedAt });
        const count = await getPendingCount();
        setPendingCount(count);
      }
    } else {
      await queueIncident({ restroomId: deviceInfo.restroom.id, issueTypeId: issueType.id, deviceId: deviceInfo.id, reportedAt });
      const count = await getPendingCount();
      setPendingCount(count);
    }
    setStats(s => (s ? { ...s, weeklyReports: s.weeklyReports + 1, dailyReports: s.dailyReports + 1 } : s));
    setConfirmed(issueCode);
    setTimeout(() => setConfirmed(null), 5000);
  }, [deviceInfo, issueTypes]);

  if (duplicate) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-6 text-center px-8" style={{ background: '#040b0e' }}>
        <div className="text-7xl">⏳</div>
        <div>
          <div className="text-2xl font-bold text-white mb-2">{lang === 'he' ? 'כבר בטיפול' : 'Already Reported'}</div>
          <div className="text-base" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {lang === 'he' ? 'הדיווח הזה נשלח לאחרונה — צוות הניקוי כבר בדרך' : 'This was recently reported — our team is on the way'}
          </div>
        </div>
      </div>
    );
  }

  if (confirmed) return <KioskConfirmation issueCode={confirmed} onReturn={() => setConfirmed(null)} />;

  return (
    <div
      className="flex items-center justify-center overflow-hidden"
      style={{ height: '100dvh', minHeight: '-webkit-fill-available', background: '#000' }}
      dir="rtl"
    >
      {/* Aspect-ratio-locked stage holding the artwork + hotspots. Letterboxing
          (if the screen ratio differs from the art) happens around this box, so
          the hotspots stay glued to the image. */}
      <div
        style={{
          position: 'relative',
          aspectRatio: `${IMG_W} / ${IMG_H}`,
          height: '100%',
          maxWidth: '100%',
          backgroundImage: `url(${BG_URL})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* The real, clickable button hotspots — one per tile in the artwork. */}
        {HOTSPOTS.map(h => (
          <button
            key={h.code}
            type="button"
            aria-label={h.code}
            onPointerDown={() => handleIssuePress(h.code)}
            style={{
              position: 'absolute',
              left: `${h.left}%`,
              top: `${h.top}%`,
              width: `${h.width}%`,
              height: `${h.height}%`,
              borderRadius: 22,
              background: showHotspots ? 'rgba(124,246,232,0.18)' : 'transparent',
              border: showHotspots ? '2px dashed #7CF6E8' : 'none',
              WebkitTapHighlightColor: 'transparent',
              cursor: 'pointer',
            }}
          >
            {showHotspots && (
              <span style={{ color: '#7CF6E8', fontSize: 12 }}>{h.code}</span>
            )}
          </button>
        ))}

        {/* Live values dropped into the artwork's blank slots. The fixed words
            ("משתמשים" / "דקות …") are part of the image — we only add the number
            and the alternating period word ("שבוע"/"יום"). */}
        {stats && (
          <>
            <span style={{ ...NUM_STYLE, top: `${pos.usersNum.top}%`, right: `${pos.usersNum.right}%` }}>
              {statsView === 'week' ? stats.weeklyReports : stats.dailyReports}
            </span>
            <span style={{ ...NUM_STYLE, top: `${pos.periodWord.top}%`, right: `${pos.periodWord.right}%` }}>
              {statsView === 'week' ? 'שבוע' : 'יום'}
            </span>
            <span style={{ ...NUM_STYLE, top: `${pos.minutesNum.top}%`, right: `${pos.minutesNum.right}%` }}>
              {stats.avgResponseMinutes ?? 0}
            </span>
          </>
        )}

        {/* On-screen position editor — open the kiosk with ?edit=1. Nudge each
            element, then send me the printed top/right values. */}
        {editing && (
          <div style={{
            position: 'fixed', bottom: 6, left: 6, zIndex: 9999, direction: 'ltr',
            background: 'rgba(0,0,0,0.9)', color: '#7CF6E8', padding: '8px 10px', borderRadius: 8,
            fontSize: 12, fontFamily: 'monospace', lineHeight: 1.7, pointerEvents: 'auto',
          }}>
            {(Object.keys(pos) as (keyof typeof NUM_POS)[]).map(k => (
              <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 90, display: 'inline-block' }}>{k}</span>
                <button onClick={() => nudge(k, -0.5, 0)} style={EBTN}>↑</button>
                <button onClick={() => nudge(k, 0.5, 0)} style={EBTN}>↓</button>
                <button onClick={() => nudge(k, 0, 0.5)} style={EBTN}>←</button>
                <button onClick={() => nudge(k, 0, -0.5)} style={EBTN}>→</button>
                <span style={{ width: 150, display: 'inline-block', marginInlineStart: 6 }}>top:{pos[k].top} right:{pos[k].right}</span>
              </div>
            ))}
            <div style={{ marginTop: 6, opacity: 0.75 }}>↑ send me these 3 lines</div>
          </div>
        )}

        {pendingCount > 0 && (
          <div style={{ position: 'absolute', bottom: '1%', insetInlineStart: '2%', fontSize: 12, color: 'rgba(255,200,0,0.8)' }}>
            ⏳ {pendingCount}
          </div>
        )}
      </div>
    </div>
  );
}
