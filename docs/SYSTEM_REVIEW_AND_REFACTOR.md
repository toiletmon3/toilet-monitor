# Toilet Monitor — מדריך סקירה, ניקוי, שכתוב ואבטחה של המערכת

> **מסמך פנימי לקלוד (working guide).** נכתב כדי לתת לי — הקלוד שיעבוד על הפרויקט בעתיד —
> תוכנית עבודה מסודרת: איך לבדוק את כל המערכת מקצה לקצה, איזה קוד למחוק, איך להפוך
> את הקוד לפשוט ומסודר יותר, איך לשכתב חלקים "נכון", ובעיקר — **אילו פרצות אבטחה
> קיימות היום ואיך לסגור אותן.**

## איך נבנה המסמך הזה (מתודולוגיה)

הממצאים כאן **אינם** ניחוש. הם תוצר של סקירה רב־סוכנית של הקוד (יולי 2026, branch
`claude/system-review-refactor-qbldax`):

1. **מיפוי** — 10 סוכנים קראו במקביל את כל תת־המערכות (auth, users, buildings, incidents,
   analytics+scheduler, events+push, email, sensors, web, infra) והחזירו מפה מבנית: קוד מת,
   כפילות, מורכבות, מקרי קצה.
2. **ביקורת אבטחה** — 9 סוכני אבטחה סרקו את הקוד לפי 9 מימדים (auth/authz, IDOR רב־ארגוני,
   endpoints ציבוריים, ולידציית קלט, WebSocket, סודות/deploy, rate-limiting, אבטחת frontend,
   ותקינות/מקרי קצה). התקבלו **73 ממצאים** עם הפניות מדויקות לקובץ:שורה וקוד מצוטט.
3. **אימות אדוורסרי** — כל ממצא נשלח לסוכן שמנסה **להפריך** אותו מול הקוד. הרצה זו נקטעה
   באמצע עקב מגבלת session, אז חלק מהאימותים לא הושלמו. הממצאים הקריטיים ביותר
   (backdoor, IDOR, JWT fallback, no-role-guard) **אומתו ידנית מול הקוד** לפני הכתיבה ומסומנים ✅.

**⚠️ אזהרת שימוש:** המסמך תיאורי ומנחה — **אין לבצע ממנו שינויים אוטומטית.** מספרי שורות
עשויים לזוז; לפני כל תיקון פתח את הקובץ ואמת את הקוד. כל שינוי = PR נפרד + בדיקות + אימות
deploy (§8). ממצא שלא סומן ✅ — אמת בעצמך לפני שאתה משנה קוד על סמכו.

---

## תוכן עניינים

1. [מפת המערכת בקצרה](#1-מפת-המערכת-בקצרה)
2. [חלק א׳ — איך לבדוק את כל המערכת](#2-חלק-א--איך-לבדוק-את-כל-המערכת)
3. [חלק ב׳ — פרצות אבטחה (טבלת תקציר + פירוט לפי חומרה)](#3-חלק-ב--פרצות-אבטחה)
4. [חלק ג׳ — קוד למחיקה / לא רלוונטי](#4-חלק-ג--קוד-למחיקה--לא-רלוונטי)
5. [חלק ד׳ — ניקוי, פישוט וסידור הקוד](#5-חלק-ד--ניקוי-פישוט-וסידור-הקוד)
6. [חלק ה׳ — תקינות ומקרי קצה לא טריוויאליים](#6-חלק-ה--תקינות-ומקרי-קצה-לא-טריוויאליים)
7. [חלק ו׳ — סדר עבודה מומלץ (Roadmap)](#7-חלק-ו--סדר-עבודה-מומלץ-roadmap)
8. [נספח — Checklist מהיר](#8-נספח--checklist-מהיר)

---

## 1. מפת המערכת בקצרה

```
apps/
  server/   NestJS 11 + Prisma 5 + Passport-JWT + Socket.io   (multi-tenant by orgId)
    src/modules/{auth,users,buildings,incidents,analytics,events,scheduler,push,email,sensors}
    src/common/{guards,decorators,locale}
  web/      React 19 + Vite 6 + Tailwind v4 + TanStack Query + Zustand + i18next + PWA
    src/modules/{admin,cleaner,kiosk}  src/lib/{api,socket,push,offline,export}
packages/shared-types
scripts/{deploy.sh,server-setup.sh,nginx-watchdog.sh}   .github/workflows/deploy.yml
```

**מודל הרשאות (Prisma `Role`):** `SUPER_ADMIN, ORG_ADMIN, MANAGER, PROPERTY_MANAGER,
SHIFT_SUPERVISOR, CLEANER`.

**עמוד השדרה של האבטחה:** `JwtAuthGuard` רשום כ־`APP_GUARD` גלובלי
(`apps/server/src/app.module.ts:42`) → **הכל מוגן כברירת מחדל**, אלא אם `@Public()`. זה טוב.
**אבל** יש שתי חולשות מבניות שמהן נובעות רוב הפרצות:
- **אין שכבת הרשאה לפי תפקיד** (אין `RolesGuard`, אין `@Roles`). כלומר: "מאומת" = "אדמין".
- **כמעט אין בדיקות בעלות (org-ownership)** במוטציות. כלומר: כל id → כל ארגון (IDOR).

מנקה מקבל token בקלות (login עם ת"ז בלבד, בלי סיסמה) — ולכן שתי החולשות האלה יחד הופכות
כל מנקה לאדמין־על אפקטיבי חוצה־ארגונים.

---

## 2. חלק א׳ — איך לבדוק את כל המערכת

### 2.1 הכנה מקומית
```bash
pnpm install                              # workspace root (pnpm 9)
docker compose up -d db redis             # Postgres 16 + Redis 7
cd apps/server && cp .env.example .env     # ודא DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET, CRON_SECRET, VAPID_*
npx prisma migrate dev                    # migrations + generate
npx prisma db seed                        # נתוני דמו (prisma/seed.ts)
```
> ⚠️ **אף פעם** `prisma db push --accept-data-loss` על production — מוחק טבלאות (CLAUDE.md).

### 2.2 בדיקות סטטיות (typecheck) — חובה לפני push
```bash
cd apps/server && npx tsc --noEmit
cd ../web      && npx tsc -b              # tsc -b, לא רק --noEmit! (project references)
```
זכור (CLAUDE.md): `sw.ts` מוחרג מ־`tsconfig.app.json`; קסטים `.buffer as ArrayBuffer` ב־TS5.

### 2.3 בדיקות אוטומטיות (Backend)
**מצב נוכחי: כיסוי ≈ 0** — רק `app.controller.spec.ts` ו־`test/app.e2e-spec.ts` (placeholder).
```bash
cd apps/server
npx jest                                  # unit
npx jest --config test/jest-e2e.json      # e2e
```
המקומות ששבורים עכשיו (§3, §6) הם בדיוק מה שאין לו בדיקות. ראה §2.6 לרשימת בדיקות רגרסיה לכתוב.

### 2.4 בדיקות Frontend
```bash
cd apps/web && npx tsc -b && pnpm build && pnpm dev
```
Smoke ידני לכל flow:
| Flow | מסלול | לוודא |
|------|-------|-------|
| קיוסק | `/kiosk/:deviceCode` | scroll-lock פעיל, דיווח, אישור, offline sync |
| מנקה | `/cleaner` | login ת"ז, קבלת משימות, resolve |
| מפקח | `/supervisor` | login, מנקים פעילים, resolve |
| אדמין | `/admin` | login מייל+סיסמה, דשבורד, incidents, analytics, export |
| PWA | התקנה + push | subscribe, קבלת notification |

> **מדיניות scroll (הנחיית משתמש):** רק קיוסק נעול (`useScrollLock`). אסור `overflow:hidden`
> גלובלי ל־`html`/`body`. כל דף חדש גולל רגיל.

### 2.5 בדיקות אבטחה ידניות (עד שיש אוטומציה)
אלו ה־exploits מ־§3 — הם צריכים **להיכשל** אחרי התיקונים, ולעבור (להוכיח את הפרצה) עכשיו:
```bash
BASE=http://localhost:3001/api

# 🔴 1) Backdoor — token אדמין מלא, אנונימי (§3.1)
curl -s $BASE/auth/admin-bypass | jq

# 🔴 2) Privilege escalation — token של CLEANER יוצר SUPER_ADMIN (§3.2)
curl -s -X POST $BASE/auth/cleaner/login -H 'Content-Type: application/json' -d '{"idNumber":"<cleaner-id>"}' | jq -r .accessToken   # -> $T
curl -s -X POST $BASE/users/admins -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
     -d '{"name":"x","email":"x@x.com","password":"x","role":"SUPER_ADMIN"}' | jq

# 🔴 3) Cross-tenant account takeover — שינוי סיסמת אדמין של ארגון אחר (§3.3)
curl -s -X PATCH $BASE/users/<victim-id-other-org>/password -H "Authorization: Bearer $T" \
     -H 'Content-Type: application/json' -d '{"password":"pwned"}'

# 🔴 4) IDOR — מחיקת building של ארגון אחר, כולל כל האירועים (§3.4)
curl -s -X DELETE $BASE/buildings/<building-id-other-org> -H "Authorization: Bearer $T"

# 🟠 5) דליפת roster חוצת-ארגונים, אנונימית (§3.9)
curl -s $BASE/push/diagnose | jq          # וגם: $BASE/buildings/kiosk-diagnose

# 🟠 6) Push abuse — התראה אמיתית לכל המכשירים בכל הארגונים (§3.10)
curl -s $BASE/push/test | jq

# 🟠 7) WebSocket cross-tenant (בדפדפן):
#      const s=io('http://localhost:3001'); s.emit('join:org',{orgId:'<other-org>'});
#      s.onAny((e,d)=>console.log(e,d))   // אמור לקבל incident:* של ארגון זר, כולל ת"ז
```
**כלים:** `pnpm audit` לתלויות; `git ls-files | grep -iE 'env|secret'` לוודא שאין סודות ב־git;
OWASP ZAP/Burp מול **staging בלבד** (לא production).

### 2.6 בדיקות רגרסיה אוטומטיות שכדאי לכתוב (e2e)
כל אחת צריכה לעבור **אחרי** התיקון:
```
✗ GET  /auth/admin-bypass                    → 404 (הוסר)
✗ POST /users/admins {role:SUPER_ADMIN} כ-CLEANER → 403
✗ PATCH /users/:foreignId/password           → 403/404 (org אחר)
✗ DELETE /buildings/:foreignId               → 404 (org אחר)
✗ PATCH /sensors/devices/:foreignId/config   → 404 (org אחר)
✗ GET  /analytics/* ?buildingId=<foreign>    → לא מחזיר נתונים של org אחר
✗ GET  /push/diagnose | /push/test | /buildings/kiosk-diagnose → 401/403
✗ WS join:org עם orgId זר                    → אין broadcasts
✓ happy-path (קיוסק/מנקה/מפקח/אדמין)          → עדיין עובד
```

### 2.7 Pre-push checklist מקוצר
1. `tsc --noEmit` (server) + `tsc -b` (web).
2. חבילה חדשה? `deploy.sh` מריץ `pnpm install --frozen-lockfile` לפני build.
3. שינוי schema? רק `prisma migrate` — אף פעם `db push`.
4. נגעת ב־endpoint/אבטחה? הרץ §2.5.
5. אחרי merge ל־main — **אמת deploy** (CLAUDE.md > Post-merge verification).

---

## 3. חלק ב׳ — פרצות אבטחה

### טבלת תקציר (מסודר לפי חומרה)

| # | חומרה | פרצה | קובץ עיקרי |
|---|-------|------|-----------|
| 3.1 | 🔴 CRITICAL ✅ | `GET /auth/admin-bypass` — token אדמין מלא לכל אנונימי | `auth.controller.ts:48` |
| 3.2 | 🔴 CRITICAL ✅ | אין הרשאות תפקיד — CLEANER יוצר SUPER_ADMIN (mass-assign `role`) | `users.controller.ts:30` |
| 3.3 | 🔴 CRITICAL ✅ | Cross-tenant account takeover — `changePassword` על כל userId | `users.service.ts:250` |
| 3.4 | 🔴 CRITICAL ✅ | IDOR — `deleteBuilding/Floor/Restroom` מוחק נתוני ארגון אחר | `buildings.service.ts:541` |
| 3.5 | 🔴 CRITICAL ✅ | WebSocket ללא אימות — דליפת אירועים חוצת־ארגון (כולל ת"ז) | `events.gateway.ts:31` |
| 3.6 | 🟠 HIGH ✅ | JWT `?? 'fallback-secret'` — זיוף token אם `JWT_SECRET` ריק | `jwt.strategy.ts:15` |
| 3.7 | 🟠 HIGH | Cleaner login עם ת"ז בלבד, חוצה־ארגון, brute-forceable | `auth.service.ts:28` |
| 3.8 | 🟠 HIGH | IDOR — `deleteUser`/`updateAdmin`/`toggle`/`assignBuilding`/`deleteDevice`/`adminUpdate` | `users.service.ts`,`buildings`,`incidents` |
| 3.9 | 🟠 HIGH | דליפת roster/מפת תשתית חוצת־ארגון — `push/diagnose`, `kiosk-diagnose` | `push.service.ts:148` |
| 3.10 | 🟠 HIGH | `GET /push/test` — התראה אמיתית לכל המכשירים בכל הארגונים | `push.controller.ts:41` |
| 3.11 | 🟠 HIGH | IDOR ב־analytics — `buildingId/floorId/restroomId` מפילים את סינון ה־org | `analytics.service.ts:54` |
| 3.12 | 🟠 HIGH | אין rate-limiting בכלל (brute-force + DoS + bcrypt amplification) | `app.module.ts` |
| 3.13 | 🟠 HIGH | `ValidationPipe.whitelist` חסר־שיניים — אין DTO אמיתי | `main.ts:18` |
| 3.14 | 🟠 HIGH | אין fail-fast על env — סודות חסרים מדרדרים לברירת־מחדל לא בטוחה | `app.module.ts:20` |
| 3.15 | 🟠 HIGH ✅ | Frontend מפעיל את ה־backdoor אוטומטית ב־`/admin` | `AdminLayout.tsx:87` |
| 3.16 | 🟡 MEDIUM | `reassignDevice` ציבורי — חטיפת קיוסק + ביטול חסימות | `auth.controller.ts:54` |
| 3.17 | 🟡 MEDIUM | פעולות incident ציבוריות סומכות על `cleanerIdNumber` מהגוף (impersonation) | `incidents.controller.ts:135` |
| 3.18 | 🟡 MEDIUM | `POST /incidents/sync` — `body:any`, batch לא חסום → DB flood | `incidents.service.ts:127` |
| 3.19 | 🟡 MEDIUM | `updateOrgSettings`/`updateTemplate` — spread של גוף לתוך Prisma (mass-assign) | `users.service.ts:28` |
| 3.20 | 🟡 MEDIUM | `CRON_SECRET` ב־query string → נכתב ל־nginx logs | `email.controller.ts:124` |
| 3.21 | 🟡 MEDIUM | אין helmet/HSTS/CSP/X-Frame-Options | `main.ts:9` |
| 3.22 | 🟡 MEDIUM | קבצי סוד/גיבויי DB נכתבים 0644 ולא נמחקים | `deploy.sh:57` |
| 3.23 | 🟡 MEDIUM | Push subscribe ציבורי עם `userId`/`orgId` מהגוף (hijack) | `push.controller.ts:17` |
| 3.24 | 🟡 MEDIUM | Kiosk auto-create devices + sensor report ציבוריים → זבל/flood | `auth.service.ts:90`,`sensors.service.ts:52` |
| 3.25 | 🟡 MEDIUM | Tokens ב־localStorage (קריאים לכל script/XSS) | `api.ts:18` |
| 3.26 | 🟡 MEDIUM | CSV/Formula injection ב־export ל־Excel | `export.ts:50` |
| 3.27 | 🟢 LOW | אין rotation/revocation ל־refresh token; אין logout | `auth.service.ts:189` |
| 3.28 | 🟢 LOW | `JWT_REFRESH_SECRET` חסר → refresh נחתם ב־`JWT_SECRET` (tokens ניתנים להחלפה) | `auth.service.ts:167` |
| 3.29 | 🟢 LOW | דליפת מטא־מפתח SSH ל־`GITHUB_STEP_SUMMARY` | `deploy.yml:61` |

---

### 🔴 CRITICAL

#### 3.1 ✅ Backdoor ציבורי: `GET /api/auth/admin-bypass` מחזיר token אדמין מלא ללא סיסמה
**קוד:** `auth.controller.ts:48-52` (`@Public() @Get('admin-bypass')`) → `auth.service.ts:49-56`
`getAdminBypassToken()` מוצא `findFirst({ role: { in:['ORG_ADMIN','SUPER_ADMIN','MANAGER'] }, isActive:true })`
ומחזיר `generateTokens(admin)` — access + refresh 7 ימים + שם/מייל/ת"ז/orgId.
**Exploit:** `curl https://toiletcleanpro.duckdns.org/api/auth/admin-bypass` → שליטה מלאה על הארגון.
**תיקון:** **מחק** את ה־endpoint ואת `getAdminBypassToken()`, וגם את הקריאה מה־frontend (§3.15).
אם חייבים dev-shortcut: `if (NODE_ENV !== 'production')` + סוד משותף, ולעולם לא `@Public()`.

#### 3.2 ✅ אין הרשאות תפקיד — CLEANER יכול ליצור SUPER_ADMIN
**קוד:** אין `RolesGuard`/`@Roles` בכל ה־repo; הגארד היחיד הוא `JwtAuthGuard` גלובלי.
ב־`users.controller.ts:30 createAdmin` הבדיקה היחידה היא `if (user.role === 'PROPERTY_MANAGER')` —
כל שאר התפקידים (כולל CLEANER) עוברים. `users.service.ts:113` כותב `role: dto.role as any` ישר ל־Prisma.
**Exploit:** login מנקה (ת"ז בלבד) → `POST /users/admins {role:'SUPER_ADMIN'}` → חשבון על בארגון.
ה־`whitelist` לא עוזר כי ה־`@Body` הוא interface שנמחק ב־runtime (§3.13).
**תיקון:** בנה `RolesGuard` + `@Roles()`, רשום כ־`APP_GUARD` שני, וסמן כל endpoint אדמיני. בנוסף
ולידציה של ה־role המוענק (`@IsIn([...])`) ואיסור הענקת role גבוה מזה של המבקש. ראו §5.1.

#### 3.3 ✅ Cross-tenant account takeover — `changePassword` על כל userId
**קוד:** `users.service.ts:250 changePassword(userId, pw)` — `update({ where:{ id } })` ללא org.
המגן־כביכול `assertCanManageUser` (`:125`) **הוא no-op לכל תפקיד שאינו PROPERTY_MANAGER**
(`if (requester.role !== 'PROPERTY_MANAGER') return;`) — ואף אינו בודק org גם עבור PM.
**Exploit:** משתמש מאומת כלשהו מאתר userId של אדמין (דולף מ־`/auth/me`, `/users`, verify-*, diagnose)
ושולח `PATCH /users/<victimId>/password {password:'x'}` → מתחבר בתור אותו אדמין, **בכל ארגון**.
**תיקון:** `assertCanManageUser` חייב לאכוף `target.orgId === requester.orgId` **לכל התפקידים**,
וכל מוטציה על user תסונן ב־`where:{ id, orgId }`. אותו טיפול ל־`deleteUser`, `updateAdmin`,
`updateWorker`, `toggleActive`, `assignBuilding`, `setManagedProperties`, `updateLang` (§3.8).

#### 3.4 ✅ IDOR — מחיקות מדורגות חוצות־ארגון
**קוד:** `buildings.service.ts` — `deleteBuilding(:541)`, `deleteFloor(:554)`, `deleteRestroom(:567)`
מקבלים id ומריצים `delete` **בלי `orgId`**. כל אחד מוחק קודם את כל האירועים+פעולות שתחת המשאב.
**Exploit:** `DELETE /buildings/<foreign-id>` (עם token של כל משתמש, גם מנקה) → מחיקת בניין של
ארגון אחר + מחיקת כל היסטוריית האירועים שלו.
**תיקון:** בכל מוטציה — ודא בעלות דרך היררכיית ה־org לפני הפעולה:
```ts
const b = await this.prisma.building.findFirst({ where: { id, orgId } });
if (!b) throw new NotFoundException();          // 404, לא 403 — לא מדליף קיום
// floor:   where:{ id, building:{ orgId } }
// restroom:where:{ id, floor:{ building:{ orgId } } }
```
רכז ב־helper `assertOwnedByOrg(...)`. ראו גם §6.5 (עטיפה בטרנזקציה).

#### 3.5 ✅ WebSocket ללא אימות — דליפת אירועים חוצת־ארגון (כולל ת"ז לאומית)
**קוד:** `events.gateway.ts` — `cors:{origin:'*'}` (`:14`), `handleConnection` (`:23`) מקבל כל socket
ללא JWT, ו־`handleJoinOrg`/`handleJoinRestroom` (`:31`,`:40`) עושים `client.join(data.orgId)` —
**מזהה מהלקוח, בלי בדיקה.**
**Exploit:** כל אתר/סקריפט/מנקה של ארגון A פותח socket, שולח `join:org` עם orgId זר, ומקבל את כל
ה־broadcasts של אותו ארגון: `incident:created/updated/resolved` (incidents.service) ו־`incident:escalated`
(scheduler). כל payload הוא ה־incident המלא עם `INCIDENT_INCLUDE` → כולל `actions.user.idNumber`
ו־`assignedCleaner.idNumber` — **תעודת זהות** (שדה חובה, `schema.prisma:195`) + שמות ומיקומים.
**תיקון:** אמת JWT ב־handshake (`client.handshake.auth.token` → `JwtService.verify` → אחרת
`client.disconnect()`), שמור `client.data.orgId` **מה־token**, וב־join התעלם מהקלט והשתמש רק ב־orgId
המאומת (ואמת ש־restroom שייך ל־org). `cors.origin` → רשימה מפורשת, לא `*`.

---

### 🟠 HIGH

#### 3.6 ✅ JWT fallback secret קבוע
**קוד:** `jwt.strategy.ts:15` — `secretOrKey: config.get('JWT_SECRET') ?? 'fallback-secret'`.
ה־signing (`auth.module.ts:15`) ללא fallback → אי־התאמה שקטה.
**Exploit:** אם `JWT_SECRET` ריק בזמן boot (env לא נטען, טעות rotation, `deploy.sh` מפיל שורות
"garbage" בשקט), אימות נעשה מול המחרוזת הידועה — תוקף חותם `{sub, role:'SUPER_ADMIN'}` ומתקבל.
**תיקון:** fail-fast — `const s = config.get('JWT_SECRET'); if (!s) throw new Error('JWT_SECRET required');`
אותו דבר ל־`JWT_REFRESH_SECRET`. הוסף env validation ב־boot (§3.14).

#### 3.7 Cleaner login — ת"ז בלבד, חוצה־ארגון, brute-forceable
**קוד:** `auth.service.ts:28 loginCleaner(orgId?, idNumber)` — `orgId` אופציונלי; בלעדיו `findFirst`
מתאים לכל cleaner בכל tenant. אין סיסמה. `default-org` הציבורי מספק orgId תקף חינם.
**Exploit:** ת"ז ישראלית = 9 ספרות עם check-digit (~9M) → בלי rate-limit (§3.12) ובעזרת verify-*
(§3.9) המרחב ניתן למניה → השתלטות חשבון.
**תיקון:** `orgId` חובה + סינון תמידי לפיו; גורם שני (PIN/קוד ארגון); rate-limit קשיח + lockout;
תשובות/עיכובים אחידים למניעת enumeration.

#### 3.8 IDOR נוסף — מוטציות/קריאות ללא org-scoping
כל אלו מקבלים id ופועלים בלי בדיקת org (verify מול הקוד לפני תיקון):
- `users.service.ts` — `deleteUser(:302)`, `updateWorker/updateAdmin/toggleActive/assignBuilding(:273)`,
  `setManagedProperties(:144)`, `updateLang(:43, ללא assert בכלל)`.
- `buildings.service.ts` — `updateBuilding(:516)`, `updateFloor/updateRestroom(:520)`, `deleteDevice(:575)`,
  `updateProperty/deleteProperty/assignBuildingToProperty(:52)`, kiosk-templates `update/delete/assign(:213)`,
  `createFloor/createRestroom/registerDevice(:101)` (הצמדת ילד ל־parent של ארגון אחר).
- `incidents.service.ts` — `adminUpdate(:295)` (עדכון/שיוך אירוע של ארגון אחר; גם `assignedCleanerId` לא מסונן).
- `sensors.service.ts` — `updateConfig(:97)` (כיוונון סנסור זר), `restroomSummary(:195)` (קריאת נתוני סנסור זר).
**תיקון:** אותו דפוס כמו §3.4 — helper בעלות אחיד + `where` מסונן־org בכל מוטציה/קריאה לפי id.

#### 3.9 דליפת roster ומפת תשתית חוצת־ארגון (אנונימית)
**קוד:** `push.service.ts:148 diagnose` (`@Public`, push.controller.ts:33) → כל המשתמשים הפעילים
**בכל הארגונים**: שם, role, בניין, פלטפורמת מכשיר, זמני subscription. `buildings.service.ts:377
kioskDiagnose` (`@Public`, controller:174) → כל Device עם השרשרת restroom→floor→building + orgId
+ templates + host/heartbeat. `auth.service.ts:490 default-org` + `public-structure/:orgId` +
`issue-types/:orgId` → כל עץ המתקן.
**תיקון:** הסר `@Public` מ־diagnose/kiosk-diagnose, הוסף `JwtAuthGuard` + `@Roles('ORG_ADMIN')`, וסנן
`where:{ orgId: user.orgId }`. את endpoints הקיוסק האנונימיים כרוך ב־device/kiosk token במקום orgId חשוף.

#### 3.10 `GET /push/test` — התראה אמיתית לכל המכשירים בכל הארגונים
**קוד:** `push.controller.ts:41` (`@Public`) → `push.service.ts:179 sendTestToAll()` שולח web-push
אמיתי לכל ה־subscriptions בכל ה־tenants, ומחזיר שם+role לכל מכשיר.
**Exploit:** `curl` בלולאה → spam לכל טלפון + שריפת מכסת VAPID/FCM/APNs.
**תיקון:** `@UseGuards(JwtAuthGuard)` + `@Roles('ORG_ADMIN')`, שנה ל־POST, סנן ל־orgId, throttle.

#### 3.11 IDOR ב־analytics — פרמטרי מיקום מפילים את סינון ה־org
**קוד:** `analytics.service.ts:54 restroomScope` — כשמגיע `buildingId/floorId/restroomId`, מוחזר
filter **בלי** `orgId`. `AnalyticsController.scoped()` מגביל רק PROPERTY_MANAGER ולא מאמת שהמזהה שייך
ל־org. חל על issue-frequency, hourly, cleaners, sla, day-of-week, patterns, restroom-scores, overview,
וגם `getSummary(:62)`.
**Exploit:** משתמש מאומת שולח `?buildingId=<foreign>` → קורא ספירות אירועים, ביצועי מנקים, SLA של ארגון אחר.
**תיקון:** תמיד AND את `orgId` לתוך ה־filter המצומצם, למשל
`{ floor:{ buildingId: scope.buildingId, building:{ orgId } } }`.

#### 3.12 אין Rate Limiting בכלל
**קוד:** אין `@nestjs/throttler` (grep→0). אין body-size limit מפורש ב־`main.ts`.
**Exploit:** brute-force על `admin/login` (+ bcrypt CPU amplification על תהליך PM2 יחיד),
`cleaner/login`, `verify-*`; הצפת DB דרך `POST /incidents`, `/incidents/sync`, `/sensors/:code/report`;
push abuse. הכל מ־IP יחיד, ללא הגבלה.
**תיקון:** `ThrottlerModule.forRoot([{ ttl:60000, limit:60 }])` + `APP_GUARD: ThrottlerGuard`; `@Throttle
5/min` על login/verify; `app.use(json({ limit:'32kb' }))`. ודא `deploy.sh` מריץ `pnpm install`.

#### 3.13 `ValidationPipe.whitelist` חסר־שיניים — אין DTO אמיתי
**קוד:** `main.ts:18` מפעיל `whitelist:true, transform:true` אבל **אף `@Body` אינו class עם
class-validator** — כולם interface/inline (grep ל־`@IsString`/`*.dto.ts`→0). ה־metatype נמחק ב־runtime,
אז ה־pipe לא מסנן/ממיר/מאמת כלום. `class-validator` כבר תלות (`package.json:43`).
**Exploit:** כל צורת payload עוברת (טיפוסים שגויים, מפתחות עודפים, מערכים ענקיים) ישר לשירותים —
זהו הגורם המאפשר של §3.2, §3.18, §3.19.
**תיקון:** DTO classes אמיתיים לכל `@Body`, ואז `forbidNonWhitelisted:true`. התחל מהמסלולים הציבוריים
(`auth`, `incidents`, `sensors`, `push`).

#### 3.14 אין fail-fast על env
**קוד:** `app.module.ts:20 ConfigModule.forRoot()` ללא `validationSchema`. בשילוב `deploy.sh` הסלחני
(`set +e`, awk מפיל שורות, "continuing anyway") — סוד חסר לא מפיל את השרת.
**Exploit:** rotation שמפיל `JWT_SECRET`/`CRON_SECRET` → שרת רץ־אך־פרוץ (§3.6) עם deploy ירוק ו־smoke עובר.
**תיקון:** Joi/zod schema ב־`forRoot` שדורש נוכחות+אורך מינימלי של `JWT_SECRET`, `JWT_REFRESH_SECRET`,
`DATABASE_URL`, `CRON_SECRET`, `VAPID_*` (`abortEarly:false`) → Nest יסרב לעלות.

#### 3.15 ✅ Frontend מפעיל את ה־backdoor אוטומטית
**קוד:** `AdminLayout.tsx:85-100` — ב־mount על כל route `/admin`, אם אין `accessToken`, קורא
`GET /api/auth/admin-bypass` ושומר את ה־token.
**Exploit:** גלישה ל־`/admin` אנונימית → דשבורד אדמין מלא (§3.1).
**תיקון:** מחק את ה־`useEffect` הזה **וגם** את ה־endpoint בשרת; הסתמך רק על `/admin/login`.

---

### 🟡 MEDIUM (תקציר + תיקון)

- **3.16 `reassignDevice` ציבורי** (`auth.controller.ts:54`) — `PATCH /auth/kiosk/:code/restroom` מוחק
  `blockedDeviceCode` ומשייך מכשיר לכל restroom, ללא אימות (למרות הערת "admin-verified"). → דרוש JWT אדמין.
- **3.17 פעולות incident ציבוריות** (`incidents.controller.ts:126-149`) — acknowledge/resolve/return
  מזוהות רק ע"י `cleanerIdNumber` מהגוף → impersonation. → דרוש session מנקה מאומת לפעולות state-changing.
- **3.18 `POST /incidents/sync`** (`incidents.service.ts:127`) — `@Public`, `body:any`, לולאה ללא cap
  → DB flood + הזרקת `notes`/`performedAt` מזויפים. → DTO עם `@ArrayMaxSize`, device token, throttle.
- **3.19 mass-assignment דרך spread** — `updateOrgSettings(:28)` פורש גוף ל־settings JSON;
  `updateTemplate(:215)` פורש גוף ל־Prisma (אפשר `orgId` → re-parent טמפלט לארגון אחר). → בנה `data`
  מפורש מ־allowlist, אל תפרוש גוף לתוך Prisma, וסנן org.
- **3.20 `CRON_SECRET` ב־query** (`email.controller.ts:124`) — `?secret=` נכתב ל־nginx access.log. →
  header בלבד (`x-cron-secret`), `crypto.timingSafeEqual`.
- **3.21 אין security headers** (`main.ts:9`) — אין helmet/HSTS/CSP/X-Frame-Options (app+nginx). →
  `app.use(helmet({ hsts:{...} }))` + `add_header` בבלוקי 443 ב־`deploy.sh` (clickjacking/TLS-strip).
- **3.22 קבצי סוד לא מוקשחים** (`deploy.sh:57`) — `.env.production.bak.*` נוצרים 0644 ולא נמחקים;
  `pg_dump` plaintext ב־`/var/log/toilet/backups/`. → `umask 077`, `chmod 600`, pruning, תיקיית 0700.
- **3.23 `POST /push/subscribe` ציבורי** (`push.controller.ts:17`) — `userId`/`orgId` מהגוף → אפשר
  לצרף endpoint של תוקף ל־userId של קורבן ולקבל את ההתראות שלו. → גזור מ־JWT, לא מהגוף.
- **3.24 auto-create ציבורי** — `auth.service.ts:90` יוצר Device לכל `ROOM-<restroomId>` קיים;
  `sensors.service.ts:52` יוצר SENSOR ומכניס SensorEvent ללא הגבלה. → provisioning מאומת/token חתום + throttle.
- **3.25 Tokens ב־localStorage** (`api.ts:18` + 3 דפי login) — access **ו־refresh** ב־localStorage,
  קריאים לכל script (XSS/תלות זדונית/extension). → refresh ב־cookie httpOnly+Secure+SameSite; access
  בזיכרון בלבד; CSP `script-src 'self'`; אל תסמוך על `user` מ־localStorage להחלטות הרשאה.
- **3.26 CSV/Formula injection** (`export.ts:50`) — שמות מ־DB (מנקה/issue) נכתבים ל־xlsx בלי נטרול;
  ערך שמתחיל ב־`= + - @` מריץ נוסחה בפתיחה (HYPERLINK/WEBSERVICE/DDE). → prefix `'` לערכים כאלה בכל תא.

### 🟢 LOW

- **3.27 אין rotation/revocation ל־refresh** (`auth.service.ts:189`) — token דלוף תקף 7 ימים; אין logout. →
  jti + rotation + טבלת ביטול + endpoint logout.
- **3.28 `JWT_REFRESH_SECRET` חסר → נופל ל־`JWT_SECRET`** (`auth.service.ts:167`) — access ו־refresh
  הופכים בני־החלפה (אותו סוד, רק 7d). → fail-fast על שני הסודות (§3.6/§3.14).
- **3.29 דליפת מטא־מפתח SSH** (`deploy.yml:61`) — fingerprint/גודל/armor + `ssh -v` ל־STEP_SUMMARY. →
  הסר אחרי ייצוב, השאר רק pass/fail.

---

## 4. חלק ג׳ — קוד למחיקה / לא רלוונטי

| פריט | איפה | למה |
|------|------|-----|
| `admin-bypass` endpoint + `getAdminBypassToken()` + קריאת ה־frontend | `auth.controller.ts:48`, `auth.service.ts:49`, `AdminLayout.tsx:85` | backdoor (§3.1/§3.15) |
| ענף role `'PROPERTY_MANAGER'` ב־`loginAdmin` שלא תואם את שאר הרשימות | `auth.service.ts:17` | דיס-אינפורמציה/ענף מת (רשימות ה־role לא עקביות) |
| `trigger-daily-report` + `generate-report` + `generateReport()` | `email.controller.ts:88,122`, `daily-report.service.ts:79` | מפנים ל־workflow `daily-report.yml` שלא קיים; הדוח היומי רץ in-app (@Cron). נתיב מת + חשיפת מידע |
| בלוק הזרקת SMTP + scrubbing | `deploy.sh:144,64-66`, `deploy.yml:43` | DigitalOcean חוסם SMTP; עברנו ל־Gmail API. סודות SMTP מיוצאים ולא נצרכים |
| `propertyBuildingIds()` | `buildings.service.ts:68` | אין קוראים (orphaned) |
| `broadcastToAll()` | `events.gateway.ts:67` | אין קוראים |
| `device:heartbeat` handler | `events.gateway.ts:49` | no-op — שום דבר לא צורך את `client.data.deviceId` |
| listener ריק `incident:resolved` בקיוסק | `KioskPage.tsx:113` | no-op שגם מדליף socket listener בכל mount |
| `getKioskStats(restroomId)` שמעביר restroomId לנתיב שמסנן `buildingId` | `analytics.service.ts:325` | תמיד 0 — endpoint שבור למעשה |
| `SensorReportDto.firmware` | `sensors.service.ts:9` | מתקבל ולא נשמר/מוצג — מטעה |
| קסט `(device as any).sensorConfig` | `sensors.service.ts:93` | מיותר; מדכא type-checking |
| dead imports `BadRequestException` | `incidents.controller.ts:1`, `incidents.service.ts:1` | לא בשימוש |
| מחיקת IncidentAction ידנית לפני incident | `incidents.service.ts:340` | `onDelete:Cascade` כבר קיים (`schema.prisma:291`) — 2 round-trips מיותרים |
| הערת self-reference ב־`translate-name.ts` | `apps/web/src/lib/translate-name.ts:3` | copy-paste artifact |
| מסמכי שיווק/PDF | `docs/PRICING.*`, `ANALYTICS_COMPARISON.*`, `ECHO_SHOW_*`, `HARDWARE_*` | לא קוד; לשקול העברה ל־repo/Drive נפרד |
| `prisma/purge-building-stats.ts` | script חד־פעמי | להעביר ל־`scripts/oneoff/` או למחוק |
| `kioskTheme` בשירות ללא שדה מקביל ב־controller DTO | `users.service.ts:23` מול `users.controller.ts:59` | param מת בפועל |

> לפני מחיקה — `grep` לשימושים. **אל תמחק migrations.** לוגי connect/disconnect ב־`events.gateway.ts:24,28`
> → הורד ל־`debug` (רועש).

---

## 5. חלק ד׳ — ניקוי, פישוט וסידור הקוד

### 5.1 שכבת הרשאות תפקיד + טיפוס `AuthUser` (הבסיס לכל השאר)
בנה `RolesGuard` + `@Roles()` (§3.2) והגדר **מטריצת הרשאות** אחת כמקור אמת:

| Resource/Action | SUPER_ADMIN | ORG_ADMIN | MANAGER | PROPERTY_MANAGER | SHIFT_SUPERVISOR | CLEANER |
|---|---|---|---|---|---|---|
| org-settings write | ✓ | ✓ | – | – | – | – |
| buildings CRUD | ✓ | ✓ | ✓ | scoped | – | – |
| create admin (role ≤ שלי) | ✓ | ✓ | – | SHIFT only | – | – |
| incidents bulk-delete | ✓ | ✓ | ✓ | – | – | – |
| incident resolve/ack | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

והחלף את `@CurrentUser() user: any` בטיפוס משותף (מה־`JwtStrategy.validate`):
```ts
export interface AuthUser {
  id: string; orgId: string; role: Role; name: string;
  buildingId: string | null; propertyId: string | null; propertyIds: string[];
}
```
זה יחשוף באגי scoping בזמן קומפילציה.

### 5.2 DTOs אמיתיים במקום inline (§3.13)
לכל `@Body` — class עם `class-validator`; ואז `forbidNonWhitelisted:true`. עדיפות למסלולים ציבוריים.

### 5.3 ריכוז לוגיקת ה־scoping הכפולה (מקור לבאגי אבטחה)
- **PROPERTY_MANAGER scope** (`user.role==='PROPERTY_MANAGER' ? (...) : undefined`) משוכפל מילה־במילה ב־
  `users.controller.ts:16`, `buildings.controller.ts:17,27`, `incidents.controller.ts:65,108`. → helper אחד `propertyScope(user)`.
- **בלוק scoping של incidents** (effectiveBuildingId + pmNarrowed) מועתק verbatim בין `findAll` ל־`getUrgent`.
  → `resolveScopeForUser(user, query)`.
- **buildIncidentScopeWhere / withOrgSettingsDefaults / escalation-defaults** — ראה §5 של המפות; לרכז כל אחד.

### 5.4 ריכוז ה־Prisma `include` המקונן
`restroom→floor→building→organization` חוזר עשרות פעמים (auth ×4, sensors, incidents, buildings).
`incidents.service.ts` כבר עושה `INCIDENT_INCLUDE` — הרחב לדפוס משותף `DEVICE_LOCATION_INCLUDE`.
כמו כן: `getMe` מול payload של `generateTokens` בונים DTO משתמש כמעט זהה ידנית (וכבר נבדלים) → mapper אחד.

### 5.5 שגיאות HTTP נכונות במקום `throw new Error`
`users.service.ts:187,203` (checkin/checkout) → `NotFoundException`. `adminUpdate` מקבל `status`
לא־מאומת → `BadRequestException`. הוסף `ExceptionFilter` גלובלי שממפה שגיאות לא־צפויות ל־500 בלי stack ללקוח.

### 5.6 פיצול קבצים ענקיים
Backend: `analytics.service.ts` (790, `getOverview` לבד 260 שורות עם recompute כבד — §6),
`buildings.service.ts` (619 → KioskTemplateService/DeviceHeartbeatService), `incidents.service.ts:resolve`
(מערבב arrival tracking עם resolution), `daily-report.service.ts:gatherYesterdayData` (~170 שורות).
Frontend: `AdminSettings.tsx` (1286!), `AdminCleaners.tsx` (1205), `AdminDashboard.tsx` (831),
`CleanerCheckIn.tsx` (483, state machine בן 10 מצבים).

### 5.7 כפילות ענקית ב־frontend (חיסכון אמיתי)
- **ליבת הקיוסק** (load device/issues, online/offline+409, heartbeat 60s, wake-lock, auto-reload 6h,
  poll org-settings 5min) **מועתקת לכל 5 תבניות ה־theme** (~63 מופעים). → `useKioskCore()`/`KioskContainer`
  שמחזיק דאטה+דיווח+heartbeat+offline, והתבניות נשארות presentational.
- `CleanerPage` ו־`SupervisorPage` ~90% זהים → קומפוננטה אחת עם `canResolve`.
- `CleanerLoginPage` ו־`SupervisorLoginPage` כמעט byte-identical → `IdNumberLoginPage` עם `redirectTo`/icon.
- בלוק שמירת session (setItem tokens/user, queryClient.clear) ×3 → `persistSession(data)`.
- `useClock()`/`timeAgo()` ממומשים ב־4+ קבצים → ל־`lib/`. `IncidentCard` → shared. מפתח VAPID קשיח בשני מקומות → מקור יחיד.

### 5.8 עקביות guards
הסר `@UseGuards(JwtAuthGuard)` הכפולים (ה־guard כבר גלובלי) — למשל `users.controller.ts:63,69,75,138,144`.
משאירים `@Public()` רק היכן שבאמת ציבורי. פחות רעש = פחות סיכוי לפספס endpoint לא מוגן.

---

## 6. חלק ה׳ — תקינות ומקרי קצה לא טריוויאליים

> אלו באגים אמיתיים (לא אבטחה) שהסוכנים איתרו עם קובץ:שורה. **הבעיה הגדולה ביותר: timezone** —
> production רץ ב־UTC (אין `TZ`), ו־`daily-report.service` כבר עוקף זאת ידנית עם `toLocaleString`,
> אבל שאר הקוד משתמש ב־`new Date()`/`setHours(0,0,0,0)` הגולמיים.

### 6.1 באגי Timezone (UTC במקום Asia/Jerusalem)
- **Analytics לפי שעה/יום** (`analytics.service.ts:211,270`) — `getHours()`/`getDay()` על UTC. אירוע ב־01:30
  ירושלים (=22:30 UTC אתמול) נספר בשעה 22 וביום הקודם. → חשב wall-clock ב־tz הארגון.
- **גבול "היום"** (`analytics.service.ts:341,92`; `sensors.service.ts:118,165,197`; `incidents.getPositiveFeedback:347`)
  — `setHours(0,0,0,0)` = חצות UTC. בין חצות ירושלים לחצות UTC (2-3 שעות ראשונות של היום המקומי) "היום"
  עדיין לא נפתח → מציג 0/זנב של אתמול. → helper משותף `startOfDayInTz('Asia/Jerusalem')`.
- **checkout במשמרת לילה** (`users.service.ts:207`) — צ'ק־אין ב־20:00 וצ'ק־אאוט ב־02:30 ירושלים: ה־arrival
  לא נמצא (הוא לפני `todayStart` שכבר התגלגל ל־UTC חדש) → נוצרת רשומת checkout רפאים וה־arrival האמיתי
  נשאר `leftAt=null` לנצח. → חפש open shift לפי `leftAt:null` בחלון ~18ש, לא לפי civil-day.

### 6.2 מרוצי־תנאים וכפילויות
- **`checkin()` בלי dedup** (`users.service.ts:189`) — מכניס arrival בכל קריאה; מנקה/קיוסק חוזר יוצר 3 רשומות
  פתוחות. `getSummary` סופר **שורות** ולא מנקים ייחודיים (`analytics.service.ts:96`). → refresh open arrival
  קיים; `count distinct userId`.
- **`create()` dedup הוא TOCTOU** (`incidents.service.ts:52-71`) — read-then-write; שני דיווחים במקביל עם
  clientId שונה עוברים את בדיקת 2־הדקות ושניהם יוצרים OPEN. → partial unique index על `(restroomId, issueTypeId)
  WHERE status='OPEN'` או check+create בטרנזקציה.
- **`resolve()` sibling loop לא אטומי** (`incidents.service.ts:472`) — N updates רצופים; restart/נפילת DB באמצע
  → חלק OPEN בעוד ה־UI מציג "סגור". → `updateMany` + פעולות ב־`$transaction`.

### 6.3 מחיקות מדורגות לא־אטומיות + FK חסרים
`deleteBuilding/Floor/Restroom` (`buildings.service.ts:541+`) מוחקים אירועים ואז parent — לא בטרנזקציה →
מצב חלקי. בנוסף `CleanerArrival.restroomId/buildingId` הם עמודות String ללא `@relation`/index
(`schema.prisma:179-180`) → רשומות יתומות אחרי מחיקה. → עטוף ב־`$transaction`; שקול `onDelete:SetNull`/`Cascade` ב־schema.

### 6.4 ולידציית מספרים/תאריכים
`incidents.controller.ts:80` — `+limit`/`+offset` ללא גבולות: `?limit=abc` → `take:NaN` → 500;
`?limit=-1` → התנהגות שקטה. `create` עושה `new Date(reportedAt)` ללא ולידציה. → `@Query` DTO עם
`@Type(()=>Number) @IsInt() @Min @Max`, `@IsISO8601` לתאריכים.

### 6.5 אחרים
- **`adminUpdate` תמיד רושם `ACKNOWLEDGED`** (`incidents.service.ts:304`) — גם ל־RESOLVED; ו־`status` לא־מאומת
  ל־Prisma → 500. → גזור actionType מהסטטוס + ולידציית enum.
- **refresh interceptor בלי single-flight** (`api.ts:21`) — כמה 401 מקבילים → כמה refresh → rotation מבטל זה
  את זה → logout ספוראדי. → cache של ה־refresh promise; redirect לפי role.
- **N+1**: `getMismatches` (`users.service.ts:308`, count-per-arrival בלולאה), `kioskDiagnose`
  (`buildings.service.ts` findMany×2 per building), `scheduler.runEscalation` (טוען כל incident פתוח בכל org כל 60ש),
  `analytics.getOverview` (`computeRoomScores` ~180× על אותו דאטה ל־90 יום). → groupBy/aggregate + memoize.
- **`computeRoomScores` נרמול תלוי־קבוצה** (`analytics.service.ts:389`) — כשנקרא per-day הבסיס משתנה כל יום →
  ציונים יומיים לא ברי־השוואה; ימים ריקים מקבלים 100 → מנפח ממוצעים.

---

## 7. חלק ו׳ — סדר עבודה מומלץ (Roadmap)

גלים קטנים; כל גל = PR משלו + בדיקות (§2.6) + אימות deploy. **אל תערבב אבטחה עם refactor באותו PR.**

**גל 0 — עצירת דימום (CRITICAL, דחוף):** 3.1 (מחק backdoor + §3.15) · 3.6 (JWT fail-fast) ·
3.4 (+3.8 core IDOR) · 3.3 (`assertCanManageUser` אוכף org לכל תפקיד).
→ הרץ §2.5, ודא ש־1-4 נכשלים ו־happy-path עובד, אמת deploy.

**גל 1 — הרשאות (CRITICAL/HIGH):** 3.2 (RolesGuard + מטריצת §5.1) · 3.5 (WebSocket handshake auth) ·
3.9+3.10 (הקשח push/diagnose) · 3.11 (analytics org-scope).

**גל 2 — עמידות (HIGH):** 3.12 (throttler + body limit) · 3.13 (DTOs + forbidNonWhitelisted) ·
3.14 (env validation) · 3.7 (cleaner login: orgId חובה + 2FA + lockout).

**גל 3 — MEDIUM/LOW:** 3.16-3.29 לפי סדר — reassign, incident-actions auth, sync caps, mass-assign,
CRON header, helmet, file perms, localStorage→cookie, CSV neutralize, refresh rotation.

**גל 4 — תקינות (§6):** timezone helper משותף → החל בכל מקום · טרנזקציות במחיקות/resolve ·
dedup ב־checkin/create · ולידציית limit/date · N+1.

**גל 5 — ניקוי (§4,§5):** מחק קוד מת · טיפוס `AuthUser` · ריכוז scoping/include/defaults ·
פיצול קבצים ענקיים · `useKioskCore` וכפילויות frontend.

**גל 6 — רשת ביטחון:** בדיקות e2e (§2.6) ב־CI לפני כל deploy.

---

## 8. נספח — Checklist מהיר

**לפני כל push:** `tsc --noEmit` (server) · `tsc -b` (web) · חבילה חדשה→`deploy.sh` install ·
schema→`prisma migrate` בלבד · נגעת ב־endpoint→הרץ §2.5 · happy-path עובד.

**אחרי merge ל־main:** המתן ~30ש · WebFetch ל־`deploy.yml` runs → האחרונה ✓ · נכשל→אבחן לפי duration (CLAUDE.md).

**סטטוס אבטחה (עדכן תוך כדי):**
- [ ] 🔴 3.1 admin-bypass הוסר (endpoint + frontend)
- [ ] 🔴 3.2 RolesGuard + מטריצת הרשאות + ולידציית role
- [ ] 🔴 3.3 `assertCanManageUser` אוכף org לכל תפקיד
- [ ] 🔴 3.4/3.8 IDOR — org-ownership בכל מוטציה/קריאה לפי id
- [ ] 🔴 3.5 WebSocket handshake auth + CORS מוקשח
- [ ] 🟠 3.6/3.14/3.28 JWT/env fail-fast
- [ ] 🟠 3.7 cleaner login: orgId חובה + 2FA + lockout
- [ ] 🟠 3.9/3.10 push/diagnose/kiosk-diagnose מוגנים+scoped
- [ ] 🟠 3.11 analytics org-scope
- [ ] 🟠 3.12 rate limiting + body limit
- [ ] 🟠 3.13 DTO validation + forbidNonWhitelisted
- [ ] 🟡 3.16-3.26 (reassign/incident-auth/sync/mass-assign/CRON/helmet/perms/localStorage/CSV)
- [ ] 🟢 3.27/3.29 refresh rotation + SSH log hygiene
- [ ] 🧪 §2.6 בדיקות רגרסיה ב־CI

---

> **תזכורת אחרונה לעצמי:** המסמך הוא *מפה*, לא *הרשאה*. חלק מהממצאים לא עברו אימות אדוורסרי מלא
> (ההרצה נקטעה) — אמת כל אחד מול הקוד לפני שינוי. אל תבצע תיקון אבטחה בלי לבדוק אותו מול production
> flows אמיתיים, ואל תדחוף ל־main בלי אימות deploy. עדיף גלים קטנים ובטוחים על refactor ענק אחד.
