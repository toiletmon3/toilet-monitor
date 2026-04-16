import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '../../../lib/api';

export default function AdminSettings() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const { data: structure } = useQuery({
    queryKey: ['building-structure'],
    queryFn: async () => (await api.get('/buildings/structure')).data,
  });

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-white">{t('admin.nav.settings')}</h1>

      {/* Building structure */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
        <h2 className="font-semibold text-white mb-4">{lang === 'he' ? 'מבנה' : 'Building Structure'}</h2>
        <div className="flex flex-col gap-3">
          {(structure ?? []).map((building: any) => (
            <div key={building.id}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🏢</span>
                <span className="font-medium text-white">{building.name}</span>
                <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{building.address}</span>
              </div>
              <div className="ml-6 flex flex-col gap-2">
                {(building.floors ?? []).map((floor: any) => (
                  <div key={floor.id} className="rounded-xl p-3" style={{ background: '#0a0e1a', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="text-sm font-medium mb-2" style={{ color: 'var(--color-accent)' }}>{floor.name}</div>
                    <div className="flex flex-wrap gap-2">
                      {(floor.restrooms ?? []).map((room: any) => (
                        <div
                          key={room.id}
                          className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-2"
                          style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}
                        >
                          <span>{room.gender === 'MALE' ? '🚹' : room.gender === 'FEMALE' ? '🚺' : '🚻'}</span>
                          <span className="text-white">{room.name}</span>
                          <div className="flex items-center gap-1">
                            {(room.devices ?? []).map((d: any) => (
                              <span
                                key={d.id}
                                className="w-2 h-2 rounded-full"
                                style={{ background: d.isOnline ? '#22c55e' : '#ef4444' }}
                                title={d.deviceCode}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {(!structure || structure.length === 0) && (
            <div className="text-center py-4" style={{ color: 'var(--color-text-secondary)' }}>
              {lang === 'he' ? 'אין מבנים' : 'No buildings configured'}
            </div>
          )}
        </div>
      </div>

      {/* Device info */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
        <h2 className="font-semibold text-white mb-3">{t('admin.devices.title')}</h2>
        <div className="flex flex-col gap-2">
          {(structure ?? []).flatMap((b: any) =>
            (b.floors ?? []).flatMap((f: any) =>
              (f.restrooms ?? []).flatMap((r: any) =>
                (r.devices ?? []).map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    <div>
                      <div className="text-sm font-medium text-white font-mono">{d.deviceCode}</div>
                      <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{r.name}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${d.isOnline ? 'bg-green-400' : 'bg-red-400'}`} />
                      <span className="text-xs" style={{ color: d.isOnline ? '#22c55e' : '#ef4444' }}>
                        {d.isOnline ? t('admin.devices.online') : t('admin.devices.offline')}
                      </span>
                    </div>
                  </div>
                ))
              )
            )
          )}
        </div>
      </div>
    </div>
  );
}
