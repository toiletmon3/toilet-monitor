# 🔐 Backup & Access Checklist

מסמך זה מפרט את **כל הנכסים הקריטיים** של המערכת — מה שחייב להיות מגובה ונגיש תמיד.

**חוק ברזל:** שמור את כל הסודות במנהל סיסמאות (1Password / Bitwarden / LastPass). לעולם לא ב-Google Keep או ב-WhatsApp.

---

## 1️⃣ GitHub (הקוד + CI/CD)

### מה יש שם
- `toiletmon3/toilet-monitor` — כל הקוד (company repo)
- GitHub Actions — CI/CD workflow
- Secrets: `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`

### מה לגבות
| פריט | איך |
|------|-----|
| סיסמת החשבון | ✅ שמור במנהל סיסמאות |
| 2FA recovery codes | ⚠️ הדפס ושמור במקום בטוח. [הגדרות 2FA](https://github.com/settings/security) |
| SSH key של המחשב שלך | 📁 `~/.ssh/id_rsa` + `~/.ssh/id_rsa.pub` (אם קיים) |
| Personal Access Token | אם יצרת PAT — שמור אותו. גם אפשר ליצור חדש בכל עת |

### פעולות חשובות
```bash
# ליצור backup מלא של ה-repo (לא רק הקוד — גם issues, wiki, releases)
gh repo clone toiletmon3/toilet-monitor
# או שימוש ב-"Repository migration" בהגדרות GitHub
```

---

## 2️⃣ DigitalOcean (השרת)

### מה יש שם
- Droplet (VPS): `188.166.163.75` · Ubuntu 22.04 · 2 vCPU / 2GB RAM
- חיוב חודשי: ~$12

### מה לגבות
| פריט | איפה נמצא | איך לגבות |
|------|-----------|-----------|
| פרטי כניסה ל-DigitalOcean | הדפדפן שלך | ✅ מנהל סיסמאות |
| 2FA + recovery codes | [Security settings](https://cloud.digitalocean.com/account/security) | ⚠️ הדפס |
| פרטי תשלום (אשראי) | חשבון DigitalOcean | — (כבר שמור אצלם) |
| IP של ה-Droplet | `188.166.163.75` | 📝 ב-README |
| SSH Private Key לשרת | `~/.ssh/id_rsa` במחשב שלך | ⚠️ **חייב גיבוי** |
| SSH Private Key ב-GitHub Secrets | Secret `SSH_PRIVATE_KEY` | 📁 המפתח המקורי במחשב שלך |
| Droplet snapshot | ידני (ראה למטה) | 💾 בדיסק של DigitalOcean |

### יצירת Snapshot של הדרופלט (!)

**זה הגיבוי החשוב ביותר — תמונת מצב מלאה של השרת:**

1. היכנס ל-[DigitalOcean Cloud](https://cloud.digitalocean.com/droplets)
2. בחר את ה-Droplet שלך
3. תפריט ← **Snapshots** ← **Take Snapshot**
4. שם מוצע: `toilet-monitor-v1.0.0-stable`
5. עלות: ~$0.06/GB לחודש (זניח)

**שלוף snapshot ב-command line:**
```bash
# התקן doctl (DigitalOcean CLI) פעם אחת
brew install doctl        # macOS
choco install doctl       # Windows

doctl auth init          # הכנס API token
doctl compute droplet list
doctl compute droplet-action snapshot <DROPLET_ID> --snapshot-name "toilet-v1.0.0"
```

### הפעלת גיבוי אוטומטי (מומלץ!)
Droplets ← Backups ← Enable Weekly Backups (עולה ~20% ממחיר הדרופלט, בערך $2.4/חודש נוסף)

---

## 3️⃣ DuckDNS (הדומיין)

### מה יש שם
- דומיין: `toiletcleanpro.duckdns.org`
- Token לעדכון IP אוטומטי

### מה לגבות
| פריט | איפה נמצא | איך לגבות |
|------|-----------|-----------|
| חשבון DuckDNS | מחובר דרך GitHub / Google | ✅ אותו חשבון — ודא שאתה יודע איזה |
| DuckDNS Token | [duckdns.org](https://www.duckdns.org) (מוצג למעלה) | ⚠️ **שמור במנהל סיסמאות** |
| הסקריפט בשרת שמעדכן IP | בדרך כלל ב-`/root/duckdns/duck.sh` | 📁 גובה עם snapshot של השרת |

**לבדוק את הסקריפט בשרת:**
```bash
ssh root@188.166.163.75
cat ~/duckdns/duck.sh       # מציג את הסקריפט + הטוקן
crontab -l                  # מציג את ה-cron שמריץ אותו
```

### למה זה חשוב?
אם תעבור לשרת אחר (למשל, מ-DigitalOcean ל-AWS), תצטרך את הטוקן כדי לעדכן את ה-DNS לכתובת החדשה.

---

## 4️⃣ קבצים בשרת (הגדרות + סודות)

### מה יש שם
על ה-Droplet `188.166.163.75`, יש קבצים שלא נמצאים ב-git.

### מה לגבות
| קובץ | מה יש בו | איך לגבות |
|------|---------|-----------|
| `/opt/toilet-monitor/.env.production` | DB password · JWT secrets · Redis URL | ⚠️ **קריטי — העתק לעצמך** |
| `/etc/nginx/sites-available/toilet` | קונפיג Nginx + SSL | 💾 כלול ב-snapshot |
| `/etc/letsencrypt/` | תעודות SSL | 💾 כלול ב-snapshot |
| `/root/.ssh/authorized_keys` | מפתחות SSH שמורשים להיכנס | 💾 כלול ב-snapshot |
| `/root/duckdns/` | סקריפט עדכון DNS | 💾 כלול ב-snapshot |
| נתוני PostgreSQL | כל הבניינים/עובדים/תקלות | ⚠️ **דרוש backup ייעודי** (למטה) |

### שליפת `.env.production` מהשרת
```bash
# העתק את הקובץ למחשב שלך לגיבוי
scp root@188.166.163.75:/opt/toilet-monitor/.env.production ~/Desktop/toilet-env-backup.txt

# שמור את התוכן במנהל סיסמאות ומחק מהדסקטופ
```

---

## 5️⃣ PostgreSQL (מסד הנתונים)

### מה יש שם
- כל הבניינים, קומות, שירותים, מכשירים
- כל העובדים והמנהלים
- כל התקלות ומשובים היסטוריים
- כל ה-check-in/check-out

### 🔄 גיבוי אוטומטי (מותקן אוטומטית!)

המערכת כוללת **שלוש שכבות גיבוי** שפועלות אוטומטית:

| שכבה | מה | מתי | שמירה | מיקום |
|------|-----|------|-------|-------|
| **Pre-deploy** | `deploy.sh` מגבה לפני כל migration | כל deploy | 20 אחרונים | `/var/log/toilet/backups/pre_deploy_*.sql` |
| **Daily cron** | `scripts/backup.sh` via crontab | כל יום 03:00 | 30 יום | `/var/log/toilet/backups/daily_*.sql.gz` |
| **Docker sidecar** | `docker-compose.databases.yml` backup service | כל 24 שעות | 30 יום | `./backups/backup_*.sql.gz` |

ה-cron מותקן אוטומטית בכל deploy. אין צורך בהגדרה ידנית.

### גיבוי ידני (חד-פעמי)
```bash
ssh root@188.166.163.75

# הרצת הסקריפט ידנית
bash /opt/toilet-monitor/scripts/backup.sh

# או dump ישיר
docker exec toilet_postgres pg_dump -U postgres toilet_monitor > /root/toilet-db-$(date +%Y%m%d).sql

# הורד למחשב שלך
exit
scp root@188.166.163.75:/var/log/toilet/backups/daily_*.sql.gz ~/Desktop/
```

### שחזור מגיבוי

**שיטה מומלצת — סקריפט אינטראקטיבי:**
```bash
ssh root@188.166.163.75
cd /opt/toilet-monitor
bash scripts/backup-restore.sh
```
הסקריפט מציג רשימת גיבויים, מבצע גיבוי בטיחותי של המצב הנוכחי לפני השחזור, ומשחזר.

**שחזור ישיר מקובץ:**
```bash
# קובץ דחוס
gunzip -c /var/log/toilet/backups/daily_20260429_030000.sql.gz | \
  docker exec -i toilet_postgres psql -U postgres -d toilet_monitor

# קובץ רגיל
docker exec -i toilet_postgres psql -U postgres -d toilet_monitor < backup.sql
```

### בדיקת תקינות הגיבויים
```bash
# הצגת כל הגיבויים + גודל
ls -lh /var/log/toilet/backups/

# בדיקת הלוג
tail -20 /var/log/toilet/backup.log

# בדיקה שה-cron מותקן
crontab -l | grep backup
```

---

## 6️⃣ Let's Encrypt SSL Certificates

### מה יש שם
התעודות נמצאות ב-`/etc/letsencrypt/live/toiletcleanpro.duckdns.org/` בשרת.
מתחדשות אוטומטית כל 90 יום.

### מה לעשות
- ✅ נכלל ב-snapshot של ה-Droplet
- ⚠️ אם תעבור שרת — תיצור תעודות חדשות (לא להעתיק, קל יותר ליצור עם `certbot`)

---

## 7️⃣ Cloudflare / DNS (אם יהיה בעתיד)

כרגע אתה לא משתמש ב-Cloudflare — DuckDNS מטפל ב-DNS. אבל אם תקנה דומיין משלך (למשל `toiletmon.co.il`), תצטרך:
- חשבון רישום דומיין (Namecheap / GoDaddy / .co.il registrar)
- Cloudflare (חינם, מומלץ) לניהול DNS + CDN

---

## 📋 Checklist מהיר — עשה עכשיו

### אבטחת חשבונות
- [ ] הפעל **2FA ב-GitHub** + שמור recovery codes
- [ ] הפעל **2FA ב-DigitalOcean** + שמור recovery codes
- [ ] שמור את **DuckDNS token** במנהל סיסמאות
- [ ] שמור עותק של **SSH private key** במנהל סיסמאות

### גיבוי שרת
- [ ] שלוף את `.env.production` מהשרת ושמור במנהל סיסמאות
- [ ] צור **snapshot ראשון** של ה-Droplet (`toilet-v1.0.0-stable`)
- [ ] שקול הפעלת **Weekly Backups** ב-DigitalOcean (~$2.4/חודש)

### גיבוי מסד נתונים (✅ רובו אוטומטי!)
- [x] ~~הוסף cron לגיבוי DB אוטומטי~~ — **מותקן אוטומטית ע"י `deploy.sh`**
- [x] ~~גיבוי לפני כל deploy~~ — **מובנה ב-`deploy.sh`**
- [x] ~~Docker backup sidecar~~ — **מובנה ב-`docker-compose.databases.yml`**
- [ ] הרץ `bash scripts/backup.sh` ידנית פעם אחת לוודא שהכל עובד
- [ ] הורד גיבוי אחד למחשב שלך: `scp root@188.166.163.75:/var/log/toilet/backups/daily_*.sql.gz ~/Desktop/`
- [ ] בדוק שה-cron מותקן: `ssh root@188.166.163.75 crontab -l | grep backup`

---

## 🚨 תרחיש חירום — מה אם השרת נמחק?

עם הדברים למעלה מגובים, זה התהליך:

1. קנה Droplet חדש ב-DigitalOcean (או שחזר מ-snapshot)
2. אם משתמש ב-snapshot: הכל עובד מיד, רק צריך לעדכן IP ב-DuckDNS
3. אם בונה מאפס:
   - `ssh` לשרת החדש
   - `git clone https://github.com/toiletmon3/toilet-monitor`
   - העתק את `.env.production` למיקום `/opt/toilet-monitor/`
   - הרץ `bash scripts/server-setup.sh`
   - שחזר DB: `bash scripts/backup-restore.sh /path/to/backup.sql.gz`
   - עדכן את IP ב-DuckDNS (עם הטוקן)
   - רץ certbot להוצאת SSL חדש
   - עדכן GitHub Secret `SSH_HOST` לכתובת החדשה
   - הרץ deploy: `bash scripts/deploy.sh` (מתקין cron גיבוי אוטומטית)

סה"כ — מ-zero לשרת עובד: כ-30 דקות עם כל הסודות בידיים.

---

## 📞 קישורים חשובים

| שירות | URL | חיוב |
|-------|-----|------|
| [GitHub](https://github.com/toiletmon3/toilet-monitor) | Company repo | חינם |
| [DigitalOcean](https://cloud.digitalocean.com/droplets) | Droplet | ~$12/חודש |
| [DuckDNS](https://www.duckdns.org) | Dynamic DNS | חינם |
| [Let's Encrypt](https://letsencrypt.org) | SSL | חינם |
