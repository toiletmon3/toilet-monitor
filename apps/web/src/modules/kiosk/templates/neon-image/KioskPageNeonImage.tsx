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

/** Where the two live numbers drop into the artwork's blank slots, as % of the
 *  stage. `end` = distance from the right edge (RTL). Nudge these to line the
 *  numbers up with the baked "משתמשים השבוע" / "דקות …" labels. */
const NUM_POS = {
  users:   { top: 8.4, end: 49 },
  minutes: { top: 12.0, end: 51 },
};

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
  const lang = i18n.language as 'he' | 'en';
  const showHotspots = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('hotspots');

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

        {/* Live numbers only — dropped into the artwork's blank slots. The labels
            ("משתמשים השבוע" / "דקות …") are part of the image, so we add no words. */}
        {stats && (
          <>
            <span style={{
              position: 'absolute', top: `${NUM_POS.users.top}%`, insetInlineEnd: `${NUM_POS.users.end}%`,
              color: '#eafffb', fontWeight: 700, fontSize: 'clamp(0.95rem, 2.6vh, 1.6rem)',
              textShadow: '0 0 12px rgba(124,246,232,0.55)', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 2,
            }}>
              {stats.weeklyReports}
            </span>
            <span style={{
              position: 'absolute', top: `${NUM_POS.minutes.top}%`, insetInlineEnd: `${NUM_POS.minutes.end}%`,
              color: '#eafffb', fontWeight: 700, fontSize: 'clamp(0.95rem, 2.6vh, 1.6rem)',
              textShadow: '0 0 12px rgba(124,246,232,0.55)', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 2,
            }}>
              {stats.avgResponseMinutes ?? 0}
            </span>
          </>
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
