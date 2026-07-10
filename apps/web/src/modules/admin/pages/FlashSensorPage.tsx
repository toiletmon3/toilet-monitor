import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../../lib/api';
import 'esp-web-tools/dist/web/install-button.js';

/**
 * /flash — browser-based installer for the LD2450 radar sensor bridge
 * (LILYGO T-SIM7670G-S3). Flashes the firmware over WebSerial (Chrome/Edge
 * on desktop), then walks the installer through the captive-portal pairing.
 */
export default function FlashSensorPage() {
  const [restroomId, setRestroomId] = useState('');
  const [copied, setCopied] = useState(false);
  const [firmwareReady, setFirmwareReady] = useState<boolean | null>(null);

  const webSerialSupported = typeof navigator !== 'undefined' && 'serial' in navigator;

  const { data: structure = [], isLoading } = useQuery({
    queryKey: ['building-structure'],
    queryFn: async () => (await api.get('/buildings/structure')).data,
  });

  // Firmware binary is committed by the firmware CI build — check it exists.
  useEffect(() => {
    fetch('/firmware/toiletmon-sensor.bin', { method: 'HEAD' })
      .then((r) => setFirmwareReady(r.ok))
      .catch(() => setFirmwareReady(false));
  }, []);

  const restrooms = useMemo(() => {
    const list: { id: string; label: string }[] = [];
    for (const b of structure as any[]) {
      for (const f of b.floors ?? []) {
        for (const r of f.restrooms ?? []) {
          list.push({ id: r.id, label: `${b.name} · ${f.name} · ${r.name}` });
        }
      }
    }
    return list;
  }, [structure]);

  const deviceCode = restroomId ? `SENS-${restroomId}` : '';

  // Live check: has the sensor started reporting?
  const { data: summary } = useQuery({
    queryKey: ['sensor-summary', restroomId],
    queryFn: async () => (await api.get(`/sensors/restrooms/${restroomId}/summary`)).data,
    enabled: !!restroomId,
    refetchInterval: 5000,
  });
  const sensorOnline = (summary?.sensors ?? []).some((s: any) => s.isOnline && s.lastHeartbeat);

  const copyCode = () => {
    navigator.clipboard.writeText(deviceCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    // The app locks scrolling globally (kiosk overscroll fix on html/body),
    // so this standalone page needs its own scroll container.
    <div dir="rtl" className="h-screen overflow-y-auto bg-slate-950 text-slate-100 p-6 md:p-10">
      <div className="max-w-2xl mx-auto space-y-8 pb-16">
        <header>
          <h1 className="text-2xl font-bold">📡 התקנת חיישן נוכחות</h1>
          <p className="text-slate-400 mt-1">
            צריבת קושחה לגשר החיישן (LILYGO + LD2450) ישירות מהדפדפן, ושיוך לחדר שירותים.
          </p>
        </header>

        {!webSerialSupported && (
          <div className="rounded-xl border border-amber-600 bg-amber-950/40 p-4 text-amber-200">
            ⚠️ הדפדפן הזה לא תומך בצריבה (Web Serial). יש להיכנס לדף הזה
            מ‑<b>Chrome או Edge במחשב</b> — לא מטלפון.
          </div>
        )}

        {/* Step 1 — pick the restroom */}
        <section className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
          <h2 className="text-lg font-semibold">1️⃣ לאיזה חדר שירותים החיישן שייך?</h2>
          {isLoading ? (
            <p className="text-slate-400">טוען מבנה…</p>
          ) : (
            <select
              value={restroomId}
              onChange={(e) => setRestroomId(e.target.value)}
              className="w-full rounded-lg bg-slate-800 border border-slate-700 p-3"
            >
              <option value="">בחר חדר שירותים…</option>
              {restrooms.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          )}

          {deviceCode && (
            <div className="flex items-center gap-3 bg-slate-800 rounded-lg p-3">
              <code className="flex-1 text-sky-300 break-all text-sm">{deviceCode}</code>
              <button
                onClick={copyCode}
                className="shrink-0 rounded-lg bg-sky-600 hover:bg-sky-500 px-4 py-2 font-semibold"
              >
                {copied ? '✓ הועתק' : 'העתק קוד'}
              </button>
            </div>
          )}
          <p className="text-sm text-slate-400">
            את הקוד הזה מדביקים בהמשך בפורטל ההגדרה של החיישן (שלב 3).
          </p>
        </section>

        {/* Step 2 — flash */}
        <section className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4">
          <h2 className="text-lg font-semibold">2️⃣ חיבור וצריבה</h2>
          <ol className="list-decimal pr-5 space-y-1 text-slate-300 text-sm">
            <li>חבר את לוח ה‑LILYGO למחשב בכבל USB‑C (החיישן יכול להישאר מחובר).</li>
            <li>לחץ על הכפתור למטה ובחר את הפורט שמופיע (בד״כ "USB JTAG/serial").</li>
            <li>אם שום פורט לא מופיע — החזק את כפתור BOOT שעל הלוח, חבר את ה‑USB תוך כדי, ושחרר.</li>
          </ol>

          {firmwareReady === false && (
            <div className="rounded-xl border border-amber-600 bg-amber-950/40 p-4 text-amber-200 text-sm">
              ⏳ הקושחה עדיין נבנית בשרת (נבנית אוטומטית אחרי כל עדכון קוד). נסה לרענן את
              הדף בעוד כמה דקות.
            </div>
          )}

          <esp-web-install-button manifest="/firmware/manifest.json">
            <button
              slot="activate"
              disabled={!firmwareReady}
              className="rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 px-6 py-3 font-bold text-lg"
            >
              🔌 צרוב קושחה לחיישן
            </button>
            <span slot="unsupported" className="text-amber-300 text-sm">
              הדפדפן לא תומך — Chrome/Edge במחשב בלבד.
            </span>
            <span slot="not-allowed" className="text-amber-300 text-sm">
              הדף חייב להיטען ב‑HTTPS כדי לצרוב.
            </span>
          </esp-web-install-button>
        </section>

        {/* Step 3 — pairing */}
        <section className="rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-3">
          <h2 className="text-lg font-semibold">3️⃣ חיבור לרשת ושיוך</h2>
          <ol className="list-decimal pr-5 space-y-1 text-slate-300 text-sm">
            <li>אחרי הצריבה החיישן פותח רשת WiFi בשם <b>ToiletMon-Setup</b>.</li>
            <li>התחבר אליה מהטלפון — דף הגדרה ייפתח לבד (אם לא, גלוש ל‑192.168.4.1).</li>
            <li>בחר את רשת ה‑WiFi של המתקן והזן את הסיסמה שלה.</li>
            <li>הדבק את קוד המכשיר משלב 1 ולחץ "שמור והתחבר".</li>
          </ol>
          <p className="text-sm text-slate-400">
            טעית בשיוך או עוברים רשת? מחזיקים את כפתור BOOT שעל הלוח 5 שניות — והחיישן
            חוזר למצב הגדרה.
          </p>
        </section>

        {/* Step 4 — live verification */}
        {restroomId && (
          <section className="rounded-2xl bg-slate-900 border border-slate-800 p-6">
            <h2 className="text-lg font-semibold mb-3">4️⃣ בדיקה</h2>
            {sensorOnline ? (
              <div className="rounded-xl border border-emerald-600 bg-emerald-950/40 p-4 text-emerald-200">
                ✅ החיישן מדווח! ביקורים היום: <b>{summary?.visitsToday ?? 0}</b>
                {summary?.occupied && ' · יש נוכחות בחדר כרגע'}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 text-slate-300 text-sm">
                ממתין לדיווח ראשון מהחיישן… (מתעדכן אוטומטית כל כמה שניות)
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
