# Toilet Monitor — Claude Working Notes

## Autonomous merge/push/deploy authorization

The user has explicitly authorized Claude to handle the full merge/push/deploy cycle without asking for confirmation each time. The expectation is: **never leave changes un-pushed — every change should be live on the web immediately after it's made.**

This includes:
- Pushing commits to feature branches (and force-pushing to Claude-owned branches like `claude/update-git-files-*`)
- Opening pull requests
- **Merging PRs to `main`** (squash by default) and triggering deploys
- Pushing trivial commits to `main` to re-trigger a deploy when needed
- Editing GitHub Release notes via `gh release edit`

Still ask before:
- Force-pushing to `main`
- Deleting branches with unmerged work
- Anything that touches production data (DB resets, dropping tables, `--accept-data-loss`)

---

## Pre-push checklist (run BEFORE every push)

### 1. TypeScript — use `tsc -b` for web, not just `tsc --noEmit`
```bash
cd apps/server && npx tsc --noEmit
cd ../web && npx tsc -b
```
`tsc --noEmit` passes locally even when `tsc -b` fails on the server. `tsc -b` respects project references and catches errors that only appear in the actual build.

### 2. New npm packages → verify `deploy.sh` runs `pnpm install`
The server has no local `node_modules` — it only installs what `deploy.sh` tells it to. After `pnpm add ...`, confirm `scripts/deploy.sh` has `pnpm install --frozen-lockfile` BEFORE the build steps.

### 3. Service workers (`sw.ts`, `*.sw.ts`) → exclude from `tsconfig.app.json`
SW files use `lib: WebWorker` which conflicts with `lib: DOM`. Add to `"exclude"`:
```json
"exclude": ["src/sw.ts"]
```
Vite PWA (injectManifest) compiles SW independently — it does NOT go through `tsc -b`.

### 4. TypeScript 5 strict generics — cast `.buffer as ArrayBuffer`
TS 5.6+ makes `Uint8Array<ArrayBufferLike>`. Web APIs (PushSubscription, crypto) expect `ArrayBuffer`. Always:
```ts
return output.buffer as ArrayBuffer;
```

### 5. Database — NEVER `prisma db push --accept-data-loss` in production
This silently DROPS tables/columns and **deletes production data**.
- **Production:** `prisma migrate deploy` (refuses destructive ops)
- **Dev:** `prisma migrate dev` (creates migration files)
- Schema changes go through `prisma/migrations/`
- `deploy.sh` runs a pre-migration backup automatically

---

## Versioning

### "תדחוף / עדכן לגרסה האחרונה" (push / update latest version)
Update the existing latest version — do NOT create a new tag.
1. Update README version badge + changelog entry for current version
2. Commit + push to main (via PR + auto-merge)
3. Update existing GitHub Release: `gh release edit vX.Y.Z --notes "..."`
4. Do NOT run `git tag` or `gh release create`

### "צור / תוציא גרסה חדשה" (create a new version)
Bump patch: current `vX.Y.Z` → new `vX.Y.(Z+1)`.
1. Update README: bump badge + add new changelog entry at top
2. `git commit -m "docs: bump README to vX.Y.(Z+1)"` + push (PR + merge)
3. After merge to main: `git tag -a vX.Y.(Z+1) -m "..."` and `git push origin vX.Y.(Z+1)`
4. `gh release create vX.Y.(Z+1) --title "..." --notes "..."`

Always run `git tag -l "v*"` first to confirm current latest tag. Never skip the README update.

---

## Deployment

- Push to `main` → `.github/workflows/deploy.yml` → SSH to VPS → `scripts/deploy.sh` → PM2 restart
- Production URL: https://toiletcleanpro.duckdns.org (VPS `188.166.163.75`, app at `/opt/toilet-monitor`)
- PM2 process: `toilet-server` (logs at `/var/log/toilet/out.log`)
- Concurrency group: `deploy-production`, `cancel-in-progress: true`
- Failures auto-email via Gmail API (`notify-on-failure` job)

### deploy.sh flow
1. `git pull` → source `.env.production`
2. Inject CI secrets (VAPID, Gmail OAuth, CRON_SECRET, GITHUB_PAT) — **trim CR/LF before writing** (GitHub Secrets sometimes carry trailing newlines that break OAuth)
3. `pnpm install --frozen-lockfile`
4. Pre-migration DB backup (`/var/log/toilet/backups/`)
5. `prisma migrate deploy` (NOT `db push --accept-data-loss`)
6. Build server → `pm2 restart toilet-server --update-env`
7. Build web → copy `dist/` to nginx root → reload nginx
8. Post-deploy nginx default-page check + recovery

### GitHub Secrets
SSH (`SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`), VAPID (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`), Gmail OAuth (`GMAIL_USER`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`), `CRON_SECRET`, `GH_PAT`, optional `DEPLOY_NOTIFY_TO`.

---

## Email (Gmail API, not SMTP)

- DigitalOcean blocks SMTP ports 465/587 → using Gmail REST API over OAuth2
- Daily report runs in-app at 8:00 Asia/Jerusalem (NestJS `@Cron`), no longer via GitHub Actions
- Diagnose endpoint: `GET /api/email/diagnose` (JWT) — surfaces OAuth status, recipients, last attempt
- Browser console snippet:
  ```js
  fetch('/api/email/diagnose',{headers:{Authorization:'Bearer '+localStorage.getItem('accessToken')}}).then(r=>r.json()).then(d=>console.log(JSON.stringify(d,null,2)))
  ```

---

## Project context

| Layer | Tech |
|-------|------|
| Monorepo | pnpm workspaces (pnpm 9, lockfileVersion 9.0) |
| Frontend | React 19, Vite 6, Tailwind v4, React Router 7, TanStack Query 5, Zustand, i18next, Recharts, Socket.io client |
| Backend | NestJS 11, Express, Socket.io WS gateway, Passport+JWT, bcrypt |
| DB | PostgreSQL 16 (Docker) + Prisma 5 |
| Cache | Redis 7 (Docker, ioredis — partial) |
| PWA | vite-plugin-pwa (injectManifest), Workbox, Web Push (VAPID) |
| Process | PM2 + nginx reverse proxy |
| Hosting | DigitalOcean Ubuntu 22.04, DuckDNS + Let's Encrypt |

### Repo structure
```
apps/{web,server}     packages/shared-types
scripts/{deploy.sh,server-setup.sh,nginx-watchdog.sh}
.github/workflows/deploy.yml
.husky/                — pre-push: tsc --noEmit (server) + tsc -b (web)
```

### Branches & remote
- `origin` = `https://github.com/toiletmon3/toilet-monitor.git` (company)
- Personal `OriAha/toilet-monitor` is archived (read-only backup)
- Branches: `main` (production), `stable`, `feature/*`, `claude/*`

### DB schema (Prisma)
Models: Organization → Building → Floor → Restroom → Device, User (with roles), Incident → IncidentAction, IssueType, KioskTemplate, CleanerArrival, PushSubscription.
Roles: SUPER_ADMIN, ORG_ADMIN, MANAGER, SHIFT_SUPERVISOR, CLEANER.

### Conventions
- Conventional commits (`feat:`, `fix:`, `chore:`, `docs:`, `ci:`)
- Hebrew UI with i18n (he/en), code in English
- Pre-push enforced via Husky

---

## Past failures → preventions

| Failure | Root cause | Prevention |
|---------|-----------|------------|
| `Cannot find module 'web-push'` | deploy.sh missing `pnpm install` | Always check deploy.sh after adding packages |
| `sw.ts` ServiceWorker type errors | SW included in DOM-lib tsconfig | Exclude `*.sw.ts` from tsconfig.app.json |
| `Uint8Array<ArrayBufferLike>` | TS5 strict generics | `tsc -b` pre-push; cast `.buffer as ArrayBuffer` |
| Unused var caught only on server | `tsc --noEmit` lenient, `tsc -b` strict | Always `tsc -b` on web pre-push |
| **All production data deleted** | `prisma db push --accept-data-loss` | Use `prisma migrate deploy` only |
| Default nginx page after deploy | deploy.sh wrote HTTP-only config | deploy.sh now detects SSL + post-deploy health check |
| Daily emails silently failing | Gmail OAuth secrets never injected; later, trailing `\n` in secrets | trim() in deploy.sh; `/api/email/diagnose` for live diagnosis |
| Stuck deploy queue | `cancel-in-progress: false` blocked everything | Use `cancel-in-progress: true` |
