import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api';

export default function KioskSelector() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const lang = i18n.language as 'he' | 'en';

  const [buildings, setBuildings] = useState<any[]>([]);
  const [selectedBuilding, setSelectedBuilding] = useState<any>(null);
  const [selectedFloor, setSelectedFloor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const { data: org } = await api.get('/auth/default-org');
        if (!org) { setError(lang === 'he' ? 'לא נמצאה ארגון' : 'No organization found'); return; }
        // Apply kiosk language from org settings
        if (org.kioskLang && org.kioskLang !== i18n.language) {
          import('../../i18n').then(m => m.setLanguage(org.kioskLang));
        }
        const { data } = await api.get(`/buildings/public-structure/${org.orgId}`);
        setBuildings(data);
        // Auto-select if only one building
        if (data?.length === 1) setSelectedBuilding(data[0]);
      } catch {
        setError(lang === 'he' ? 'שגיאה בטעינה' : 'Loading error');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [lang]);

  const handleSelectRestroom = (restroom: any) => {
    navigate(`/kiosk/ROOM-${restroom.id}`);
  };

  const genderIcon = (g: string) => g === 'MALE' ? '🚹' : g === 'FEMALE' ? '🚺' : '🚻';
  const genderLabel = (g: string) => {
    if (lang === 'he') return g === 'MALE' ? 'גברים' : g === 'FEMALE' ? 'נשים' : 'משותף';
    return g === 'MALE' ? 'Men' : g === 'FEMALE' ? 'Women' : 'Unisex';
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-10" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🚾</div>
          <h1 className="text-2xl font-bold text-white">{lang === 'he' ? 'בחר שירותים' : 'Select Restroom'}</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            {lang === 'he' ? 'בחר את הקומה ואת השירותים שלך' : 'Choose your floor and restroom'}
          </p>
        </div>

        {loading && <div className="text-center" style={{ color: 'var(--color-text-secondary)' }}>...</div>}
        {error && <div className="text-center text-red-400">{error}</div>}

        {!loading && !error && (
          <div className="flex flex-col gap-4">
            {/* Building selector */}
            {buildings.length > 1 && !selectedBuilding && (
              <div className="flex flex-col gap-2">
                {buildings.map(b => (
                  <button key={b.id} onClick={() => setSelectedBuilding(b)}
                    className="w-full py-4 px-5 rounded-2xl text-white font-medium text-start transition-all active:scale-95"
                    style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.2)' }}>
                    🏢 {b.name}
                  </button>
                ))}
              </div>
            )}

            {/* Auto-select handled in useEffect */}

            {/* Floor selector */}
            {selectedBuilding && !selectedFloor && (
              <div className="flex flex-col gap-2">
                {buildings.length > 1 && (
                  <button onClick={() => setSelectedBuilding(null)} className="text-sm mb-2 text-start" style={{ color: 'var(--color-accent)' }}>
                    ← {lang === 'he' ? 'חזרה' : 'Back'}
                  </button>
                )}
                <p className="text-sm font-medium text-white mb-1">{selectedBuilding.name}</p>
                {selectedBuilding.floors.map((f: any) => (
                  <button key={f.id} onClick={() => setSelectedFloor(f)}
                    className="w-full py-4 px-5 rounded-2xl text-white font-medium text-start transition-all active:scale-95"
                    style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.2)' }}>
                    🏬 {f.name}
                  </button>
                ))}
              </div>
            )}

            {/* Restroom selector */}
            {selectedFloor && (
              <div className="flex flex-col gap-2">
                <button onClick={() => setSelectedFloor(null)} className="text-sm mb-2 text-start" style={{ color: 'var(--color-accent)' }}>
                  ← {lang === 'he' ? 'חזרה' : 'Back'}
                </button>
                <p className="text-sm font-medium text-white mb-1">{selectedFloor.name}</p>
                {selectedFloor.restrooms.map((r: any) => (
                  <button key={r.id} onClick={() => handleSelectRestroom(r)}
                    className="w-full py-5 px-5 rounded-2xl text-white font-semibold text-lg transition-all active:scale-95"
                    style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.3)' }}>
                    {genderIcon(r.gender)} {r.name} — {genderLabel(r.gender)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
