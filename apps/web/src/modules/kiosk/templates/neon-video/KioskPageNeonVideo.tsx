/**
 * KioskPageNeonVideo — "video background" template, bilingual edition.
 *
 * Same approach as `neon-image`, but the background is a short MP4 that plays
 * in an infinite loop (muted + autoplay + playsinline, so Android/iOS kiosk
 * browsers start it without a user gesture). The video *is* the design —
 * transparent hotspot buttons are overlaid exactly on top of each animated
 * tile, positioned in percentages of the video itself inside an
 * aspect-ratio-locked wrapper, so they track the artwork on any screen size.
 *
 * There are TWO videos — Hebrew and English — and a language toggle (the same
 * discreet עב/EN pills the image template once had) that swaps the video AND
 * the i18n language together. Both videos are mounted and preloaded so the
 * switch is instant; only the visible one plays.
 *
 * The new artwork ships with the stat text removed — only the ✦ and 🕐 icons
 * are baked in. The complete sentences ("{n} משתמשים השבוע", "{m} דקות · זמן
 * תגובה ממוצע") are rendered here as whole overlay lines next to the icons, so
 * numbers never need pixel-aligning to baked-in words. Per-language positions
 * are admin-tunable ("מיקום הנתונים על התבנית").
 *
 * Interactive elements: the issue-report hotspots, the language toggle, and
 * the "🧹 צוות" team button (top corner) that opens the same CleanerCheckIn
 * screen as the classic template.
 *
 * The video files live in `apps/web/public/kiosk-templates/` so a missing file
 * never breaks the build; drop the MP4s there to activate the look.
 *
 * Tip: append `?hotspots=1` to the kiosk URL to draw outlines over every
 * hotspot, which makes fine-tuning the coordinates below trivial.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { setLanguage } from '../../../../i18n';
import api from '../../../../lib/api';
import { queueIncident, syncPending, getPendingCount } from '../../../../lib/offline';
import { joinRestroom, sendHeartbeat } from '../../../../lib/socket';
import KioskConfirmation from '../../components/KioskConfirmation';
import CleanerCheckIn from '../../components/CleanerCheckIn';

/** Background videos served from /public — one per language. The ?v= suffix is
 *  a cache-buster: nginx serves static assets as immutable for 1y, so bump it
 *  whenever a file changes to force every kiosk to fetch the new video. */
const VIDEO_URLS: Record<'he' | 'en', string> = {
  he: '/kiosk-templates/neon-video-he.mp4?v=1',
  en: '/kiosk-templates/neon-video-en.mp4?v=1',
};

/** Tap sound played on every report press. Preloaded and decoded into a Web
 *  Audio buffer on mount so playback is instant inside the tap gesture (no
 *  network / decode latency and no autoplay-policy issues). */
const TAP_SOUND_URL = '/kiosk-templates/tap-sound.mp3?v=1';

/** The videos' native aspect ratio (width / height). Locking the wrapper to
 *  the real pixel dimensions keeps the % hotspots glued to the artwork with no
 *  letterbox drift. */
const VID_W = 576;
const VID_H = 1024;

/** Default positions of the two overlay stat lines, as % of the stage, per
 *  language. Hebrew lines sit to the LEFT of the icons baked at the video's
 *  top-right, so they anchor from the right edge; English lines sit to the
 *  RIGHT of the icons at the top-left, so they anchor from the left. Each line
 *  is vertically centered on its icon via translateY(-50%), so `top` is the
 *  icon's center line. Admin-tunable per template ("מיקום הנתונים על התבנית"). */
const LINE_POS = {
  heUsers:    { top: 11.7, right: 24.5 },
  heResponse: { top: 16.6, right: 24.5 },
  enUsers:    { top: 11.7, left: 24.5 },
  enResponse: { top: 16.6, left: 24.5 },
};
const DEFAULT_FONT_SCALE = 1.3;

// Same visual spec as neon-image: overlay text scales with the artwork height
// (cqh) so it stays glued to the video's own typography on any screen.
const FONT_CQH = 2.62;

const LINE_STYLE = {
  position: 'absolute', color: '#eafffb', fontFamily: "'Heebo', sans-serif", fontWeight: 400,
  textShadow: '0 0 12px rgba(124,246,232,0.55)', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 2,
  transform: 'translateY(-50%)',
} as const;

type ConnectionStatus = 'online' | 'offline' | 'syncing';

/**
 * Hotspot rectangles, measured as percentages of the 576×1024 video frame.
 * `code` maps to the same issue-type codes the other templates use, so each
 * tap creates exactly the same incident. The tile layout is identical in both
 * language videos, so one set of hotspots serves both. Tweak with `?hotspots=1`.
 */
const HOTSPOTS: { code: string; left: number; top: number; width: number; height: number }[] = [
  // Big "positive feedback" button across the top.
  { code: 'positive_feedback', left: 8.0, top: 22.2, width: 83.5, height: 13.6 },
  // Grid — row 1
  { code: 'toilet_paper',     left: 8.0,  top: 36.4, width: 41.1, height: 18.2 },
  { code: 'floor_cleaning',   left: 50.3, top: 36.4, width: 41.4, height: 18.2 },
  // Grid — row 2
  { code: 'trash_empty',      left: 8.0,  top: 55.1, width: 41.1, height: 18.1 },
  { code: 'toilet_cleaning',  left: 50.3, top: 55.1, width: 41.4, height: 18.1 },
  // Grid — row 3
  { code: 'fault_report',     left: 8.0,  top: 73.8, width: 41.1, height: 19.6 },
  { code: 'soap_refill',      left: 50.3, top: 73.8, width: 41.4, height: 19.6 },
];

/** Optional `?lang=he|en` URL param: pins the kiosk to one language — the org
 *  default is not applied and the idle auto-revert is disabled. Used when
 *  dialing in the English overlay positions from the admin (each nudge reloads
 *  the kiosk, which would otherwise snap it back to the org language), or to
 *  hard-assign a language to a specific device. */
function getPinnedLang(): 'he' | 'en' | null {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('lang');
  return v === 'he' || v === 'en' ? v : null;
}

/** How long the kiosk stays in a visitor-chosen language with nobody touching
 *  the screen before flipping back to the default. */
const LANG_IDLE_REVERT_MS = 3 * 60 * 1000;

export default function KioskPageNeonVideo() {
  const { deviceCode } = useParams<{ deviceCode: string }>();
  const { t, i18n } = useTranslation();
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [issueTypes, setIssueTypes] = useState<any[]>([]);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const [, setConnectionStatus] = useState<ConnectionStatus>('online');
  const [pendingCount, setPendingCount] = useState(0);
  const [stats, setStats] = useState<{ weeklyReports: number; dailyReports: number; avgResponseMinutes: number | null } | null>(null);
  const [statsView, setStatsView] = useState<'week' | 'today'>('week');
  const [layout, setLayout] = useState<any>(null);
  const [showCleanerMode, setShowCleanerMode] = useState(false);
  const audioRef = useRef<{ ctx: AudioContext; buffer: AudioBuffer | null } | null>(null);
  const heVideoRef = useRef<HTMLVideoElement>(null);
  const enVideoRef = useRef<HTMLVideoElement>(null);
  const showHotspots = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('hotspots');
  const pinnedLang = getPinnedLang();
  const lang = pinnedLang ?? ((i18n.language?.startsWith('en') ? 'en' : 'he') as 'he' | 'en');
  const videoRefs = { he: heVideoRef, en: enVideoRef };
  // The language visitors are reverted to when the kiosk sits idle: the org's
  // kioskLang once it arrives, Hebrew until then.
  const defaultLangRef = useRef<'he' | 'en'>('he');
  // Set the moment a visitor taps the עב/EN pills — from then on the (possibly
  // slow) org-default response must not clobber their choice.
  const userTouchedLangRef = useRef(false);

  // Effective overlay positions + font scale, configured per template in the admin.
  const L = { ...LINE_POS, ...(layout || {}) } as typeof LINE_POS;
  const fontScale: number = layout?.fontScale ?? DEFAULT_FONT_SCALE;
  const lineStyle = {
    ...LINE_STYLE,
    fontSize: `${(FONT_CQH * fontScale).toFixed(3)}cqh`,
  };

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
        api.get(`/buildings/kiosk-config/${deviceCode}`).then(r => setLayout(r.data?.statsLayout ?? null)).catch(() => {});
        api.get('/auth/default-org').then(r => {
          const orgLang = r.data?.kioskLang;
          if (orgLang !== 'he' && orgLang !== 'en') return;
          defaultLangRef.current = orgLang;
          // Apply the org default only if nobody picked a language on the
          // toggle meanwhile (this response can land seconds after boot on a
          // slow network) and the URL doesn't pin one.
          if (!userTouchedLangRef.current && !getPinnedLang()) setLanguage(orgLang);
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

  // A visitor's language choice must not outlive their visit: after a few
  // minutes with nobody touching the screen, snap back to the default language
  // so the next person finds the kiosk as configured. (?lang pin disables it.)
  useEffect(() => {
    if (pinnedLang) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        userTouchedLangRef.current = false;
        setLanguage(defaultLangRef.current);
      }, LANG_IDLE_REVERT_MS);
    };
    arm();
    window.addEventListener('pointerdown', arm);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('pointerdown', arm);
    };
  }, [pinnedLang]);

  // Play only the visible video; pause the hidden one. Both stay mounted and
  // preloaded so toggling languages swaps instantly with no black flash.
  useEffect(() => {
    const active = lang === 'he' ? heVideoRef.current : enVideoRef.current;
    const hidden = lang === 'he' ? enVideoRef.current : heVideoRef.current;
    active?.play().catch(() => {});
    hidden?.pause();
  }, [lang]);

  // Preload + decode the tap sound once; play instances from the buffer.
  useEffect(() => {
    const ctx = new AudioContext();
    audioRef.current = { ctx, buffer: null };
    fetch(TAP_SOUND_URL)
      .then(r => r.arrayBuffer())
      .then(ab => ctx.decodeAudioData(ab))
      .then(buffer => { if (audioRef.current) audioRef.current.buffer = buffer; })
      .catch(() => {}); // missing/blocked sound must never break the kiosk
    return () => { ctx.close().catch(() => {}); audioRef.current = null; };
  }, []);

  const playTapSound = useCallback(() => {
    const audio = audioRef.current;
    if (!audio?.buffer) return;
    // The context starts suspended until a user gesture — we're inside one.
    if (audio.ctx.state === 'suspended') audio.ctx.resume().catch(() => {});
    const source = audio.ctx.createBufferSource();
    source.buffer = audio.buffer;
    source.connect(audio.ctx.destination);
    source.start();
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
          // Already reported recently — the server keeps a single incident,
          // but the reporter still gets the normal confirmation screen.
          setConfirmed(issueCode);
          setTimeout(() => setConfirmed(null), 5000);
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

  if (confirmed) return <KioskConfirmation issueCode={confirmed} onReturn={() => setConfirmed(null)} scale={layout?.confirmScale ?? 1} />;

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

  // Complete overlay sentences — phrasing lives in the locale files
  // (kiosk.videoStats.*) so wording tweaks never touch this component. Each
  // key has a "...One" variant so a count of 1 reads grammatically.
  const nLine = (key: string, n: number) =>
    n === 1 ? t(`kiosk.videoStats.${key}One`) : t(`kiosk.videoStats.${key}`, { n });
  const usersLine = stats
    ? (statsView === 'week' ? nLine('usersWeek', stats.weeklyReports) : nLine('usersToday', stats.dailyReports))
    : '';
  const responseLine = stats ? nLine('response', stats.avgResponseMinutes ?? 0) : '';

  return (
    <div
      className="flex items-center justify-center overflow-hidden"
      style={{ height: '100dvh', minHeight: '-webkit-fill-available', background: '#000' }}
      dir={lang === 'he' ? 'rtl' : 'ltr'}
    >
      {/* Aspect-ratio-locked stage holding the videos + hotspots. Letterboxing
          (if the screen ratio differs from the video) happens around this box,
          so the hotspots stay glued to the animation. */}
      <div
        style={{
          position: 'relative',
          aspectRatio: `${VID_W} / ${VID_H}`,
          height: '100%',
          maxWidth: '100%',
          containerType: 'size', // lets the overlay font size (cqh) track the video
          background: '#000',
        }}
      >
        {/* The looping background videos — one per language, both mounted and
            preloaded so the toggle is instant. muted + playsInline are required
            for autoplay on Android/iOS kiosk browsers; disablePictureInPicture
            and no controls keep them a pure background layer. */}
        {(['he', 'en'] as const).map(code => (
          <video
            key={code}
            ref={videoRefs[code]}
            src={VIDEO_URLS[code]}
            autoPlay={code === lang}
            muted
            loop
            playsInline
            disablePictureInPicture
            preload="auto"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              pointerEvents: 'none',
              zIndex: 0,
              opacity: code === lang ? 1 : 0,
            }}
          />
        ))}

        {/* The real, clickable button hotspots — one per tile in the video. */}
        {HOTSPOTS.map(h => (
          <button
            key={h.code}
            type="button"
            aria-label={h.code}
            onPointerDown={() => { playTapSound(); handleIssuePress(h.code); }}
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
              zIndex: 1,
            }}
          >
            {showHotspots && (
              <span style={{ color: '#7CF6E8', fontSize: 12 }}>{h.code}</span>
            )}
          </button>
        ))}

        {/* Live stat lines — complete sentences overlaid next to the icons
            baked into the video (✦ users, 🕐 response time). The new artwork
            has no baked text, so the whole line is ours and numbers never need
            aligning to anything. Hebrew anchors right (icons top-right),
            English anchors left (icons top-left). */}
        {stats && (lang === 'he' ? (
          <>
            <span dir="rtl" style={{ ...lineStyle, top: `${L.heUsers.top}%`, right: `${L.heUsers.right}%` }}>
              {usersLine}
            </span>
            <span dir="rtl" style={{ ...lineStyle, top: `${L.heResponse.top}%`, right: `${L.heResponse.right}%` }}>
              {responseLine}
            </span>
          </>
        ) : (
          <>
            <span dir="ltr" style={{ ...lineStyle, top: `${L.enUsers.top}%`, left: `${L.enUsers.left}%` }}>
              {usersLine}
            </span>
            <span dir="ltr" style={{ ...lineStyle, top: `${L.enResponse.top}%`, left: `${L.enResponse.left}%` }}>
              {responseLine}
            </span>
          </>
        ))}

        {pendingCount > 0 && (
          <div style={{ position: 'absolute', bottom: '1%', insetInlineStart: '2%', fontSize: 12, color: 'rgba(255,200,0,0.8)', zIndex: 2 }}>
            ⏳ {pendingCount}
          </div>
        )}

        {/* Team / cleaner-mode entry — pinned above the artwork at the top
            corner. Opens CleanerCheckIn for check-in and resolving. */}
        <button
          type="button"
          onPointerDown={() => setShowCleanerMode(true)}
          className="select-none"
          style={{
            position: 'absolute',
            top: '1%',
            right: '2%',
            zIndex: 3,
            padding: '6px 14px',
            borderRadius: 12,
            background: 'rgba(0,229,204,0.08)',
            color: 'rgba(0,229,204,0.55)',
            border: '1px solid rgba(0,229,204,0.2)',
            fontSize: 12,
            WebkitTapHighlightColor: 'transparent',
            cursor: 'pointer',
          }}>
          🧹 {lang === 'he' ? 'צוות' : 'Staff'}
        </button>

        {/* Language toggle — the discreet עב/EN pills restored from the image
            template. Swaps the video and the i18n language together. */}
        <div style={{ position: 'absolute', top: '1%', left: '2%', display: 'flex', gap: 4, zIndex: 3 }}>
          {(['he', 'en'] as const).map(code => (
            <button
              key={code}
              type="button"
              onPointerDown={() => { userTouchedLangRef.current = true; setLanguage(code); }}
              style={{
                fontSize: 'clamp(0.7rem, 1.6vh, 1rem)', padding: '4px 10px', borderRadius: 8,
                background: lang === code ? 'rgba(124,246,232,0.18)' : 'rgba(0,0,0,0.35)',
                color: lang === code ? '#7CF6E8' : 'rgba(255,255,255,0.55)',
                border: `1px solid ${lang === code ? 'rgba(124,246,232,0.5)' : 'rgba(255,255,255,0.12)'}`,
                WebkitTapHighlightColor: 'transparent',
                cursor: 'pointer',
              }}
            >
              {code === 'he' ? 'עב' : 'EN'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
