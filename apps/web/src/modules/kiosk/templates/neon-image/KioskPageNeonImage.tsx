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
 * All behaviour (incident creation, offline queue, confirmation, cleaner mode,
 * corner-tap team access, wake-lock, periodic reload) is identical to the other
 * kiosk templates — only the visual shell is the image.
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
import { setLanguage } from '../../../../i18n';
import api from '../../../../lib/api';
import { queueIncident, syncPending, getPendingCount } from '../../../../lib/offline';
import { joinRestroom, sendHeartbeat } from '../../../../lib/socket';
import KioskConfirmation from '../../components/KioskConfirmation';
import CleanerCheckIn from '../../components/CleanerCheckIn';

/** Background artwork served from /public. Drop the PNG here to activate. */
const BG_URL = '/kiosk-templates/neon-image-bg.png';

/** The artwork's native aspect ratio (width / height). 1080×1920 = 9:16. */
const IMG_W = 1080;
const IMG_H = 1920;

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
  const [showCleanerMode, setShowCleanerMode] = useState(false);
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
    setConfirmed(issueCode);
    setTimeout(() => setConfirmed(null), 5000);
  }, [deviceInfo, issueTypes]);

  const handleCornerTap = useCallback(() => setShowCleanerMode(true), []);

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

  if (showCleanerMode && deviceInfo) {
    return (
      <CleanerCheckIn
        restroomId={deviceInfo.restroom.id}
        deviceCode={deviceCode}
        onBack={() => setShowCleanerMode(false)}
        onReassigned={() => window.location.reload()}
      />
    );
  }

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
        {/* Invisible corner-tap hotspot (top-start) → cleaner/team mode. */}
        <button
          type="button"
          aria-label="team"
          onPointerDown={handleCornerTap}
          onClick={handleCornerTap}
          style={{
            position: 'absolute', top: 0, insetInlineStart: 0, width: '16%', height: '7%',
            background: showHotspots ? 'rgba(255,0,0,0.15)' : 'transparent',
            border: showHotspots ? '1px dashed red' : 'none',
            WebkitTapHighlightColor: 'transparent', cursor: 'pointer',
          }}
        />

        {/* Discreet language toggle, top-end, so it doesn't cover the artwork. */}
        <div style={{ position: 'absolute', top: '1.2%', insetInlineEnd: '2%', display: 'flex', gap: 4, zIndex: 3 }}>
          {(['he', 'en'] as const).map(code => (
            <button
              key={code}
              onClick={() => setLanguage(code)}
              style={{
                fontSize: 'clamp(0.7rem, 1.6vh, 1rem)', padding: '2px 8px', borderRadius: 8,
                background: lang === code ? 'rgba(124,246,232,0.18)' : 'rgba(0,0,0,0.35)',
                color: lang === code ? '#7CF6E8' : 'rgba(255,255,255,0.55)',
                border: `1px solid ${lang === code ? 'rgba(124,246,232,0.5)' : 'rgba(255,255,255,0.12)'}`,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              {code === 'he' ? 'עב' : 'EN'}
            </button>
          ))}
        </div>

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

        {pendingCount > 0 && (
          <div style={{ position: 'absolute', bottom: '1%', insetInlineStart: '2%', fontSize: 12, color: 'rgba(255,200,0,0.8)' }}>
            ⏳ {pendingCount}
          </div>
        )}
      </div>
    </div>
  );
}
