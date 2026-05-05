# Toilet Monitor — Claude Working Notes

## Autonomous merge/push/deploy authorization

The user has explicitly authorized Claude to handle the full merge/push/deploy cycle without asking for confirmation each time. This includes:

- Pushing commits to feature branches
- Force-pushing to feature branches owned by Claude (e.g. `claude/update-git-files-*`)
- Opening pull requests
- **Merging pull requests** to `main` (use squash merge by default)
- Triggering re-deploys by pushing trivial commits to `main` when needed

Still ask before:
- Force-pushing to `main`
- Deleting branches that contain unmerged work
- Anything that touches production data (DB resets, dropping tables)

## Deployment

- Push to `main` triggers `.github/workflows/deploy.yml` → SSH to VPS → `scripts/deploy.sh` → PM2 restart
- Production URL: https://toiletcleanpro.duckdns.org
- Deploy concurrency group: `deploy-production`, `cancel-in-progress: true`
- Deploy failures auto-email via Gmail API (see `notify-on-failure` job)

## Email (Gmail API, not SMTP)

- DigitalOcean blocks SMTP ports 465/587 → using Gmail REST API over OAuth2
- Required GitHub Secrets: `GMAIL_USER`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`
- Diagnostic endpoint: `GET /api/email/diagnose` (JWT-protected) — surfaces OAuth status, recipients, last attempt
- Daily report cron runs in-app at 8:00 Asia/Jerusalem (NestJS `@Cron`), no longer via GitHub Actions
- Secrets are trimmed in `deploy.sh` before writing to `.env.production` (trailing newlines from copy-paste corrupt OAuth requests)
