# Security Fixes — Progress Log

> **מטרה:** רישום כרונולוגי של כל תיקוני האבטחה שבוצעו, מה חי בפרודקשן, ומה נשאר —
> כדי שאפשר יהיה להמשיך מכל נקודה. הפירוט המלא של כל פרצה (exploit + fix) נמצא ב-
> [`SYSTEM_REVIEW_AND_REFACTOR.md`](./SYSTEM_REVIEW_AND_REFACTOR.md) §3; כאן — היומן והמצב.

עודכן לאחרונה: 2026-07-12.

---

## מקרא
✅ בוצע וחי בפרודקשן · ⏭️ דולג לבקשת המשתמש · ☐ פתוח

---

## גל 0 — עצירת דימום (PR #128, live)
| # | תיקון | קבצים |
|---|-------|-------|
| ✅ 3.1 | מחיקת ה-backdoor `GET /auth/admin-bypass` (endpoint + service + קריאת frontend) | `auth.controller.ts`, `auth.service.ts`, `AdminLayout.tsx` |
| ✅ 3.4 | org-ownership על מחיקות (building/floor/restroom/device/property) — 404 אם לא שייך | `buildings.service.ts`, `buildings.controller.ts` |
| ✅ 3.6 | JWT fail-fast — הסרת `?? 'fallback-secret'` | `jwt.strategy.ts` |

## גל 1 — הרשאות (PR #130, live)
| # | תיקון | קבצים |
|---|-------|-------|
| ✅ 3.2 | `RolesGuard` גלובלי + `@Roles` + ולידציית role ב-`createAdmin` (חוסם CLEANER→SUPER_ADMIN) | `common/guards/roles.guard.ts`, `common/decorators/roles.decorator.ts`, `users/analytics/buildings/incidents` controllers, `users.service.ts` |
| ✅ 3.9/3.10 | `push/diagnose`, `push/test`, `kiosk-diagnose` → admin-only + org-scoped | `push.controller.ts`, `push.service.ts`, `buildings.*` |
| ✅ 3.11 | analytics org-scope: `restroomScope`+`getSummary` תמיד כוללים `orgId` | `analytics.service.ts` |

## גל 2 — עמידות (PR #131 + build-fix #132, live)
| # | תיקון | קבצים |
|---|-------|-------|
| ✅ 3.12 | rate-limiting פנימי (בלי תלות): 20/5דק' על login, 60/5דק' על verify-* | `common/guards/rate-limit.guard.ts`, `common/decorators/rate-limit.decorator.ts`, `auth.controller.ts`, `users.controller.ts` |
| ✅ 3.13 | DTOs (class-validator) ל-auth + incidents; `SyncBatchDto` עם `ArrayMaxSize` | `auth/auth.dto.ts`, `incidents/incidents.dto.ts` |
| ✅ 3.14 | env fail-fast/warn ב-bootstrap (חוסם עלייה בלי `DATABASE_URL`) | `main.ts` |

## גל 3 — MEDIUM/LOW (PR #139 + PR זה, live)
| # | תיקון | קבצים |
|---|-------|-------|
| ✅ 3.21 | security headers (X-Frame-Options DENY, HSTS, nosniff, Referrer-Policy) | `main.ts` |
| ✅ 3.19 | mass-assignment: allowlist מפורש ב-`updateOrgSettings` + `updateTemplate` | `users.service.ts`, `buildings.service.ts` |
| ✅ 3.20 | `CRON_SECRET` header-only + `timingSafeEqual` | `email.controller.ts` |
| ✅ 3.29 | הסרת מטא-נתוני מפתח SSH מ-`GITHUB_STEP_SUMMARY` | `.github/workflows/deploy.yml` |
| ✅ 3.26 | CSV/Formula injection — נטרול תאים (prefix `'`) ביצוא לאקסל | `web/src/lib/export.ts` |
| ✅ 3.27 | refresh-token rotation + revocation + logout + single-flight refresh | ראה למטה |

### פירוט 3.27 (refresh rotation) — המורכב ביותר
- **DB:** מודל חדש `RefreshToken` (`refresh_tokens`) — `jti` unique, `userId`, `expiresAt`.
  מיגרציה: `prisma/migrations/20260712160000_add_refresh_tokens/`.
- **שרת:** `generateTokens` יוצר שורת session עם `jti` ומטמיע אותו ב-refresh JWT.
  `refreshToken()` מסובב (מוחק את ה-jti הישן; אם כבר נמחק → 401 = זיהוי reuse).
  `logout()` חדש מוחק את ה-session. endpoint `POST /auth/logout`.
- **לקוח:** `api.ts` — single-flight refresh (**חובה** עם rotation, אחרת 401 מקבילים → logout).
  `AdminLayout` logout קורא ל-`/auth/logout`.
- **תאימות אחורה:** tokens ישנים (בלי `jti`) מתקבלים פעם אחת ומשודרגים ל-session — אין logout המוני בזמן ה-deploy.

---

## ⏭️ דולג לבקשת המשתמש (פתוח בכוונה)
| # | מה | למה דולג |
|---|-----|----------|
| ⏭️ 3.3 | `changePassword`/user-mutations org-scoping (IDOR) | המשתמש ביקש לדלג |
| ⏭️ 3.5 | WebSocket handshake auth (מדליף ת"ז בפיד) | המשתמש רוצה שמנהלים ימשיכו לראות ת"ז |
| ⏭️ 3.7 | חיוב orgId/2FA בהתחברות מנקה | דורש שינוי UI; ההגנה בפועל = rate-limit (בוצע) |
| ⏭️ 3.16 | `reassignDevice` ציבורי | נוגע בבורר-הקיוסק |
| ⏭️ 3.17 | פעולות incident ציבוריות (impersonation ע"י ת"ז) | דורש session מנקה — שינוי בזרימת קיוסק/מנקה |
| ⏭️ 3.23 | `push/subscribe` עם userId מהגוף | ה-PWA נרשם לפני התחברות מלאה |
| ⏭️ 3.24 | auto-create מכשירים/סנסורים ציבורי | דורש device token |
| ⏭️ 3.25 | tokens ב-localStorage → httpOnly cookie | שינוי ארכיטקטוני (שרת+לקוח+CSRF) |

## ☐ נשאר (לא נדון עדיין) — גלים 4-6
- **3.8** — יתר ה-IDOR ב-*עריכות* (updateBuilding/Floor/Restroom, sensors updateConfig, kiosk-templates) — org-scope חסר.
- **גל 4 (תקינות §6):** באגי timezone (production ב-UTC, `setHours` חותך לפי UTC), טרנזקציות במחיקות מדורגות, dedup ב-checkin, TOCTOU ב-create, ולידציית limit/date, N+1.
- **גל 5 (ניקוי §4-5):** קוד מת (SMTP legacy, endpoints יתומים), טיפוס `AuthUser`, ריכוז scoping/include, פיצול קבצים ענקיים, `useKioskCore`.
- **גל 6:** בדיקות e2e ל-regressions (§2.6) ב-CI.

---

## הערות תפעוליות (לקחים — לקרוא לפני ההמשך)
1. **Typecheck לפני push:** הרץ `cd apps/server && rm -f *.tsbuildinfo && npx tsc -p tsconfig.build.json --noEmit`.
   `tsc --noEmit` הרגיל עם cache **פספס** שגיאה שה-`nest build` ב-VPS תפס (הפיל deploy #214).
2. **Prisma לא מותקן מקומית** — `npx prisma` מושך v7 שלא תואם ל-schema v5. אי אפשר לאמת `prisma.*` calls
   מקומית (הלקוח לא מיוצר); ה-VPS מריץ `prisma generate` (v5) לפני ה-build (deploy.sh:219). ודא ידנית
   שקריאות prisma תואמות ל-schema.
3. **מיגרציות:** deploy.sh מזהה שינוי ב-`prisma/(migrations|schema.prisma)` → `migrate deploy` + `generate`
   + גיבוי טרום-מיגרציה. **לעולם לא** `db push --accept-data-loss`. תוספת טבלה = לא-הרסני (migrate deploy מאשר).
4. **תהליך deploy:** merge ל-`main` → deploy.yml → אמת ✅ דרך עמוד ה-checks של ה-commit
   (`/commit/<sha>/checks`) — לא דרך רשימת ה-runs (WebFetch עם cache 15 דק' מטעה).
5. **הרבייס:** כל PR ממוזג כ-squash; לפני PR חדש עשה
   `git rebase --onto origin/main <tip-של-הגל-הקודם> <branch>` כדי לדחוף רק את הדלתא.
