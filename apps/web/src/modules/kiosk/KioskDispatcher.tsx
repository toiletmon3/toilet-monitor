import { useEffect, useState } from 'react';
import api from '../../lib/api';
import KioskPage from './KioskPage';
import KioskPageNeon from './templates/neon/KioskPageNeon';

/**
 * Reads the organization's kioskTheme setting and renders the matching kiosk UI.
 * Admin chooses the theme in Settings → "עיצוב קיוסק".
 */
export default function KioskDispatcher() {
  const [theme, setTheme] = useState<string | null>(null);

  useEffect(() => {
    api.get('/auth/default-org')
      .then(r => setTheme(r.data?.kioskTheme ?? 'default'))
      .catch(() => setTheme('default'));
  }, []);

  // While loading, render a black screen — the theme change is instant after.
  if (theme === null) {
    return <div style={{ background: '#000', width: '100%', height: '100dvh' }} />;
  }

  return theme === 'neon' ? <KioskPageNeon /> : <KioskPage />;
}
