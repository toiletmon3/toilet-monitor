import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';
import { getSocket, joinRestroom } from '../../lib/socket';
import { useScrollLock } from '../../lib/useScrollLock';
import KioskPage from './KioskPage';
import KioskPageNeon from './templates/neon/KioskPageNeon';
import KioskPageNeonPro from './templates/neonpro/KioskPageNeonPro';
import KioskPageNeonImage from './templates/neon-image/KioskPageNeonImage';
import KioskPageNeonVideo from './templates/neon-video/KioskPageNeonVideo';
import KioskRemoved from './KioskRemoved';

/**
 * Reads the kiosk template (theme + buttons) assigned to this device and renders
 * the matching kiosk UI. Resolution order on the backend:
 *   device.kioskTemplate → building.kioskTemplate → default
 * Admin configures templates and assigns them per building or per device in
 * "טמפלטים לקיוסק".
 *
 * Listens for `kiosk:config-changed` over Socket.IO so that admin theme
 * changes propagate to the kiosk in real time without requiring a manual
 * refresh on the device.
 */
/** Tiny fixed badge overlaid on every kiosk template: is a radar presence
 *  sensor paired to this restroom, and is it alive. */
function SensorBadge({ online }: { online: boolean }) {
  return (
    <div
      style={{
        position: 'fixed', bottom: 8, insetInlineStart: 8, zIndex: 50,
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '3px 8px', borderRadius: 999,
        background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
        fontSize: 10, color: online ? '#4ade80' : '#f87171',
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          width: 6, height: 6, borderRadius: '50%',
          background: online ? '#4ade80' : '#f87171',
          boxShadow: online ? '0 0 6px rgba(74,222,128,0.8)' : 'none',
        }}
      />
      📡 {online ? 'חיישן פעיל' : 'חיישן מנותק'}
    </div>
  );
}

export default function KioskDispatcher() {
  useScrollLock(); // wall tablets must never bounce/pan
  const { deviceCode } = useParams<{ deviceCode: string }>();
  const [theme, setTheme] = useState<string | null>(null);
  const [sensor, setSensor] = useState<{ present: boolean; online: boolean } | null>(null);

  useEffect(() => {
    if (!deviceCode) {
      setTheme('default');
      return;
    }
    let cancelled = false;
    api.get(`/buildings/kiosk-config/${deviceCode}`)
      .then(r => {
        if (cancelled) return;
        setTheme(r.data?.theme ?? 'default');
        if (r.data?.sensor?.present) setSensor(r.data.sensor);
      })
      .catch(err => {
        if (cancelled) return;
        // 404 = the device was deleted from the admin UI → show the removed
        // screen. Network errors keep the offline-first default kiosk.
        setTheme(err?.response?.status === 404 ? 'removed' : 'default');
      });
    return () => { cancelled = true; };
  }, [deviceCode]);

  // Radar reports flow through the restroom WS room this kiosk already joins —
  // any report means the sensor is alive right now.
  useEffect(() => {
    const socket = getSocket();
    const onPresence = () => setSensor(s => (s ? { ...s, online: true } : { present: true, online: true }));
    socket.on('sensor:presence', onPresence);
    return () => { socket.off('sensor:presence', onPresence); };
  }, []);

  // React to admin template changes pushed from the server.
  useEffect(() => {
    if (!deviceCode) return;
    api.get(`/auth/kiosk/${deviceCode}`)
      .then(r => {
        const restroomId = r.data?.restroom?.id;
        if (restroomId) joinRestroom(restroomId);
      })
      .catch(() => {});

    const socket = getSocket();
    const onConfigChanged = (payload: { deviceCodes?: string[] }) => {
      if (!payload?.deviceCodes || payload.deviceCodes.includes(deviceCode)) {
        window.location.reload();
      }
    };
    socket.on('kiosk:config-changed', onConfigChanged);
    return () => { socket.off('kiosk:config-changed', onConfigChanged); };
  }, [deviceCode]);

  if (theme === null) {
    return <div style={{ background: '#000', width: '100%', height: '100dvh' }} />;
  }
  if (theme === 'removed') return <KioskRemoved />;

  const page =
    theme === 'neon' ? <KioskPageNeon /> :
    theme === 'neon-pro' ? <KioskPageNeonPro /> :
    theme === 'neon-image' ? <KioskPageNeonImage /> :
    theme === 'neon-video' ? <KioskPageNeonVideo /> :
    <KioskPage />;

  return (
    <>
      {page}
      {sensor?.present && <SensorBadge online={sensor.online} />}
    </>
  );
}
