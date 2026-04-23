import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';
import { getSocket, joinRestroom } from '../../lib/socket';
import KioskPage from './KioskPage';
import KioskPageNeon from './templates/neon/KioskPageNeon';
import KioskPageNeonPro from './templates/neonpro/KioskPageNeonPro';

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
export default function KioskDispatcher() {
  const { deviceCode } = useParams<{ deviceCode: string }>();
  const [theme, setTheme] = useState<string | null>(null);

  useEffect(() => {
    if (!deviceCode) {
      setTheme('default');
      return;
    }
    let cancelled = false;
    api.get(`/buildings/kiosk-config/${deviceCode}`)
      .then(r => { if (!cancelled) setTheme(r.data?.theme ?? 'default'); })
      .catch(() => { if (!cancelled) setTheme('default'); });
    return () => { cancelled = true; };
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
  if (theme === 'neon') return <KioskPageNeon />;
  if (theme === 'neon-pro') return <KioskPageNeonPro />;
  return <KioskPage />;
}
