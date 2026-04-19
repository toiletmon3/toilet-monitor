# 🚾 ToiletMon — Smart Restroom Monitoring System

מערכת ניטור שירותים חכמה עם 3 ממשקים: **קיוסק טאבלט**, **אפליקציית עובד**, ו**לוח בקרה למנהל**.
בנויה עם NestJS + React PWA + PostgreSQL, עם deploy אוטומטי לענן.

**גרסה נוכחית:** [`v1.0.8`](https://github.com/OriAha/toilet-monitor/releases/tag/v1.0.8) — Pricing doc for clients · SSL/HTTPS explanation · Kiosk live clock · Timezone fix

---

## 🌐 גישה מהירה — Production

### DuckDNS (HTTPS + SSL — מומלץ)
| ממשק | קישור |
|------|-------|
| 🖥️ **Admin** | [https://toiletcleanpro.duckdns.org/admin](https://toiletcleanpro.duckdns.org/admin) |
| 👷 **Worker** | [https://toiletcleanpro.duckdns.org/cleaner](https://toiletcleanpro.duckdns.org/cleaner) |
| 🔌 **API** | [https://toiletcleanpro.duckdns.org/api](https://toiletcleanpro.duckdns.org/api) |

> **Kiosk** — כל טאבלט עובד עם URL ייחודי לפי קוד המכשיר: `/kiosk/{deviceCode}`
> ניתן לראות את כל כתובות הקיוסקים תחת **Admin → Settings → Kiosks**

### IP ישיר (DigitalOcean)
| ממשק | קישור |
|------|-------|
| 🖥️ **Admin** | [http://188.166.163.75/admin](http://188.166.163.75/admin) |
| 👷 **Worker** | [http://188.166.163.75/cleaner](http://188.166.163.75/cleaner) |
| 🔌 **API** | [http://188.166.163.75/api](http://188.166.163.75/api) |

> **Admin** — כניסה עם מייל + סיסמה
> **Worker** — כניסה עם ת.ז בלבד
> **Kiosk** — כל טאבלט מוגדר ישירות ע"י מנהל (דרך מצב "צוות" בקיוסק)

---

## 🔑 פרטי כניסה

| ממשק | פרטים |
|------|--------|
| Admin | `admin@demo.com` / `Admin123!` |
| Worker | ת.ז: `123456789` · `234567890` · `345678901` |
| Kiosk | `/kiosk/{deviceCode}` — מוגדר ע"י מנהל דרך מצב "צוות" |

---

## 🏗️ ארכיטקטורה

```
apps/
  web/      → React 18 + Vite + Tailwind CSS (PWA)
              ├── /kiosk/{deviceCode}  — טאבלט בשירותים (כל מכשיר עם URL ייחודי)
              ├── /cleaner             — אפליקציית עובד (משימות + check-in / check-out)
              └── /admin               — לוח בקרה מנהל (Dashboard, Analytics, Settings)
  server/   → NestJS REST API + WebSocket (Socket.io)
              ├── Auth (JWT + Refresh Tokens · Kiosk device auth)
              ├── Buildings / Floors / Restrooms / Devices (online/offline tracking)
              ├── Incidents (תקלות + סטטוס + הקצאה + Bulk delete)
              ├── Analytics (SLA · דפוסים · עומסים · ביצועי עובדים)
              ├── Users (עובדים · מנהלים · check-in/checkout · שפות · ת.ז לקיוסק)
              └── Kiosk Templates (Classic · Neon · כפתורים מותאמים)
packages/
  shared-types/ → TypeScript interfaces משותפות
```

**Stack:**
- **Backend:** NestJS · Prisma ORM · PostgreSQL · JWT · Socket.io
- **Frontend:** React 18 · Vite · Tailwind CSS v4 · PWA (Workbox) · react-i18next
- **Infrastructure:** DigitalOcean VPS · Nginx · PM2 · Let's Encrypt SSL · DuckDNS
- **CI/CD:** GitHub Actions → SSH deploy → PM2 restart

---

## ✨ תכונות

### 📋 Kiosk (טאבלט בשירותים)
- **URL ייחודי לכל טאבלט** (`/kiosk/{deviceCode}`) — אין בחירה ידנית של מיקום
- **הגדרת מיקום ע"י מנהל** — דרך מצב "צוות" בקיוסק + אימות ת.ז מנהל
- שני תבניות עיצוב (Kiosk Templates): **Classic** (זכוכית) ו-**Neon** (שחור + ציאן)
- כל טאבלט יכול לקבל תבנית עיצוב שונה
- דיווח תקלות בלחיצה אחת — כפתורים מותאמים אישית
- **בחירת שפה בולטת בראש הדף** (עברית / English)
- **שעון חי + תאריך** בכותרת — לפי אזור זמן ארגוני, מתעדכן אוטומטית
- **אייקונים וטקסט גדולים** למילוי אופטימלי של הכפתורים
- כניסת צוות ניקוי דרך הקיוסק (ת.ז מוצגת כמספרים) + סגירה אוטומטית אחרי 20 שניות
- **שגיאה ברורה** אם ת.ז לא קיימת בעת check-in
- **"שלום [שם]"** אחרי כניסה — מציג שם אמיתי של העובד
- משוב חיובי — נשמר בלוג ללא יצירת משימה
- סטטיסטיקות אמיתיות: כמות דיווחים שבועית + זמן תגובה ממוצע
- **מסך "כבר בטיפול"** לדיווחים חוזרים (rate limiting)
- Offline mode — שמירה ב-IndexedDB, סנכרון אוטומטי
- **תואם לגמרי ל-iPad Safari / iOS** (Dynamic Viewport Height)

### 👷 Worker (עובד)
- **ממשק בשם ניטרלי "עובד"**
- כניסה עם ת.ז בלבד (הצג/הסתר ספרות)
- שעון חי + תאריך בכותרת — **לפי אזור זמן ארגוני**
- 2 רשימות: **"בטיפולי"** + **"ממתינות לטיפול"**
- **"החזר משימה לתור"** (un-assign)
- **כפתור "יציאה מעבודה" (Check-out)** — רישום סוף משמרת
- עדכונים בזמן אמת (WebSocket)
- עובדים רואים רק תקלות של הבניין שלהם
- **הודעות שגיאה ברורות** — הבחנה בין "לא נמצא" ל"מושבת"
- **תרגום מלא עברית / אנגלית** (כולל כפתורים, toasts, שעון)
- גלילה חלקה בכל הפלטפורמות (iOS / Android / Desktop)

### 🖥️ Admin (מנהל)
- **ממשק מתורגם לחלוטין** — עברית / אנגלית בכל שדה, כפתור ו-toast
- שעון חי + תאריך — **לפי אזור זמן ארגוני**
- **ממשק רספונסיבי מלא** — sidebar מתקפל בדסקטופ, drawer במובייל
- **ניהול מנהלים:** רשימה לפי מייל · הוספת מנהל חדש · עריכת שם/מייל/ת.ז · שינוי סיסמה עצמית בלבד
- **ת.ז למנהל** — מאפשרת אימות בקיוסק להגדרת מיקום טאבלט
- **פאנל "כרגע בעבודה"** — מי עשה check-in היום
- Dashboard עם סיכום תקלות פעילות + **רשימת טאבלטים לא מחוברים**
- **סינון לפי בניין** בדשבורד
- תקלות מחולקות לסקציות: **בטיפול** / **ממתין** / **טופלו** / **משובים חיוביים**
- עדכונים בזמן אמת (WebSocket) + toast לתקלה חדשה
- Analytics מלא: SLA · תדירות · דפוסים · עומסים שעתיים · לפי יום · ביצועי עובדים
- **עריכת פרטי עובד** (שם · ת.ז · טלפון) דרך modal
- **השבתה/הפעלה של עובד** — חוסם כניסה למערכת
- איפוס נתונים: מחק טופלו / ישנים / הכל (עם אישור כפול)
- ניהול בניינים / קומות / שירותים / מכשירים (inline editing)
- **מעקב מצב טאבלטים** — online/offline + זמן heartbeat אחרון
- **Kiosk Templates** — Classic ו-Neon מובנים + יצירת תבניות מותאמות
- **הגדרות שפה ואזור זמן ארגוני:**
  - שפת קיוסק גלובלית / שפת עובדים (גלובלי או פר-עובד)
  - **אזור זמן** (21 מדינות) — משפיע על שעון המנהל, העובד והקיוסק
- **כתובות URL לכל הממשקים** + העתקה בלחיצה
- Dark / Light mode

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
| Worker | http://localhost:5173/cleaner |
| API | http://localhost:3001 |

---

## 🏷️ ניהול גרסאות

הפרויקט משתמש ב-**Semantic Versioning** + Git Tags + GitHub Releases.

### מעבר בין גרסאות
```bash
# חזרה לגרסה יציבה
git checkout v1.0.5

# חזרה לפיתוח שוטף
git checkout main
```

### יצירת גרסה חדשה
```bash
git tag -a v1.0.6 -m "תיאור הגרסה"
git push origin v1.0.6
```

### גרסאות קיימות
- **[v1.0.8](https://github.com/OriAha/toilet-monitor/releases/tag/v1.0.8)** — Client pricing document (HTML + MD) with infrastructure costs, SSL explanation, and pilot example
- **[v1.0.7](https://github.com/OriAha/toilet-monitor/releases/tag/v1.0.7)** — Live clock in kiosk · Critical timezone persistence fix (NestJS route order bug) · Kiosks auto-pickup timezone changes every 5 min
- **[v1.0.6](https://github.com/OriAha/toilet-monitor/releases/tag/v1.0.6)** — Add Poland/Bulgaria timezones · Delete device button in settings
- **[v1.0.5](https://github.com/OriAha/toilet-monitor/releases/tag/v1.0.5)** — Full i18n (all interfaces) · Org timezone setting · Admin permissions & ID for kiosk · Device offline tracking
- **[v1.0.4](https://github.com/OriAha/toilet-monitor/releases/tag/v1.0.4)** — Dashboard filters · Device online/offline · Kiosk templates (Classic/Neon) · Full i18n for analytics/settings/kiosk pages
- **[v1.0.3](https://github.com/OriAha/toilet-monitor/releases/tag/v1.0.3)** — Admin management · Kiosk device assignment · Admin ID for kiosk auth
- **[v1.0.2](https://github.com/OriAha/toilet-monitor/releases/tag/v1.0.2)** — Error on wrong kiosk ID · Worker name greeting
- **[v1.0.1](https://github.com/OriAha/toilet-monitor/releases/tag/v1.0.1)** — Kiosk UX fixes · Language selector · Icon sizing
- **[v1.0.0](https://github.com/OriAha/toilet-monitor/releases/tag/v1.0.0)** — First stable release

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
| **Admin permissions** | ✅ מנהל יכול לשנות רק את הסיסמה שלו עצמו |

### המלצות
- הפעל [**2FA בחשבון GitHub**](https://github.com/settings/security) (אם לא כבר)
- שקול **Branch Protection** (דורש GitHub Pro) למניעת push ישיר ל-main
- סיבוב תקופתי של JWT secrets בשרת (כל כמה חודשים)

### 📋 גיבוי ונגישות — חובה לקרוא
👉 **[docs/BACKUP_AND_ACCESS.md](docs/BACKUP_AND_ACCESS.md)** — רשימת כל הנכסים הקריטיים (DigitalOcean, DuckDNS, SSH keys, DB backups) ואיך לגבות אותם

### 💰 עלויות ותמחור ללקוח
👉 **[docs/PRICING.md](docs/PRICING.md)** — פירוט עלויות תשתית, חומרה, מודלי תמחור ודוגמת פיילוט

---

## 📱 הגדרת טאבלט Kiosk

### שלב 1 — הגדרת מיקום הטאבלט
1. פתח `https://toiletcleanpro.duckdns.org/kiosk/{deviceCode}` בטאבלט
2. לחץ **"צוות"** → הכנס ת.ז של מנהל → בחר "הגדר שירותים לטאבלט זה"
3. בחר בניין / קומה / שירותים → שמור

> ת.ז של מנהלים מוגדרת תחת **Admin → Workers → Admins → Edit**

### שלב 2 — נעילת המכשיר

**Android — Fully Kiosk Browser (מומלץ):**
1. הורד מ-Play Store: **Fully Kiosk Browser & App Lockdown**
2. הגדר URL: `https://toiletcleanpro.duckdns.org/kiosk/{deviceCode}`
3. הפעל `Kiosk Mode` — נועל את המכשיר לאפליקציה בלבד
4. הגדר `Motion Detection` לכיבוי מסך בחוסר פעילות

**Android — Screen Pinning (חינם):**
1. הגדרות → נגישות → Screen Pinning → ON
2. פתח Chrome → נווט ל-URL הקיוסק
3. לחץ Recent Apps → Pin
4. שחרור: Back + Recent יחד (3 שניות)

**iPad — Guided Access:**
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
│   │   │   │   ├── auth/          — JWT · kiosk device auth · cleaner login
│   │   │   │   ├── users/         — עובדים · מנהלים · check-in/out · שפות · timezone
│   │   │   │   ├── buildings/     — בניינים · מכשירים · offline detection · templates
│   │   │   │   ├── incidents/     — תקלות + bulk delete
│   │   │   │   └── analytics/     — SLA · patterns · kiosk stats · i18n data
│   │   │   └── main.ts
│   │   └── prisma/schema.prisma   — schema DB
│   └── web/                       — React frontend
│       └── src/modules/
│           ├── kiosk/             — /kiosk/{deviceCode}
│           ├── cleaner/           — /cleaner (עובד)
│           └── admin/             — /admin
├── packages/shared-types/         — TypeScript משותפים
├── scripts/deploy.sh              — production deploy
└── docker-compose.yml             — PostgreSQL local
```

---

## 🗺️ Roadmap

- [x] **v1.0.0** — Core stable release
- [x] **v1.0.1–v1.0.4** — UX fixes · templates · analytics · dashboard filters
- [x] **v1.0.5–v1.0.8** — Full i18n · timezone · admin permissions · device management · kiosk clock · client docs
- [ ] v1.1.0 — משוב חוזר והיסטוריית עובד
- [ ] v1.2.0 — התראות push לעובדים (FCM)
- [ ] v1.3.0 — דוחות PDF/CSV לייצוא
- [ ] v2.0.0 — תמיכה ב-multi-tenant (כמה ארגונים)

---

## 📄 License

Private project — לא מופץ לציבור.

**Contact:** [OriAha](https://github.com/OriAha) · DigitalOcean VPS: `188.166.163.75`
