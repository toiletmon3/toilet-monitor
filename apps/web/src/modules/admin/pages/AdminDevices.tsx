import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Wifi, WifiOff, Building2, Tablet, Radar, Plus } from 'lucide-react';
import api from '../../../lib/api';
import { getSocket, joinOrg } from '../../../lib/socket';

function formatRelative(date: string | null, t: (k: string) => string) {
  if (!date) return t('admin.devices.never');
  const diff = Date.now() - new Date(date).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return t('admin.devices.justNow');
  if (min < 60) return `${t('admin.devices.ago')} ${min} ${t('common.minutes')}`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${t('admin.devices.ago')} ${hr} ${t('common.hours')}`;
  const day = Math.floor(hr / 24);
  return `${t('admin.devices.ago')} ${day} ${t('common.days')}`;
}

/** Exact wall-clock time in the org's timezone, e.g. "26/06/2026, 10:56". */
function formatExact(date: string | null, lang: string) {
  if (!date) return null;
  const tz = localStorage.getItem('orgTimezone') ?? 'Asia/Jerusalem';
  return new Date(date).toLocaleString(lang === 'he' ? 'he-IL' : 'en-US', {
    timeZone: tz,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function AdminDevices() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const [buildingId, setBuildingId] = useState<string>(''); // '' = all

  const { data: structure = [] } = useQuery({
    queryKey: ['building-structure'],
    queryFn: async () => (await api.get('/buildings/structure')).data,
    refetchInterval: 30_000,
  });

  // Live radar-sensor status per restroom (occupied / visits today)
  const { data: sensorSummaries = [] } = useQuery({
    queryKey: ['sensor-summaries'],
    queryFn: async () => (await api.get('/sensors/summary')).data,
    refetchInterval: 30_000,
  });
  const sensorByRestroom = new Map(
    (sensorSummaries as any[]).map((s: any) => [s.restroomId, s]),
  );

  useEffect(() => {
    const orgId = localStorage.getItem('orgId');
    if (orgId) joinOrg(orgId);

    const socket = getSocket();
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['building-structure'] });
    const refreshSensors = () => queryClient.invalidateQueries({ queryKey: ['sensor-summaries'] });
    socket.on('device:offline', refresh);
    socket.on('device:online', refresh);
    socket.on('sensor:presence', refreshSensors);
    return () => {
      socket.off('device:offline', refresh);
      socket.off('device:online', refresh);
      socket.off('sensor:presence', refreshSensors);
    };
  }, [queryClient]);

  // Flatten every device across the org with its full location + status.
  const allDevices: any[] = [];
  for (const b of structure as any[]) {
    for (const f of b.floors ?? []) {
      for (const r of f.restrooms ?? []) {
        for (const d of r.devices ?? []) {
          allDevices.push({ ...d, buildingId: b.id, buildingName: b.name, floorName: f.name, restroomName: r.name });
        }
      }
    }
  }

  const devices = (buildingId ? allDevices.filter(d => d.buildingId === buildingId) : allDevices)
    // Offline first (need attention), then by device code.
    .sort((a, b) => (Number(a.isOnline) - Number(b.isOnline)) || String(a.deviceCode).localeCompare(String(b.deviceCode)));

  const onlineCount = devices.filter(d => d.isOnline).length;
  const offlineCount = devices.length - onlineCount;
  const selectedBuildingName = (structure as any[]).find((b: any) => b.id === buildingId)?.name;

  return (
    <div className="flex flex-col gap-6">
      {/* Header with building filter */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-white">{t('admin.devices.statusTitle')}</h1>
        <Link
          to="/flash"
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold"
          style={{ background: 'rgba(0,229,204,0.1)', border: '1px solid rgba(0,229,204,0.35)', color: 'var(--color-accent)' }}
        >
          <Plus size={15} />
          {t('admin.devices.installSensor')}
        </Link>
        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.25)' }}
        >
          <Building2 size={15} style={{ color: 'var(--color-accent)' }} />
          <select
            value={buildingId}
            onChange={e => setBuildingId(e.target.value)}
            className="bg-transparent text-sm outline-none"
            style={{ color: 'var(--color-text)', minWidth: 160 }}
          >
            <option value="" style={{ background: '#0a0e1a' }}>{t('admin.dashboard.allBuildings')}</option>
            {(structure as any[]).map((b: any) => (
              <option key={b.id} value={b.id} style={{ background: '#0a0e1a' }}>{b.name}</option>
            ))}
          </select>
        </div>
      </div>

      {buildingId && (
        <div
          className="text-xs flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: 'rgba(0,229,204,0.06)', border: '1px solid rgba(0,229,204,0.2)', color: 'var(--color-accent)' }}
        >
          {t('admin.dashboard.filteredBy')}: <span className="font-semibold">{selectedBuildingName}</span>
          <button onClick={() => setBuildingId('')} className="ms-auto underline hover:text-white">
            {t('admin.dashboard.clearFilter')}
          </button>
        </div>
      )}

      {/* Online / offline counts */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.35)' }}>
          <Wifi size={14} style={{ color: '#22c55e' }} />
          <span className="text-sm" style={{ color: '#22c55e' }}>{t('admin.devices.online')}: <span className="font-bold">{onlineCount}</span></span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.35)' }}>
          <WifiOff size={14} style={{ color: '#ef4444' }} />
          <span className="text-sm" style={{ color: '#ef4444' }}>{t('admin.devices.offline')}: <span className="font-bold">{offlineCount}</span></span>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.2)' }}>
        <div className="px-5 py-4 flex items-center gap-2 border-b" style={{ borderColor: 'rgba(0,229,204,0.12)' }}>
          <Tablet size={16} style={{ color: 'var(--color-accent)' }} />
          <h2 className="font-semibold text-white">{t('admin.devices.statusTitle')}</h2>
          {devices.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(0,229,204,0.15)', color: 'var(--color-accent)' }}>
              {devices.length}
            </span>
          )}
        </div>

        {devices.length === 0 ? (
          <div className="px-5 py-12 text-center" style={{ color: 'var(--color-text-secondary)' }}>
            {t('admin.devices.noDevices')}
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
            {devices.map(d => {
              const exact = formatExact(d.lastHeartbeat, lang);
              const isSensor = d.type === 'SENSOR';
              const sensor = isSensor ? sensorByRestroom.get(d.restroomId) : undefined;
              return (
                <div key={d.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{
                        background: d.isOnline ? '#22c55e' : '#ef4444',
                        boxShadow: d.isOnline ? '0 0 8px rgba(34,197,94,0.6)' : 'none',
                      }}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-mono font-medium text-white truncate flex items-center gap-2">
                        {isSensor && <Radar size={13} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />}
                        {d.deviceCode}
                        <span
                          className="text-[10px] font-sans font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0"
                          style={{ background: 'rgba(0,229,204,0.12)', color: 'var(--color-accent)' }}
                        >
                          {isSensor ? t('admin.devices.sensor') : t('admin.devices.kiosk')}
                        </span>
                      </div>
                      <div className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
                        {d.buildingName} › {d.floorName} › {d.restroomName}
                      </div>
                      {isSensor && sensor && (
                        <div className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                          {t('admin.devices.visitsToday')}: <b style={{ color: '#22c55e' }}>{sensor.visitsToday}</b>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="text-xs flex-shrink-0 text-end">
                    <div style={{ color: d.isOnline ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                      {d.isOnline ? t('admin.devices.online') : t('admin.devices.offline')}
                    </div>
                    <div style={{ color: 'var(--color-text-secondary)' }}>
                      {t('admin.devices.lastSeen')}: {exact ?? t('admin.devices.never')}
                    </div>
                    {exact && (
                      <div style={{ color: 'var(--color-text-secondary)', opacity: 0.7 }}>
                        {formatRelative(d.lastHeartbeat, t)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
