import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../../lib/api';
import KioskPage from './KioskPage';
import KioskPageNeon from './templates/neon/KioskPageNeon';

/**
 * Reads the kiosk template (theme + buttons) assigned to this device and renders
 * the matching kiosk UI. Resolution order on the backend:
 *   device.kioskTemplate → building.kioskTemplate → default
 * Admin configures templates and assigns them per building or per device in
 * "טמפלטים לקיוסק".
 */
export default function KioskDispatcher() {
  const { deviceCode } = useParams<{ deviceCode: string }>();
  const [theme, setTheme] = useState<string | null>(null);

  useEffect(() => {
    if (!deviceCode) {
      setTheme('default');
      return;
    }
    api.get(`/buildings/kiosk-config/${deviceCode}`)
      .then(r => setTheme(r.data?.theme ?? 'default'))
      .catch(() => setTheme('default'));
  }, [deviceCode]);

  if (theme === null) {
    return <div style={{ background: '#000', width: '100%', height: '100dvh' }} />;
  }

  return theme === 'neon' ? <KioskPageNeon /> : <KioskPage />;
}
