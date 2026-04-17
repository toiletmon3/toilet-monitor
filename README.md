# 🚾 ToiletMon — Smart Restroom Monitoring System

מערכת ניטור שירותים חכמה עם 3 ממשקים: **קיוסק טאבלט**, **אפליקציית מנקה**, ו**לוח בקרה למנהל**.  
בנויה עם NestJS + React PWA + PostgreSQL, עם deploy אוטומטי לענן.

---

## 🌐 גישה מהירה (Production)

| ממשק | DuckDNS (HTTPS) | IP ישיר |
|------|----------------|---------|
| **Admin** | https://toiletcleanpro.duckdns.org/admin | http://188.166.163.75/admin |
| **Kiosk** | https://toiletcleanpro.duckdns.org/kiosk | http://188.166.163.75/kiosk |
| **Cleaner** | https://toiletcleanpro.duckdns.org/cleaner | http://188.166.163.75/cleaner |

> **Admin** — נכנס אוטומטית ללא סיסמה (bypass לפיתוח)  
> **Cleaner** — כניסה עם ת.ז בלבד  
> **Kiosk** — בחירת בניין / קומה / שירותים

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
              ├── Analytics
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
- בחירת בניין / קומה / שירותים (Selector page)
- דיווח תקלות בלחיצה אחת (סטים של כפתורים מותאמים אישית — Kiosk Templates)
- כניסת צוות ניקוי דרך הקיוסק (ת.ז בפינה)
- עיצוב glassmorphism, gradient background, תמיכה מלאה ב-RTL
- Offline mode — שמירה ב-IndexedDB, סנכרון אוטומטי כשהחיבור חוזר

### Cleaner (מנקה)
- כניסה עם ת.ז בלבד
- 2 רשימות: **"בטיפולי"** + **"ממתינות"**
- "החזר משימה לתור" (un-assign)
- מנקים רואים רק תקלות של הבניין שלהם

### Admin (מנהל)
- Dashboard עם סיכום תקלות פעילות
- ניהול תקלות (שינוי סטטוס, הקצאה למנקה, הערות)
- Analytics — נתונים ותרשימים
- ניהול בניינים / קומות / שירותים / מכשירים (inline editing, cascading delete)
- ניהול מנקים + שיוך לבניין ספציפי
- Kiosk Templates — בניית סטים של כפתורים לכל בניין
- Dark / Light mode
- תמיכה בעברית ואנגלית (i18n)

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

### 3. יצירת הסכמה ונתוני דמו
```bash
pnpm db:migrate    # יצור את כל הטבלאות
pnpm db:seed       # ימלא נתוני דמו
```

### 4. הרצה
```bash
pnpm dev           # מריץ server + web ביחד
```

| ממשק | כתובת |
|------|--------|
| Frontend | http://localhost:5173 |
| API | http://localhost:3001 |

---

## 🔑 פרטי כניסה (Demo Seed)

| ממשק | פרטים |
|------|--------|
| Admin | `admin@demo.com` / `Admin123!` (או נכנס אוטומטית ב-bypass mode) |
| Cleaner | ת.ז: `123456789` (אחמד) · `234567890` (מרים) · `345678901` (יוסף) |
| Kiosk | http://localhost:5173/kiosk → בחר בניין/קומה/שירותים |

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
| שרת | DigitalOcean (Ubuntu) |
| IP | `188.166.163.75` |
| דומיין | `toiletcleanpro.duckdns.org` |
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
| דומיין | ~50 ₪/שנה |
| SSL (Let's Encrypt) | חינם |
