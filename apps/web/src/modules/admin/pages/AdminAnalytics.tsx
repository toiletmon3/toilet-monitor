import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../../../lib/api';

const CYAN = '#00e5cc';

export default function AdminAnalytics() {
  const { t } = useTranslation();
  const [days, setDays] = useState(30);

  const { data: frequency } = useQuery({
    queryKey: ['analytics-frequency', days],
    queryFn: async () => (await api.get(`/analytics/issue-frequency?days=${days}`)).data,
  });

  const { data: hourly } = useQuery({
    queryKey: ['analytics-hourly'],
    queryFn: async () => (await api.get('/analytics/hourly?days=7')).data,
  });

  const { data: cleaners } = useQuery({
    queryKey: ['analytics-cleaners', days],
    queryFn: async () => (await api.get(`/analytics/cleaners?days=${days}`)).data,
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl px-3 py-2 text-sm" style={{ background: '#1a1f2e', border: '1px solid rgba(0,229,204,0.3)', color: '#fff' }}>
        <p className="font-medium">{label}</p>
        {payload.map((p: any) => (
          <p key={p.name} style={{ color: CYAN }}>{p.name}: {p.value}</p>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">{t('admin.analytics.title')}</h1>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className="px-3 py-1.5 rounded-lg text-sm transition-all"
              style={{
                background: days === d ? 'rgba(0,229,204,0.15)' : 'var(--color-card)',
                border: `1px solid ${days === d ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)'}`,
                color: days === d ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              }}
            >
              {d} {t('admin.analytics.days')}
            </button>
          ))}
        </div>
      </div>

      {/* Issue Frequency */}
      <div className="rounded-2xl p-5" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
        <h2 className="font-semibold text-white mb-4">{t('admin.analytics.issueFrequency')}</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={frequency ?? []} layout="vertical" margin={{ left: 20, right: 20 }}>
            <XAxis type="number" stroke="#8a9bb0" tick={{ fill: '#8a9bb0', fontSize: 12 }} />
            <YAxis
              type="category"
              dataKey="nameI18n.he"
              stroke="#8a9bb0"
              tick={{ fill: '#8a9bb0', fontSize: 11 }}
              width={120}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="count" name={t('admin.analytics.count')} radius={[0, 6, 6, 0]}>
              {(frequency ?? []).map((_: any, index: number) => (
                <Cell key={index} fill={`rgba(0,229,204,${0.4 + (index * 0.1)})`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Hourly Distribution */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
          <h2 className="font-semibold text-white mb-4">{t('admin.analytics.hourlyDistribution')}</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourly ?? []}>
              <XAxis dataKey="hour" stroke="#8a9bb0" tick={{ fill: '#8a9bb0', fontSize: 11 }} tickFormatter={(h) => `${h}:00`} />
              <YAxis stroke="#8a9bb0" tick={{ fill: '#8a9bb0', fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" name={t('admin.analytics.count')} fill={CYAN} fillOpacity={0.6} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Cleaner Performance */}
        <div className="rounded-2xl p-5" style={{ background: 'var(--color-card)', border: '1px solid rgba(0,229,204,0.15)' }}>
          <h2 className="font-semibold text-white mb-4">{t('admin.analytics.cleanerPerformance')}</h2>
          <div className="flex flex-col gap-2">
            {(cleaners ?? []).map((c: any) => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                <div>
                  <div className="text-sm font-medium text-white">{c.name}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {Math.round(c.avgResolutionMinutes)} {t('common.minutes')} {t('admin.analytics.avgTime')}
                  </div>
                </div>
                <div
                  className="text-lg font-bold"
                  style={{ color: 'var(--color-accent)' }}
                >
                  {c.totalResolved} ✓
                </div>
              </div>
            ))}
            {(!cleaners || cleaners.length === 0) && (
              <div className="text-center py-4" style={{ color: 'var(--color-text-secondary)' }}>
                {t('common.loading')}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
