import { useNavigate } from 'react-router-dom';

/**
 * Shown when the server says this device code was deleted from the admin UI
 * (kiosk-config returns 404). Replaces the old behavior of silently rendering
 * a default kiosk whose reports went nowhere.
 */
export default function KioskRemoved() {
  const navigate = useNavigate();
  return (
    <div
      className="flex flex-col items-center justify-center gap-5 px-8 text-center"
      style={{ height: '100dvh', minHeight: '-webkit-fill-available', background: 'radial-gradient(ellipse 120% 60% at 50% 0%, #0a1628 0%, #060a12 60%, #02050d 100%)', direction: 'rtl' }}
    >
      <div className="text-7xl">🚫</div>
      <h1 className="text-3xl font-bold text-white">הטאבלט הוסר מהמערכת</h1>
      <p className="text-lg" style={{ color: 'rgba(255,255,255,0.55)', maxWidth: 420 }}>
        מנהל מחק את הטאבלט הזה (או את התא שהוא היה משויך אליו) מממשק הניהול,
        ולכן לא ניתן לדווח ממנו יותר.
      </p>
      <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
        להפעלה מחדש יש להגדיר את הטאבלט מחדש — נדרשת תעודת זהות של מנהל.
      </p>
      <button
        onClick={() => navigate('/kiosk')}
        className="mt-2 px-8 py-4 rounded-2xl text-lg font-semibold transition-all active:scale-95"
        style={{ background: 'rgba(0,229,204,0.15)', border: '1.5px solid rgba(0,229,204,0.5)', color: '#00e5cc', boxShadow: '0 0 20px rgba(0,229,204,0.12)' }}
      >
        ⚙️ הגדרת טאבלט מחדש
      </button>
    </div>
  );
}
