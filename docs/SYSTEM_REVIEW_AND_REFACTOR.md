# Toilet Monitor — מדריך סקירה, ניקוי, שכתוב ואבטחה של המערכת

> **מסמך פנימי לקלוד (working guide).** נכתב כדי לתת לי — הקלוד שיעבוד על הפרויקט בעתיד —
> תוכנית עבודה מסודרת: איך לבדוק את כל המערכת מקצה לקצה, איזה קוד למחוק, איך להפוך
> את הקוד לפשוט ומסודר יותר, איך לשכתב חלקים "נכון", ובעיקר — **אילו פרצות אבטחה
> קיימות היום ואיך לסגור אותן.**
>
> המסמך מבוסס על סקירה אמיתית של הקוד (יולי 2026, branch `claude/system-review-refactor-qbldax`),
> עם הפניות מדויקות לקבצים ולשורות. הוא **תיאורי ומנחה בלבד** — אין לבצע את השינויים
> אוטומטית מהמסמך הזה. כל שינוי דורש PR נפרד, בדיקות, וסדר עבודה מבוקר (ראו §8).

---

## תוכן עניינים

1. [מטרה ואיך להשתמש במסמך](#1-מטרה-ואיך-להשתמש-במסמך)
2. [מפת המערכת בקצרה](#2-מפת-המערכת-בקצרה)
3. [חלק א׳ — איך לבדוק את כל המערכת](#3-חלק-א--איך-לבדוק-את-כל-המערכת)
4. [חלק ב׳ — פרצות אבטחה (לפי חומרה)](#4-חלק-ב--פרצות-אבטחה-לפי-חומרה)
5. [חלק ג׳ — קוד למחיקה / לא רלוונטי](#5-חלק-ג--קוד-למחיקה--לא-רלוונטי)
6. [חלק ד׳ — ניקוי, פישוט וסידור הקוד](#6-חלק-ד--ניקוי-פישוט-וסידור-הקוד)
7. [חלק ה׳ — שכתוב "נכון" + מקרי קצה לא טריוויאליים](#7-חלק-ה--שכתוב-נכון--מקרי-קצה-לא-טריוויאליים)
8. [חלק ו׳ — סדר עבודה מומלץ (Roadmap)](#8-חלק-ו--סדר-עבודה-מומלץ-roadmap)
9. [נספח — Checklist מהיר](#9-נספח--checklist-מהיר)

---

## 1. מטרה ואיך להשתמש במסמך

המערכת גדלה אורגנית (סנסורים, קיוסקים, אימיילים, PWA, ריבוי־ארגונים) והצטברו בה:
- **חורי אבטחה ממשיים** — חלקם קריטיים (גישה ל־token אדמין ללא סיסמה, מחיקת נתונים חוצת־ארגונים).
- **קוד כפול** — לוגיקת scoping של Property Manager משוכפלת ב־3 controllers, `include` מקונן חוזר עשרות פעמים.
- **טיפוסים חלשים** — `any` בכל מקום, אין DTO אמיתי ולכן ה־`ValidationPipe` כמעט חסר משמעות.
- **אין שכבת הרשאות תפקיד** — לכל משתמש מאומת (גם מנקה) יש למעשה גישה לרוב פעולות האדמין.

**איך לעבוד עם המסמך:**
- קרא §2 להתמצאות מהירה.
- לפני כל push — הרץ את הבדיקות ב־§3.
- כשעובדים על אבטחה — §4 מסודר לפי חומרה; **התחל מ־CRITICAL**.
- לכל פריט יש: *מה הבעיה → איפה בקוד → מה החשיפה → התיקון*.
- אל תבצע הכל בבת אחת. עקוב אחרי ה־Roadmap ב־§8 (PR-ים קטנים, כל אחד נבדק בנפרד).

**עיקרון מנחה:** כל תיקון אבטחה שמשנה התנהגות ציבורית (endpoints, tokens, CORS) חייב
בדיקת רגרסיה ידנית על ה־flows המרכזיים (קיוסק, מנקה, אדמין) **לפני** merge ל־main, כי
שבירה כאן = השבתת production.

---

## 2. מפת המערכת בקצרה

```
apps/
  server/   NestJS 11 + Prisma 5 + Passport-JWT + Socket.io   (API under /api? ראה main.ts)
    src/modules/{auth,users,buildings,incidents,analytics,events,scheduler,push,email,sensors}
    src/common/{guards,decorators,locale}
  web/      React 19 + Vite 6 + Tailwind v4 + TanStack Query + Zustand + i18next + PWA
    src/modules/{admin,cleaner,kiosk}  src/lib/{api,socket,push,offline}
packages/shared-types
scripts/{deploy.sh,server-setup.sh,nginx-watchdog.sh}
```

**מודל הרשאות (Prisma `Role`):** `SUPER_ADMIN, ORG_ADMIN, MANAGER, PROPERTY_MANAGER, SHIFT_SUPERVISOR, CLEANER`.

**נקודת האבטחה המרכזית:** `JwtAuthGuard` רשום כ־`APP_GUARD` גלובלי
(`apps/server/src/app.module.ts:42`), כלומר **הכל מוגן כברירת מחדל** — אלא אם סומן
`@Public()`. זה טוב. הבעיה היא ש־(א) יש הרבה מדי `@Public()`, ו־(ב) אין שכבה שנייה של
**הרשאה לפי תפקיד** אחרי האימות — אז "מאומת" שווה בפועל "אדמין".

---

## 3. חלק א׳ — איך לבדוק את כל המערכת

### 3.1 הכנה מקומית
```bash
pnpm install                       # workspace root (pnpm 9)
# DB לפיתוח (Postgres 16) — Docker
docker compose up -d db redis      # אם קיים compose; אחרת Postgres מקומי
cd apps/server && cp .env.example .env   # ודא DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET
npx prisma migrate dev             # מריץ migrations + generate
npx prisma db seed                 # אם רוצים נתוני דמו (prisma/seed.ts)
```
> ⚠️ **אף פעם** `prisma db push --accept-data-loss` על production — מוחק טבלאות (ראו CLAUDE.md).

### 3.2 בדיקות סטטיות (typecheck) — חובה לפני push
```bash
cd apps/server && npx tsc --noEmit
cd ../web      && npx tsc -b        # tsc -b, לא רק --noEmit! (project references)
```
זכור: `sw.ts` מוחרג מ־`tsconfig.app.json` (WebWorker vs DOM). קסטים `.buffer as ArrayBuffer`
נדרשים ב־TS5. הכל מפורט ב־CLAUDE.md > Pre-push checklist.

### 3.3 בדיקות אוטומטיות (Backend)
מצב נוכחי: קיימים רק `app.controller.spec.ts` ו־`test/app.e2e-spec.ts` (כמעט ריק). **כיסוי בדיקות ~0.**
```bash
cd apps/server
npx jest                     # unit
npx jest --config test/jest-e2e.json   # e2e
```
**מה חסר וצריך להוסיף (ראו §7.6):** בדיקות ל־auth (login/refresh/bypass), ל־scoping של
Property Manager, ול־IDOR — בדיוק המקומות שבורים עכשיו.

### 3.4 בדיקות Frontend
```bash
cd apps/web
npx tsc -b
pnpm build                   # vite build — מגלה בעיות PWA/manifest
pnpm dev                     # smoke ידני
```
בדיקה ידנית מהירה (smoke) לכל flow:
| Flow | מסלול | מה לוודא |
|------|-------|----------|
| קיוסק | `/kiosk/:deviceCode` | scroll-lock פעיל, כפתורי דיווח, אישור |
| מנקה | `/cleaner` | login ת"ז, קבלת משימות, resolve |
| מפקח | `/supervisor` | login, רשימת מנקים פעילים |
| אדמין | `/admin` | login מייל+סיסמה, דשבורד, incidents, analytics |
| PWA | התקנה + push | subscribe, קבלת notification |

> **מדיניות scroll (הנחיית משתמש):** רק מסכי קיוסק נעולים (`useScrollLock`). אסור להחזיר
> `overflow:hidden` גלובלי ל־`html`/`body`. כל דף חדש חייב לגלול רגיל.

### 3.5 בדיקות אבטחה ידניות (עד שיש אוטומציה)
הרץ מול server מקומי. אלו בדיוק ה־exploits מ־§4 — הם צריכים **להיכשל** אחרי התיקונים:
```bash
# 1) Backdoor — אמור להיעלם לגמרי אחרי התיקון (§4.1)
curl -s http://localhost:3001/api/auth/admin-bypass | jq

# 2) IDOR חוצה-ארגונים — עם token של CLEANER מארגון A, נסה למחוק building של ארגון B (§4.2)
curl -X DELETE http://localhost:3001/api/buildings/<OTHER_ORG_BUILDING_ID> \
     -H "Authorization: Bearer $CLEANER_TOKEN"

# 3) Role escalation — token של CLEANER משנה הגדרות ארגון (§4.5)
curl -X PATCH http://localhost:3001/api/users/org-settings \
     -H "Authorization: Bearer $CLEANER_TOKEN" -H 'Content-Type: application/json' \
     -d '{"name":"hacked"}'

# 4) WebSocket cross-tenant — הצטרפות לחדר של ארגון זר וקבלת broadcasts (§4.4)
#    (מבחן בדפדפן: socket.emit('join:org',{orgId:'<OTHER_ORG>'}))

# 5) Push abuse — שליחת notification לכל המכשירים ללא אימות (§4.6)
curl -s http://localhost:3001/api/push/test | jq
```
**כלים מומלצים:** `npm audit` / `pnpm audit` לתלויות, ו־[OWASP ZAP] או Burp לסריקה
פסיבית מול staging (לא production). בדיקת secrets: ודא שאין `.env` ב־git (`git ls-files | grep env`).

### 3.6 Pre-push checklist (קצר)
1. `tsc --noEmit` (server) + `tsc -b` (web) — ✓
2. חבילה חדשה? ודא `deploy.sh` מריץ `pnpm install --frozen-lockfile` לפני build.
3. שינוי schema? רק דרך `prisma/migrations/` (migrate dev), אף פעם `db push`.
4. שינוי endpoint ציבורי/אבטחה? הרץ את §3.5.
5. אחרי merge ל־main — **אמת שה־deploy עבר** (CLAUDE.md > Post-merge verification).

---

## 4. חלק ב׳ — פרצות אבטחה (לפי חומרה)

> כל הממצאים אומתו מול הקוד בפועל. סדר הטיפול: **CRITICAL → HIGH → MEDIUM**.

### 🔴 CRITICAL

#### 4.1 Backdoor ציבורי: `GET /api/auth/admin-bypass` מחזיר token אדמין ללא סיסמה
**איפה:** `auth.controller.ts:48-52` + `auth.service.ts:49-56`.
```ts
@Public()
@Get('admin-bypass')
adminBypass() { return this.authService.getAdminBypassToken(); }
// service: מוצא את האדמין הראשון בבסיס הנתונים ומחזיר לו access+refresh token מלאים
```
**החשיפה:** כל אדם באינטרנט שקורא ל־endpoint הזה מקבל token של אדמין מלא (`ORG_ADMIN`/`SUPER_ADMIN`)
— שליטה מלאה על כל הארגון, כולל מחיקת נתונים. זו הפרצה החמורה ביותר במערכת.
**התיקון:** **למחוק לחלוטין** את ה־endpoint, את `getAdminBypassToken()`, וכל קריאה אליו ב־web
(`grep -rn "admin-bypass" apps/web/src`). אם נחוץ "dev login" — שים אותו מאחורי
`NODE_ENV !== 'production'` **וגם** מאחורי secret, אך עדיף פשוט למחוק.

#### 4.2 IDOR חוצה־ארגונים: מוטציות לא בודקות בעלות על המשאב
רוב פעולות ה־mutation מקבלות `id` ישירות ומריצות את פעולת Prisma **בלי לוודא שה־`id`
שייך ל־`user.orgId`**. עם token של משתמש כלשהו (גם `CLEANER`) אפשר לפגוע במשאבים של ארגון אחר.

- **מחיקת בניין** — `buildings.service.ts:541 deleteBuilding(buildingId)`: אין `orgId` ב־`where`.
  `DELETE /api/buildings/<any-id>` מוחק בניין של **כל ארגון**, כולל כל הקומות/שירותים/אירועים שתחתיו.
- **עדכון אירוע** — `incidents.service.ts adminUpdate(incidentId,…)`: `update({ where:{ id } })`
  ללא סינון org. כל משתמש מאומת יכול לשנות סטטוס/שיוך של אירוע בכל ארגון.
- **תצורת סנסור** — `sensors.controller.ts:29 updateConfig` מוגן ב־`JwtAuthGuard` אבל
  `sensors.service.ts:97` מעדכן `device` לפי `deviceId` בלבד, ללא org — כל מנקה יכול
  לשנות את התצורה של כל סנסור בכל ארגון.
- אותו דפוס חוזר ב־`updateBuilding`, `deleteRestroom`, `deleteDevice`, `updateFloor`,
  `updateRestroom`, וב־kiosk-templates.

**התיקון (עקרוני, אחיד):** בכל מוטציה, ודא בעלות לפני הפעולה. שתי גישות:
```ts
// א) בדיקה מפורשת בשירות (מיידי, בטוח):
const b = await this.prisma.building.findFirst({ where: { id, orgId } });
if (!b) throw new NotFoundException();   // 404 ולא 403 — לא מדליף קיום משאב

// ב) מוטציה עם orgId ב-where (אטומי):
const { count } = await this.prisma.building.deleteMany({ where: { id, orgId } });
if (count === 0) throw new NotFoundException();
```
לאירועים/סנסורים שאין להם `orgId` ישיר — סנן דרך הקשר: `where:{ id, restroom:{ floor:{ building:{ orgId } } } }`.
מומלץ לרכז זאת ב־helper `assertOwnedByOrg(entity, id, orgId)` כדי לא לשכפל.

#### 4.3 JWT fallback secret קבוע בקוד
**איפה:** `jwt.strategy.ts:15` — `secretOrKey: config.get('JWT_SECRET') ?? 'fallback-secret'`.
**החשיפה:** אם `JWT_SECRET` לא מוגדר בסביבה (טעות deploy, env לא נטען), השרת מאמת tokens
מול המחרוזת הידועה `'fallback-secret'` — כל אחד יכול לחתום token אדמין תקף. שים לב:
ה־signing ב־`auth.module.ts:15` **לא** משתמש ב־fallback, אז ייתכן חוסר־התאמה שקט
(אימות מול סוד אחר מהחתימה) שמסתיר את הבעיה עד שתנוצל.
**התיקון:**
```ts
const secret = config.get('JWT_SECRET');
if (!secret) throw new Error('JWT_SECRET is required');   // fail fast — לא fallback
super({ ..., secretOrKey: secret });
```
עשה את אותו fail-fast עבור `JWT_REFRESH_SECRET`. הוסף ולידציית env בזמן bootstrap
(ראו §7.5) כדי שהשרת **יסרב לעלות** בלי סודות.

### 🟠 HIGH

#### 4.4 WebSocket ללא אימות + `CORS origin:'*'` + הצטרפות חופשית לחדרים
**איפה:** `events.gateway.ts:13-16` (`cors:{origin:'*'}`) ו־`handleJoinOrg` (שורה 31):
```ts
client.join(`org:${data.orgId}`);   // כל client, כל orgId, בלי אימות
```
**החשיפה:** ה־gateway משדר `incident:updated`, `incident:created` וכו' לחדר `org:<id>`.
לקוח אנונימי יכול `join:org` עם orgId זר ולקבל **זרם אירועים בזמן אמת של ארגון אחר**
(שמות, מיקומים, סטטוסים) — דליפת מידע חוצת־tenant. בנוסף `origin:'*'` מאפשר לכל אתר לפתוח socket.
**התיקון:**
- אמת JWT ב־handshake: `handleConnection` יקרא token מ־`client.handshake.auth.token`,
  יאמת עם `JwtService`, ידחה אם לא תקף (`client.disconnect()`), וישמור `client.data.orgId`.
- ב־`join:org` — התעלם מ־`data.orgId` ותשתמש ב־`client.data.orgId` מה־token בלבד.
- `cors.origin` — רשימת מקורות מפורשת (כמו ב־`main.ts:10-15`), לא `*`.

#### 4.5 אין שכבת הרשאות תפקיד — "מאומת" = "אדמין"
**איפה:** רוב ה־controllers מגנים רק עם `JwtAuthGuard` בלי בדיקת `role`. דוגמאות:
- `users.controller.ts` — `PATCH org-settings`, `escalation-config`, `createAdmin`,
  `deleteUser`, `toggleActive` נגישים לכל token מאומת. `assertCanManageUser` קיים לחלק,
  אבל `updateOrgSettings`/`escalation` פתוחים לכל תפקיד (גם `CLEANER`).
- `incidents.controller.ts` — `DELETE bulk` ו־`adminUpdate` בלי בדיקת role → מנקה יכול
  למחוק את כל האירועים של הארגון.
- `buildings.controller.ts` — כל ה־CRUD בלי role.
**החשיפה:** הסלמת הרשאות אנכית. token של מנקה (שמתקבל בקלות — login עם ת"ז בלבד, §4.7)
שקול לאדמין כמעט לכל דבר.
**התיקון:** בנה `@Roles()` decorator + `RolesGuard` והחל אותם:
```ts
// common/decorators/roles.decorator.ts
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

// common/guards/roles.guard.ts — קורא את user.role שה-JwtStrategy כבר מחזיר
@Injectable() export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext) {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length) return true;
    const { user } = ctx.switchToHttp().getRequest();
    return !!user && roles.includes(user.role);
  }
}
```
רשום `RolesGuard` כ־`APP_GUARD` שני (רץ אחרי JwtAuthGuard), וסמן כל endpoint אדמיני
ב־`@Roles('ORG_ADMIN','MANAGER',…)`. הגדר **מטריצת הרשאות** מפורשת (ראו §7.1).

#### 4.6 כל endpoints ה־Push ציבוריים (`@Public()`)
**איפה:** `push.controller.ts` — `subscribe`, `unsubscribe`, `diagnose`, `test`, `rotate`, כולם `@Public()`.
**החשיפה:**
- `GET /api/push/test` — כל אחד יכול לשגר notification אמיתי **לכל המכשירים הרשומים** (spam/abuse).
- `GET /api/push/diagnose` — חושף רשימת subscriptions (endpoints/מטא) — מיפוי משתמשים.
- `POST /api/push/subscribe` — מקבל `userId`+`orgId` **מהגוף**, בלי אימות שהם שייכים לקורא —
  אפשר לרשום/לזייף subscriptions לכל userId.
**התיקון:**
- `test` ו־`diagnose` → הסר `@Public()`, הוסף `@UseGuards(JwtAuthGuard)` + `@Roles('ORG_ADMIN')`.
- `subscribe`/`rotate` — אם חייבים להישאר נגישים ל־PWA, גזור `userId`/`orgId` מה־JWT
  (`@CurrentUser()`) ולא מהגוף; לפחות הגבל ב־rate-limit.
- `unsubscribe` יכול להישאר ציבורי (מבוסס endpoint שהלקוח כבר מחזיק), אך שקול הגבלה.

#### 4.7 אין Rate Limiting בכלל
**איפה:** אין `@nestjs/throttler` בקוד (בדוק: `grep -rn Throttler apps/server` → 0).
**החשיפה:** endpoints ציבוריים פתוחים ל־brute-force ו־DoS:
- `POST /api/auth/admin/login` — brute-force סיסמאות.
- `POST /api/auth/cleaner/login` + `verify-cleaner`/`verify-admin` — enumeration של ת"ז.
- `POST /api/incidents` + `/incidents/sync` (§4.9) — הצפת DB באירועים מזויפים.
**התיקון:** הוסף `ThrottlerModule` גלובלי (`pnpm add @nestjs/throttler`, ואז ודא
`deploy.sh` מריץ `pnpm install`). הגדרה בסיסית ~ 60 req/min, והדק במיוחד על login/verify
(`@Throttle({ default: { limit: 5, ttl: 60000 } })`).

### 🟡 MEDIUM

#### 4.8 Enumeration/דליפת מידע ב־verify + הודעות login
- `users.service.ts:156 verifyCleaner` ו־`:174 verifyAdminByIdNumber` — endpoints ציבוריים
  שמחזירים `{found:true, name, role, orgId}` לפי ת"ז. מאפשר מיפוי עובדים והצלבת ת"ז↔שם.
- `auth.service.ts:33-34 loginCleaner` מבחין בין `NOT_FOUND` ל־`INACTIVE` — מדליף קיום משתמש.
**התיקון:** צמצם את התשובה למינימום הדרוש ל־UI (למשל בוליאני `found` בלבד), אחד את הודעות
השגיאה (`Invalid credentials` גנרי), והחל rate-limit (§4.7). ה־login של מנקה מבוסס ת"ז
בלבד ללא סיסמה — שקול הוספת PIN/גורם שני אם ה־UX מאפשר.

#### 4.9 `POST /api/incidents` ו־`/sync` ציבוריים ולא מוגבלים
**איפה:** `incidents.controller.ts:24-42` — `create` ו־`syncBatch` שניהם `@Public()`.
נדרש כי הקיוסק אנונימי, אבל ללא הגבלה זו הצפה אפשרית. `syncBatch(@Body() body: any)` —
מקבל payload שרירותי (ראו §4.10).
**התיקון:** rate-limit לפי IP/deviceCode, ולידציית DTO קשיחה (מספר פריטים מקסימלי ב־sync,
בדיקת קיום `deviceId`/`restroomId` תואמים), והחזרת 400 על payload לא תקין.

#### 4.10 `ValidationPipe.whitelist` חסר־שיניים — אין DTO אמיתי
**איפה:** `main.ts:19-25` מפעיל `whitelist:true, forbidNonWhitelisted:false`, אבל כמעט
כל ה־`@Body()` מוקלד כאובייקט inline (`@Body() body: { … }` / `dto: any`), **לא** class עם
דקורטורים של `class-validator`. `whitelist` פועל רק על class-instances — כאן הוא לא מסנן כלום.
**החשיפה:** payloads שרירותיים עוברים; אין ולידציית טיפוס/אורך/פורמט; `sync(@Body() body:any)`
פתוח לגמרי. גם mass-assignment אפשרי אם שדות מועברים ישירות ל־Prisma.
**התיקון:** הגדר DTO classes אמיתיים עם `class-validator`/`class-transformer` (כבר תלות קיימת,
`package.json:43`), ושנה ל־`forbidNonWhitelisted:true`. ראו §6.2. עדיפות למסלולים ציבוריים תחילה.

#### 4.11 `reassignDevice` ציבורי מבטל חסימות מכשיר
**איפה:** `auth.controller.ts:54 PATCH kiosk/:deviceCode/restroom` → `auth.service.ts:116`
מוחק `blockedDeviceCode` ומשייך מחדש מכשיר לכל restroom — הכל `@Public()`.
**החשיפה:** תוקף יכול לשייך מחדש קיוסקים ולעקוף מחיקות אדמין. הקוד מתאר זאת כ"admin-verified"
אבל אין שום אימות בפועל.
**התיקון:** דרוש אימות (JWT אדמין) לפעולת reassign, או צמצם ל־deviceCode עם token חד־פעמי.

#### 4.12 היגיינת סביבה ולוגים
- `main.ts` — אין `helmet` (security headers), אין `app.setGlobalPrefix('api')` גלוי (ודא
  שה־prefix מוגדר אי־שם, אחרת ה־curl-ים ב־§3.5 עם `/api` לא תואמים).
- `events.gateway.ts` מלוגג כל connect/disconnect — רועש; הורד ל־debug.
- ודא ש־`.env.production` **לעולם** לא נכנס ל־git (`git ls-files | grep -i env`).
- `deploy.sh` מזריק סודות ל־`.env.production` — ודא הרשאות קובץ מוקשחות (`chmod 600`) ושה־backups
  (`/var/log/toilet/backups/`) לא נגישים ל־web root.

---

## 5. חלק ג׳ — קוד למחיקה / לא רלוונטי

| פריט | איפה | למה למחוק |
|------|------|-----------|
| `admin-bypass` endpoint + `getAdminBypassToken()` | `auth.controller.ts:48`, `auth.service.ts:49` | backdoor (§4.1) — אין לו מקום legitי |
| קוד web שקורא ל־`admin-bypass` | `grep -rn admin-bypass apps/web/src` | להסיר יחד עם ה־endpoint |
| מסמכי שיווק/PDF בתיקיית `docs/` | `PRICING.*`, `ANALYTICS_COMPARISON.*`, `ECHO_SHOW_*`, `HARDWARE_*` | לא קוד; לשקול העברה ל־repo/Drive נפרד כדי להקטין את ה־repo |
| `prisma/purge-building-stats.ts` | one-off script | אם חד־פעמי — למחוק או להעביר ל־`scripts/oneoff/` עם הערה |
| `app.controller.spec.ts` דמו | `apps/server/src` | להחליף בבדיקות אמיתיות (§7.6), לא להשאיר placeholder |
| הודעות `console`/`Logger.log` רועשות | `events.gateway.ts:24,28` | להוריד ל־`debug` |
| טיפוסי `any` מיותרים | פרוס | לא "מחיקה" אלא החלפה (§6.1) |

> לפני מחיקה של כל קובץ — `grep` לשימושים. אל תמחק migrations קיימים לעולם.

---

## 6. חלק ד׳ — ניקוי, פישוט וסידור הקוד

### 6.1 להיפטר מ־`any` — טיפוס אמיתי ל־`user` המאומת
`@CurrentUser() user: any` חוזר בכל controller. ה־`JwtStrategy.validate` (`jwt.strategy.ts:19`)
כבר מחזיר צורה ידועה. הגדר טיפוס משותף:
```ts
// common/types/authenticated-user.ts
export interface AuthUser {
  id: string; orgId: string; role: Role;
  name: string; buildingId: string | null;
  propertyId: string | null; propertyIds: string[];
}
```
והשתמש `@CurrentUser() user: AuthUser` בכל מקום. זה יחשוף באגי scoping בזמן קומפילציה.

### 6.2 DTOs אמיתיים במקום אובייקטים inline
לכל `@Body()` — class עם `class-validator`:
```ts
export class AdminLoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(6) password!: string;
}
```
מרוויחים: ולידציה אמיתית, `whitelist` פועל, טיפוסים חזקים, תיעוד עצמי. התחל מ־`auth`,
`incidents` (ציבוריים) ואז השאר. אחר כך `forbidNonWhitelisted:true` ב־`main.ts`.

### 6.3 לרכז את לוגיקת ה־Property Manager scoping (כפילות משולשת)
אותה תבנית מופיעה ב־`users.controller.ts:16`, `buildings.controller.ts:17,27`,
`incidents.controller.ts:65-68,108-111`:
```ts
const scope = user.role === 'PROPERTY_MANAGER'
  ? (user.propertyIds?.length ? user.propertyIds : ['__none__']) : undefined;
```
חלץ ל־helper יחיד `propertyScope(user): string[] | undefined` (או decorator `@PropertyScope()`),
כולל את הלוגיקה של `pmNarrowed` באירועים. מקום אחד לתקן = פחות באגי scoping (שהם גם באגי אבטחה).

### 6.4 לרכז את ה־Prisma `include` המקונן
הצירוף `restroom → floor → building → organization` חוזר עשרות פעמים (auth.service, sensors,
incidents, buildings). הגדר קבועים משותפים:
```ts
export const DEVICE_LOCATION_INCLUDE = {
  restroom: { include: { floor: { include: { building: { include: { organization: true } } } } } },
} satisfies Prisma.DeviceInclude;
```
`incidents.service.ts` כבר עושה זאת עם `INCIDENT_INCLUDE` — הרחב את הדפוס לכל השאר.

### 6.5 שגיאות HTTP נכונות במקום `throw new Error`
`users.service.ts:187,203` — `throw new Error('Cleaner not found')` → יוצא כ־500 ללקוח.
החלף ב־`NotFoundException`/`BadRequestException`. עבור על השירותים ווודא שכל זריקה היא
Nest HTTP exception. הוסף `ExceptionFilter` גלובלי שממפה שגיאות לא־צפויות ל־500 עם
מזהה־בקשה, בלי לדלוף stack ללקוח.

### 6.6 פיצול שירותים ענקיים
- `analytics.service.ts` (790 שורות) → פצל לפי נושא (issue-frequency, hourly, heatmap,
  cleaner-performance) לקבצים/מחלקות נפרדות.
- `buildings.service.ts` (619) → הפרד Properties / Buildings / Kiosk-templates / Devices.
- `incidents.service.ts` (505) → הפרד queue-lifecycle מ־admin/analytics.
פיצול = בדיקות ממוקדות יותר וקל יותר לאתר את גבולות ה־scoping.

### 6.7 אחידות ב־auth של controllers
היום מעורבב: guard גלובלי (`APP_GUARD`) **וגם** `@UseGuards(JwtAuthGuard)` מקומי חוזר
(למשל `users.controller.ts:63,69,75` — מיותר, ה־guard כבר גלובלי). הסר את הכפולים והשאר
`@Public()` רק היכן שבאמת ציבורי. פחות רעש = פחות סיכוי לפספס endpoint לא מוגן.

---

## 7. חלק ה׳ — שכתוב "נכון" + מקרי קצה לא טריוויאליים

### 7.1 מטריצת הרשאות מפורשת (source of truth יחיד)
במקום בדיקות role מפוזרות, הגדר טבלה אחת role→resource→action, ומ־RolesGuard (§4.5) אכוף
אותה. דוגמה חלקית:
| Resource / Action | SUPER_ADMIN | ORG_ADMIN | MANAGER | PROPERTY_MANAGER | SHIFT_SUPERVISOR | CLEANER |
|---|---|---|---|---|---|---|
| org-settings write | ✓ | ✓ | – | – | – | – |
| buildings CRUD | ✓ | ✓ | ✓ | scoped | – | – |
| users create admin | ✓ | ✓ | – | SHIFT only | – | – |
| incidents bulk-delete | ✓ | ✓ | ✓ | – | – | – |
| incidents resolve | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
כתוב בדיקות שמכריחות את המטריצה (§7.6).

### 7.2 מקרי קצה שכדאי לכסות בשכתוב
- **`resolveUrgentRange`/טווחי תאריכים** (`incidents.controller.ts:9`) — קלט לא תקין,
  `to` לפני `from`, timezone (הכל Asia/Jerusalem אבל `new Date(s)` הוא UTC — ראו §7.3).
- **Refresh token** (`auth.service.ts:189`) — כרגע אין ביטול/rotation. אם refresh נגנב הוא
  תקף 7 ימים. שקול jti + blocklist, או rotation עם zero-reuse.
- **`checkout` ללא shift פתוח** (`users.service.ts:214`) — יוצר רשומת checkout מלאכותית;
  ודא שזה לא מזהם analytics (משך שהייה = 0).
- **Auto-create של `ROOM-*` devices** (`auth.service.ts:90`) — endpoint ציבורי שיוצר Device.
  אם `restroomId` שרירותי → יצירת רשומות זבל. הגבל ל־restroom קיים (כבר נבדק) + rate-limit.
- **`upsert` על deviceCode** — מרוצי־תנאים בין reassign למחיקה; עטוף בטרנזקציה.
- **push `rotate`/subscribe** — endpoint ישן שכבר לא קיים; טפל ב־410 Gone וניקוי subscriptions מתים.

### 7.3 טיפול נכון ב־Timezone
כל המערכת עובדת ב־`Asia/Jerusalem` אבל הקוד משתמש ב־`new Date()` / `setHours(0,0,0,0)`
(למשל `users.service.ts:165,207`) — זה חותך יום לפי timezone של **השרת**, לא ירושלים.
ב־VPS ב־UTC "תחילת היום" תהיה 03:00 מקומי. עבור ל־חישוב מפורש מול timezone (למשל
`date-fns-tz` או `Intl`) לכל חיתוכי היום (arrivals, visitCounts, daily-report).

### 7.4 עקביות טרנזקציונית במחיקות מדורגות
`deleteBuilding` מוחק restrooms/incidents/devices בכמה שלבים לא־אטומיים (`buildings.service.ts:541`).
כשל באמצע = מצב חלקי. עטוף ב־`prisma.$transaction([...])`, או הגדר `onDelete: Cascade`
ב־schema והשאר ל־DB. אותו דבר ל־`deleteFloor`/`deleteRestroom`.

### 7.5 ולידציית סביבה ב־bootstrap (fail-fast)
הוסף בדיקה ש־`JWT_SECRET`, `JWT_REFRESH_SECRET`, `DATABASE_URL`, `VAPID_*` קיימים —
אחרת `process.exit(1)` עם הודעה ברורה. מונע את התרחיש של §4.3 (fallback secret שקט).
שקול `@nestjs/config` עם Joi schema.

### 7.6 בדיקות אוטומטיות ל־regressions של אבטחה
כתוב e2e שמכשילים כל exploit מ־§4:
```
✗ GET  /api/auth/admin-bypass            → 404 (הוסר)
✗ DELETE /api/buildings/:foreignId       → 404/403 עם token של org אחר
✗ PATCH /api/users/org-settings          → 403 עם token של CLEANER
✗ GET  /api/push/test                    → 401 ללא token
✗ WS join:org עם orgId זר                → אין broadcasts
✓ כל ה-happy-path (קיוסק/מנקה/אדמין)     → עדיין עובד
```
אלו הם גם ה־smoke של §3.5 — הפוך אותם לאוטומטיים כדי שלא ייסגרו ואז ייפתחו שוב.

### 7.7 הקשחת CORS ו־headers
`main.ts:9` — רשימת origin מפורשת (טוב). הוסף `helmet()`, הגדר `credentials` בזהירות,
והתאם את `events.gateway` (§4.4) לאותה רשימה. ודא שאין `*` בשום מקום ב־production.

---

## 8. חלק ו׳ — סדר עבודה מומלץ (Roadmap)

עבוד בגלים קטנים; כל גל = PR משלו + בדיקות + אימות deploy. **אל תערבב אבטחה עם refactor
באותו PR** (קשה לבדוק, קשה ל־revert).

**גל 0 — עצירת דימום (CRITICAL, דחוף):**
1. מחק `admin-bypass` (§4.1) + הסר שימוש ב־web.
2. תקן JWT fallback secret → fail-fast (§4.3).
3. סגור את ה־IDOR הגרועים: `deleteBuilding`, `adminUpdate`, `updateConfig` (§4.2).
> אחרי הגל הזה — הרץ §3.5, ודא ש־3 הראשונים נכשלים וש־happy-path עובד, ואמת deploy.

**גל 1 — הרשאות (HIGH):**
4. בנה `RolesGuard` + `@Roles` + מטריצת §7.1, החל על כל ה־controllers.
5. אמת WebSocket ב־handshake + הסר `origin:'*'` (§4.4).
6. הקשח push endpoints (§4.6).

**גל 2 — עמידות (HIGH/MEDIUM):**
7. הוסף `@nestjs/throttler` (§4.7) — ודא `deploy.sh` install.
8. DTOs + `forbidNonWhitelisted:true` למסלולים ציבוריים (§6.2, §4.10).
9. צמצם enumeration ב־verify/login (§4.8).

**גל 3 — ניקוי וסידור (לא־אבטחה):**
10. טיפוס `AuthUser`, ריכוז scoping (§6.1, §6.3).
11. ריכוז `include`, שגיאות HTTP, פיצול שירותים (§6.4-6.6).
12. Timezone + טרנזקציות במחיקות (§7.3, §7.4).

**גל 4 — רשת ביטחון:**
13. בדיקות e2e ל־regressions (§7.6) — שיהיו ב־CI לפני כל deploy.
14. helmet + env validation (§7.5, §7.7).

---

## 9. נספח — Checklist מהיר

**לפני כל push:**
- [ ] `cd apps/server && npx tsc --noEmit`
- [ ] `cd apps/web && npx tsc -b`
- [ ] חבילה חדשה? `deploy.sh` מריץ `pnpm install --frozen-lockfile` לפני build
- [ ] שינוי schema? רק `prisma migrate` — אף פעם `db push --accept-data-loss`
- [ ] שינוי endpoint/אבטחה? הרצתי את exploits §3.5, נכשלים כמצופה
- [ ] happy-path (קיוסק/מנקה/אדמין) עדיין עובד

**אחרי merge ל־main:**
- [ ] המתן ~30ש, WebFetch ל־`deploy.yml` runs — הריצה האחרונה ✓
- [ ] אם נכשל — אבחן לפי duration (CLAUDE.md), תקן, אמת שוב

**סטטוס אבטחה (עדכן תוך כדי טיפול):**
- [ ] 🔴 admin-bypass הוסר
- [ ] 🔴 IDOR (buildings/incidents/sensors) — org-ownership נאכף
- [ ] 🔴 JWT fallback secret → fail-fast
- [ ] 🟠 RolesGuard + מטריצת הרשאות
- [ ] 🟠 WebSocket מאומת + CORS מוקשח
- [ ] 🟠 push endpoints מוגנים
- [ ] 🟠 rate limiting
- [ ] 🟡 DTO validation + forbidNonWhitelisted
- [ ] 🟡 enumeration/login messages
- [ ] 🟡 helmet + env validation

---

> **תזכורת אחרונה לעצמי:** המסמך הזה הוא *מפה*, לא *הרשאה*. אל תבצע שינוי אבטחה מבלי
> לבדוק אותו מול production flows אמיתיים, ואל תדחוף ל־main בלי אימות deploy. עדיף
> חמישה PR-ים קטנים ובטוחים על פני refactor ענק אחד.
