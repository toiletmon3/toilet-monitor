# 🚾 ToiletMon — Smart Restroom Monitoring System

מערכת ניטור שירותים חכמה עם 3 ממשקים: **קיוסק טאבלט**, **אפליקציית עובד**, ו**לוח בקרה למנהל**.
בנויה עם NestJS + React PWA + PostgreSQL, עם deploy אוטומטי לענן.

**גרסה נוכחית:** [`v1.0.0`](https://github.com/OriAha/toilet-monitor/releases/tag/v1.0.0) — First stable production release

---

## 🌐 גישה מהירה — Production

### DuckDNS (HTTPS + SSL — מומלץ)
| ממשק | קישור |
|------|-------|
| 🖥️ **Admin** | [https://toiletcleanpro.duckdns.org/admin](https://toiletcleanpro.duckdns.org/admin) |
| 📋 **Kiosk** | [https://toiletcleanpro.duckdns.org/kiosk](https://toiletcleanpro.duckdns.org/kiosk) |
| 👷 **Worker** | [https://toiletcleanpro.duckdns.org/cleaner](https://toiletcleanpro.duckdns.org/cleaner) |
| 🔌 **API** | [https://toiletcleanpro.duckdns.org/api](https://toiletcleanpro.duckdns.org/api) |

### IP ישיר (DigitalOcean)
| ממשק | קישור |
|------|-------|
| 🖥️ **Admin** | [http://188.166.163.75/admin](http://188.166.163.75/admin) |
| 📋 **Kiosk** | [http://188.166.163.75/kiosk](http://188.166.163.75/kiosk) |
| 👷 **Worker** | [http://188.166.163.75/cleaner](http://188.166.163.75/cleaner) |
| 🔌 **API** | [http://188.166.163.75/api](http://188.166.163.75/api) |

> **Admin** — נכנס אוטומטית ללא סיסמה (bypass לפיתוח)
> **Worker** — כניסה עם ת.ז בלבד
> **Kiosk** — בחירת בניין / קומה / שירותים → מעבר לטאבלט הספציפי

---

## 🔑 פרטי כניסה (Demo Seed)

| ממשק | פרטים |
|------|--------|
| Admin (רגיל) | `admin@demo.com` / `Admin123!` |
| Admin (bypass) | פתח [/admin](https://toiletcleanpro.duckdns.org/admin) — נכנס אוטומטית |
| Worker | ת.ז: `123456789` · `234567890` · `345678901` |
| Kiosk | [/kiosk](https://toiletcleanpro.duckdns.org/kiosk) → בחר מיקום |

---

## 🏗️ ארכיטקטורה

```
apps/
  web/      → React 18 + Vite + Tailwind CSS (PWA)
              ├── /kiosk      — טאבלט בשירותים (בחירת מיקום + דיווח תקלות)
              ├── /cleaner    — אפליקציית עובד (משימות + check-in / check-out)
              └── /admin      — לוח בקרה מנהל (Dashboard, Analytics, Settings)
  server/   → NestJS REST API + WebSocket (Socket.io)
              ├── Auth (JWT + Refresh Tokens)
              ├── Buildings / Floors / Restrooms / Devices
              ├── Incidents (תקלות + סטטוס + הקצאה + Bulk delete)
              ├── Analytics (SLA · דפוסים · עומסים · ביצועי עובדים)
              ├── Users (ניהול עובדים · check-in/checkout · שפות)
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

### 📋 Kiosk (טאבלט בשירותים)
- בחירת בניין / קומה / שירותים
- דיווח תקלות בלחיצה אחת — כפתורים מותאמים אישית (Kiosk Templates)
- **בחירת שפה בולטת בראש הדף** (עברית / English עם דגלים)
- **אייקונים וטקסט גדולים** למילוי אופטימלי של הכפתורים
- כניסת צוות ניקוי דרך הקיוסק (ת.ז מוצגת כמספרים) + סגירה אוטומטית אחרי 20 שניות
- משוב חיובי — נשמר בלוג ללא יצירת משימה
- סטטיסטיקות אמיתיות: כמות דיווחים שבועית + זמן תגובה ממוצע
- **מסך "כבר בטיפול"** לדיווחים חוזרים (rate limiting)
- Offline mode — שמירה ב-IndexedDB, סנכרון אוטומטי
- **תואם לגמרי ל-iPad Safari / iOS** (Dynamic Viewport Height)

### 👷 Worker (עובד)
- **ממשק בשם ניטרלי "עובד"** (ולא "מנקה")
- כניסה עם ת.ז בלבד (הצג/הסתר ספרות)
- שעון חי + תאריך בכותרת
- 2 רשימות: **"בטיפולי"** + **"ממתינות לטיפול"**
- **"החזר משימה לתור"** (un-assign)
- **כפתור "יציאה מעבודה" (Check-out)** — רישום סוף משמרת
- עדכונים בזמן אמת (WebSocket)
- עובדים רואים רק תקלות של הבניין שלהם
- **הודעות שגיאה ברורות** — הבחנה בין "לא נמצא" ל"מושבת"
- גלילה חלקה בכל הפלטפורמות (iOS / Android / Desktop)

### 🖥️ Admin (מנהל)
- שעון חי + תאריך בסרגל הצד
- **ממשק רספונסיבי מלא** — sidebar מתקפל בדסקטופ, drawer במובייל
- **פאנל "כרגע בעבודה"** — רואה בזמן אמת מי עשה check-in היום
- "מנקים פעילים" בסקירה כללית = סופר על-פי check-in, לא על-פי הרשאות
- Dashboard עם סיכום תקלות פעילות
- תקלות מחולקות לסקציות: **בטיפול** / **ממתין** / **טופלו** / **משובים חיוביים**
- עדכונים בזמן אמת (WebSocket) + toast לתקלה חדשה
- Analytics מלא: SLA · תדירות · דפוסים · עומסים שעתיים · לפי יום · ביצועי עובדים
- **עריכת פרטי עובד** (שם · ת.ז · טלפון) דרך modal
- **השבתה/הפעלה של עובד** — חוסם כניסה למערכת
- איפוס נתונים: מחק טופלו / ישנים / הכל (עם אישור כפול)
- ניהול בניינים / קומות / שירותים / מכשירים (inline editing)
- Kiosk Templates — בניית סטים של כפתורים
- **ניהול שפות מרכזי** — מנהל קובע שפת קיוסק + שפת עובדים (גלובלי או פר-עובד)
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
| Worker | http://localhost:5173/cleaner |
| API | http://localhost:3001 |

---

## 🏷️ ניהול גרסאות

הפרויקט משתמש ב-**Semantic Versioning** + Git Tags + GitHub Releases.

### מעבר בין גרסאות
```bash
# חזרה לגרסה היציבה v1.0.0 (read-only snapshot)
git checkout v1.0.0

# חזרה לפיתוח שוטף
git checkout main

# לעבור לענף היציב (תמיד שומר גרסה מוכנה)
git checkout stable
```

### יצירת גרסה חדשה
```bash
git tag -a v1.1.0 -m "תיאור הגרסה"
git push origin v1.1.0

# עדכון ענף stable למצב הנוכחי
git checkout stable
git merge main
git push
```

### פיתוח פיצ'רים חדשים (מומלץ)
```bash
git checkout -b feature/some-feature
# עובדים עליו בנפרד, main נשאר יציב
git push -u origin feature/some-feature
```

### גרסאות קיימות
- **[v1.0.0](https://github.com/OriAha/toilet-monitor/releases/tag/v1.0.0)** — First stable release (core kiosk/worker/admin, real-time incidents, analytics, responsive UI)

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

## 🔒 אבטחה

| שכבה | מצב |
|------|-----|
| **Repository** | 🔒 Private — רק `OriAha` |
| **Collaborators** | 👤 רק הבעלים (admin) |
| **GitHub Secrets** | 🔐 `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY` (מוצפנים) |
| **Server access** | 🔑 SSH key בלבד (אין סיסמה) |
| **DB credentials** | 📁 ב-`.env.production` בשרת (לא ב-git) |
| **JWT secrets** | 📁 ב-`.env.production` בשרת (לא ב-git) |
| **SSL/TLS** | ✅ Let's Encrypt מ-end-to-end |
| **Rate limiting** | ✅ על דיווחים כפולים (409 Conflict) |

### המלצות
- הפעל [**2FA בחשבון GitHub**](https://github.com/settings/security) (אם לא כבר)
- שקול **Branch Protection** (דורש GitHub Pro) למניעת push ישיר ל-main
- סיבוב תקופתי של JWT secrets בשרת (כל כמה חודשים)

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

### iPad (Guided Access)
1. הגדרות → נגישות → Guided Access → הפעל
2. פתח Safari → נווט ל-URL הקיוסק
3. Triple-click כפתור הבית/Power → התחל Guided Access
4. שחרור: Triple-click + קוד סודי

---

## 💰 עלויות פיילוט

### לכל תא שירותים
| פריט | מחיר משוער |
|------|------------|
| טאבלט אנדרואיד 10" (Lenovo Tab M10 / Samsung A7) | 300–500 ₪ |
| Fully Kiosk Browser (רישיון חד פעמי) | ~25 ₪ |
| מדבקה/מסגרת לכיסוי כפתור הפעלה | 50–100 ₪ |
| כבל USB-C ומטען קבוע לקיר | 30–50 ₪ |

### שרת (משותף לכל הארגון)
| פריט | עלות |
|------|------|
| DigitalOcean Droplet (2 vCPU / 2GB RAM) | ~$12/חודש |
| DuckDNS | חינם |
| SSL (Let's Encrypt) | חינם |
| GitHub Actions (2,000 minutes/month) | חינם |

---

## 📂 מבנה פרויקט

```
Toilet/
├── .github/workflows/deploy.yml   — CI/CD
├── apps/
│   ├── server/                    — NestJS backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/          — JWT · bypass · cleaner login
│   │   │   │   ├── users/         — עובדים · check-in/out · שפות
│   │   │   │   ├── buildings/     — היררכיה ארגונית
│   │   │   │   ├── incidents/     — תקלות + bulk delete
│   │   │   │   ├── analytics/     — SLA · patterns · kiosk stats
│   │   │   │   └── kiosk/         — templates
│   │   │   └── main.ts
│   │   └── prisma/schema.prisma   — schema DB
│   └── web/                       — React frontend
│       └── src/modules/
│           ├── kiosk/             — /kiosk
│           ├── cleaner/           — /cleaner (עובד)
│           └── admin/             — /admin
├── packages/shared-types/         — TypeScript משותפים
├── scripts/deploy.sh              — production deploy
└── docker-compose.yml             — PostgreSQL local
```

---

## 🗺️ Roadmap

- [x] **v1.0.0** — Core stable release
- [ ] v1.1.0 — משוב חוזר והיסטוריית עובד
- [ ] v1.2.0 — התראות push לעובדים (FCM)
- [ ] v1.3.0 — דוחות PDF/CSV לייצוא
- [ ] v2.0.0 — תמיכה ב-multi-tenant (כמה ארגונים)

---

## 📄 License

Private project — לא מופץ לציבור.

**Contact:** [OriAha](https://github.com/OriAha) · DigitalOcean VPS: `188.166.163.75`
