# 🚾 ToiletMon — Smart Restroom Monitoring System

מערכת ניטור שירותים חכמה עם 3 ממשקים: **קיוסק טאבלט**, **אפליקציית מנקה**, ו**לוח בקרה למנהל**.  
בנויה עם NestJS + React PWA + PostgreSQL, עם deploy אוטומטי לענן.

---

## 🌐 גישה מהירה — Production

### DuckDNS (HTTPS + SSL — מומלץ)
| ממשק | קישור |
|------|-------|
| 🖥️ **Admin** | [https://toiletcleanpro.duckdns.org/admin](https://toiletcleanpro.duckdns.org/admin) |
| 📋 **Kiosk** | [https://toiletcleanpro.duckdns.org/kiosk](https://toiletcleanpro.duckdns.org/kiosk) |
| 🧹 **Cleaner** | [https://toiletcleanpro.duckdns.org/cleaner](https://toiletcleanpro.duckdns.org/cleaner) |
| 🔌 **API** | [https://toiletcleanpro.duckdns.org/api](https://toiletcleanpro.duckdns.org/api) |

### IP ישיר (DigitalOcean)
| ממשק | קישור |
|------|-------|
| 🖥️ **Admin** | [http://188.166.163.75/admin](http://188.166.163.75/admin) |
| 📋 **Kiosk** | [http://188.166.163.75/kiosk](http://188.166.163.75/kiosk) |
| 🧹 **Cleaner** | [http://188.166.163.75/cleaner](http://188.166.163.75/cleaner) |
| 🔌 **API** | [http://188.166.163.75/api](http://188.166.163.75/api) |

> **Admin** — נכנס אוטומטית ללא סיסמה (bypass לפיתוח)  
> **Cleaner** — כניסה עם ת.ז בלבד  
> **Kiosk** — בחירת בניין / קומה / שירותים → מעבר לטאבלט הספציפי

---

## 🔑 פרטי כניסה (Demo Seed)

| ממשק | פרטים |
|------|--------|
| Admin (רגיל) | `admin@demo.com` / `Admin123!` |
| Admin (bypass) | פתח [/admin](https://toiletcleanpro.duckdns.org/admin) — נכנס אוטומטית |
| Cleaner | ת.ז: `123456789` · `234567890` · `345678901` |
| Kiosk | [https://toiletcleanpro.duckdns.org/kiosk](https://toiletcleanpro.duckdns.org/kiosk) → בחר מיקום |

---

## 🏗️ ארכיטקטורה

```
apps/
  web/      → React 18 + Vite + Tailwind CSS (PWA)
              ├── /kiosk      — טאבלט בשירותים (בחירת מיקום + דיווח תקלות)
              ├── /cleaner    — אפליקציית מנקה (משימות + check-in)
              └── /admin      — לוח בקרה מנהל (Dashboard, Analytics, Settings)
  server/   → NestJS REST API + WebSocket (Socket.io)
              ├── Auth (JWT + Refresh Tokens)
              ├── Buildings / Floors / Restrooms / Devices
              ├── Incidents (תקלות + סטטוס + הקצאה)
              ├── Analytics (SLA, דפוסים, עומסים)
              └── Kiosk Templates
packages/
  shared-types/ → TypeScript interfaces משותפות
```

**Stack:**
- **Backend:** NestJS · Prisma ORM · PostgreSQL · JWT · Socket.io
- **Frontend:** React 18 · Vite · Tailwind CSS v4 · PWA (Workbox)
- **Infrastructure:** DigitalOcean VPS · Nginx · PM2 · Let's Encrypt SSL · DuckDNS
- **CI/CD:** GitHub Actions → SSH deploy → PM2 restart

---

## ✨ תכונות

### Kiosk (טאבלט בשירותים)
- בחירת בניין / קומה / שירותים
- דיווח תקלות בלחיצה אחת — כפתורים מותאמים אישית (Kiosk Templates)
- כניסת צוות ניקוי דרך הקיוסק (ת.ז) + סגירה אוטומטית אחרי 20 שניות
- משוב חיובי — נשמר בלוג ללא יצירת משימה
- סטטיסטיקות אמיתיות: כמות דיווחים שבועית + זמן תגובה ממוצע
- Offline mode — שמירה ב-IndexedDB, סנכרון אוטומטי

### Cleaner (מנקה)
- כניסה עם ת.ז בלבד (הצג/הסתר ספרות)
- שעון חי + תאריך בכותרת
- 2 רשימות: **"בטיפולי"** + **"ממתינות לטיפול"**
- "החזר משימה לתור" (un-assign)
- עדכונים בזמן אמת (WebSocket)
- מנקים רואים רק תקלות של הבניין שלהם

### Admin (מנהל)
- שעון חי + תאריך בסרגל הצד
- Dashboard עם סיכום תקלות פעילות
- תקלות מחולקות לסקציות: **בטיפול** / **ממתין** / **טופלו** / **משובים חיוביים**
- עדכונים בזמן אמת (WebSocket) + toast לתקלה חדשה
- Analytics מלא: SLA · תדירות · דפוסים · עומסים שעתיים · לפי יום · ביצועי מנקים
- איפוס נתונים: מחק טופלו / ישנים / הכל (עם אישור כפול)
- ניהול בניינים / קומות / שירותים / מכשירים (inline editing)
- Kiosk Templates — בניית סטים של כפתורים
- Dark / Light mode · עברית / אנגלית

---

## ⚡ Quick Start (פיתוח מקומי)

### דרישות מוקדמות
- Node.js 22+
- pnpm (`npm install -g pnpm`)
- Docker Desktop (לבסיס הנתונים)

### 1. הרצת בסיס הנתונים
```bash
docker compose up -d
```

### 2. הגדרת משתני סביבה
```bash
cp .env.example apps/server/.env
# ערוך apps/server/.env לפי הצורך
```

### 3. יצירת סכמה ונתוני דמו
```bash
pnpm db:migrate    # יצור את כל הטבלאות
pnpm db:seed       # ימלא נתוני דמו
```

### 4. הרצה
```bash
pnpm dev           # מריץ server + web ביחד
```

| ממשק | כתובת מקומית |
|------|-------------|
| Frontend | http://localhost:5173 |
| Admin | http://localhost:5173/admin |
| Kiosk | http://localhost:5173/kiosk |
| Cleaner | http://localhost:5173/cleaner |
| API | http://localhost:3001 |

---

## 🚀 Deploy לייצור

Deploy אוטומטי דרך GitHub Actions בכל push ל-`main`:

```
push → GitHub Actions → SSH לשרת → git pull → prisma db push → build → pm2 restart → nginx reload
```

קובץ workflow: `.github/workflows/deploy.yml`  
קובץ deploy: `scripts/deploy.sh`

### פרטי שרת
| פרט | ערך |
|-----|-----|
| שרת | DigitalOcean (Ubuntu 22.04) |
| IP | [`188.166.163.75`](http://188.166.163.75) |
| דומיין | [`toiletcleanpro.duckdns.org`](https://toiletcleanpro.duckdns.org) |
| SSL | Let's Encrypt (auto-renew) |
| Process manager | PM2 |
| Web server | Nginx |
| Project path | `/opt/toilet-monitor` |
| Env file | `/opt/toilet-monitor/.env.production` |

### SSH לשרת
```bash
ssh root@188.166.163.75
pm2 list           # מצב השרת
pm2 logs           # לוגים
```

---

## 📱 הגדרת טאבלט Kiosk (Android)

### שיטה מומלצת — Fully Kiosk Browser
1. הורד מ-Play Store: **Fully Kiosk Browser & App Lockdown**
2. הגדר URL: `https://toiletcleanpro.duckdns.org/kiosk`
3. הפעל `Kiosk Mode` — נועל את המכשיר לאפליקציה בלבד
4. הגדר `Motion Detection` לכיבוי מסך בחוסר פעילות

### שיטה חינמית — Android Screen Pinning
1. הגדרות → נגישות → Screen Pinning → ON
2. פתח Chrome → נווט ל-URL הקיוסק
3. לחץ Recent Apps → Pin
4. שחרור: Back + Recent יחד (3 שניות)

---

## 💰 עלויות פיילוט

### לכל תא שירותים
| פריט | מחיר משוער |
|------|------------|
| טאבלט אנדרואיד 10" (Lenovo Tab M10 / Samsung A7) | 300–500 ₪ |
| Fully Kiosk Browser (רישיון חד פעמי) | ~25 ₪ |
| מדבקה/מסגרת לכיסוי כפתור הפעלה | 50–100 ₪ |
| כבל USB-C ומטען קבוע לקיר | 30–50 ₪ |

### שרת
| פריט | עלות |
|------|------|
| DigitalOcean Droplet (2 vCPU / 2GB RAM) | ~$12/חודש |
| DuckDNS | חינם |
| SSL (Let's Encrypt) | חינם |
