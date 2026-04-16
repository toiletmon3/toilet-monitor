# 🚾 ToiletMon - Smart Restroom Monitoring System

מערכת ניטור שירותים חכמה עם 3 ממשקים: קיוסק טאבלט, אפליקציית מנקה, ולוח בקרה למנהל.

---

## ⚡ Quick Start (פיתוח)

### 1. דרישות מוקדמות
- Node.js 22+ 
- pnpm (`npm install -g pnpm`)
- Docker Desktop (לבסיס הנתונים)

### 2. הרצת בסיס הנתונים
```bash
docker compose up -d
```

### 3. הגדרת משתני סביבה
```bash
cp .env.example apps/server/.env
# ערוך את apps/server/.env לפי הצורך
```

### 4. יצירת הסכמה ונתוני ברירת מחדל
```bash
pnpm db:migrate    # יצור את כל הטבלאות
pnpm db:seed       # ימלא נתוני דמו
```

### 5. הרצת השרת והפרונטאנד
```bash
pnpm dev           # מריץ הכל ביחד
```

---

## 🖥️ כניסה לכל ממשק

### טאבלט קיוסק (בשירותים)
```
http://localhost:5173/kiosk/KIOSK-F1-M
```
- `KIOSK-F1-M` = קומה 1, גברים
- `KIOSK-F1-F` = קומה 1, נשים
- `KIOSK-F2-M` = קומה 2, גברים
- וכו...

**גישה למנקה מהקיוסק:** לחץ 3 פעמים על הפינה הימנית-עליונה

---

### אפליקציית מנקה (מהמכשיר האישי)
```
http://localhost:5173/cleaner/login
```
- **Org ID:** (מה-seed output)
- **ת.ז מנקים לדמו:**
  - `123456789` (אחמד)
  - `234567890` (מרים)  
  - `345678901` (יוסף)

---

### לוח בקרה מנהל
```
http://localhost:5173/admin
```
- **אימייל:** `admin@demo.com`
- **סיסמה:** `Admin123!`

---

## 📱 מה קונים לפיילוט?

### לכל תא שירותים:
| פריט | מחיר משוער |
|------|------------|
| **טאבלט אנדרואיד 10"** (Lenovo Tab M10 / Samsung A7) | 300-500 ₪ |
| **Fully Kiosk Browser** (רישיון חד פעמי לטאבלט) | ~25 ₪ ($7) |
| **מדבקות/מסגרת פלסטיק** לכיסוי כפתור הפעלה | 50-100 ₪ |
| **כבל USB-C ומטען** (קבוע לקיר) | 30-50 ₪ |

### לשרת (מנהל):
| פריט | עלות חודשית |
|------|------------|
| **Hetzner VPS CX32** (4 vCPU / 8GB RAM) | ~15€/חודש |
| **דומיין** | ~50 ₪/שנה |
| **SSL** | חינם (Let's Encrypt) |

---

## ⚙️ הגדרת טאבלט Kiosk (Android)

### שיטה 1 - Fully Kiosk Browser (מומלץ)
1. הורד מ-Play Store: **Fully Kiosk Browser & App Lockdown**
2. הגדר URL: `https://yourdomain.com/kiosk/KIOSK-F1-M`
3. הפעל: `Kiosk Mode` → נעל את המכשיר לאפליקציה
4. הגדר: `Motion Detection` → כיבוי מסך אחרי X דקות ללא פעילות
5. חבר לWiFi של הבניין עם סיסמה

### שיטה 2 - Android Screen Pinning (חינם)
1. הגדרות → נגישות → Screen Pinning → ON
2. פתח Chrome → נווט ל-URL הקיוסק
3. לחץ Recent Apps → לחץ על Pin
4. לשחרור: לחץ Back + Recent יחד (3 שניות)

---

## 🏗️ ארכיטקטורה

```
apps/
  web/      → React PWA (קיוסק + מנקה + מנהל)
  server/   → NestJS REST API + WebSocket
packages/
  shared-types/ → TypeScript interfaces משותפות
```

### API Endpoints עיקריים:
- `POST /api/incidents` - דיווח תקלה (ציבורי)
- `POST /api/incidents/sync` - סנכרון offline batch
- `GET /api/incidents` - רשימת תקלות (אדמין)
- `PATCH /api/incidents/:id/resolve` - סימון כטופל
- `GET /api/analytics/summary` - נתונים כלליים
- `PATCH /api/buildings/devices/:code/heartbeat` - פעימת חיים

---

## 🔌 Offline Mode

הטאבלט עובד **ללא חיבור אינטרנט**:
1. לחיצה על כפתור → נשמר ב-IndexedDB
2. כשהחיבור חוזר → Service Worker מסנכרן אוטומטית
3. נקודת הסנכרון: `POST /api/incidents/sync`

---

## 🚀 Deploy לייצור (Hetzner)

```bash
# על השרת:
git clone https://github.com/OriAha/toilet-monitor
cd toilet-monitor
cp .env.example .env.production
# ערוך .env.production עם ערכים אמיתיים

docker compose -f docker-compose.prod.yml up -d
```
