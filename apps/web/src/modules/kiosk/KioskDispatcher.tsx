import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';
import { getSocket, joinRestroom } from '../../lib/socket';
import { refreshRoster } from '../../lib/offline';
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
 *
 * The radar presence-sensor status ("חיישן פעיל/מנותק") is deliberately NOT
 * shown on the public kiosk screen — it used to be a fixed badge in the bottom
 * corner, but it overlapped the "🧹 צוות" team button and blocked taps on it.
 * The status now lives inside the team interface, on the manager screen (see
 * CleanerCheckIn), where only staff see it.
 */
export default function KioskDispatcher() {
  useScrollLock(); // wall tablets must never bounce/pan
  const { deviceCode } = useParams<{ deviceCode: string }>();
  const [theme, setTheme] = useState<string | null>(null);

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
      })
      .catch(err => {
        if (cancelled) return;
        // 404 = the device was deleted from the admin UI → show the removed
        // screen. Network errors keep the offline-first default kiosk.
        setTheme(err?.response?.status === 404 ? 'removed' : 'default');
      });
    return () => { cancelled = true; };
  }, [deviceCode]);

  // Cache the building's staff roster while online so any assigned worker can
  // log in on the team screen during an internet outage — even if they've never
  // personally used this tablet before. Refreshed on every kiosk load.
  useEffect(() => {
    refreshRoster(deviceCode);
  }, [deviceCode]);

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

  // The kiosk artwork (images + videos) is precached, so the designed templates
  // keep working offline — no need to fall back to the classic look. A tablet
  // that has never been online falls through to 'default' above (its theme was
  // never fetched), which is the only case the classic template shows.
  return (
    theme === 'neon' ? <KioskPageNeon /> :
    theme === 'neon-pro' ? <KioskPageNeonPro /> :
    theme === 'neon-image' ? <KioskPageNeonImage /> :
    theme === 'neon-video' ? <KioskPageNeonVideo /> :
    <KioskPage />
  );
}
