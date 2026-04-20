# Amazon Echo Show 15 — מחקר התאמה ל-ToiletMon

## תקציר

מסמך זה בודק האם ה-Amazon Echo Show 15 יכול לשמש כמסך קיוסק עבור ToiletMon, ובמיוחד האם ניתן לגשת לחיישני המכשיר (מצלמה/נוכחות) כדי לספור אנשים שעוברים לידו.

---

## 1. שימוש כמסך Kiosk

### מה יש ל-Echo Show 15?

| תכונה | פרט |
|--------|------|
| מסך | 15.6 אינץ' Full HD (1920×1080), landscape או portrait |
| מעבד | MediaTek MT8696 (AZ2 Neural Edge) |
| מצלמה | 5MP עם Visual ID |
| מערכת הפעלה | Fire OS (Android-based) |
| דפדפן מובנה | Amazon Silk |
| Wi-Fi | Dual-band 802.11ac |

### האם ניתן להציג את ToiletMon על המסך?

**כן, אבל עם מגבלות משמעותיות.**

#### אופציה א — דפדפן Silk (פשוט, לא אמין)

- אפשר לפתוח Silk עם הפקודה "Alexa, Open Silk"
- לנווט ל-`https://toiletcleanpro.duckdns.org/kiosk/{deviceCode}`
- **בעיה:** Silk חוזר אוטומטית למסך הבית של Alexa אחרי כמה דקות
- **מעקף חלקי:** הוספת סקריפט "Keep Silk Open" שמונע סגירה אוטומטית:
  ```html
  <script>var AlwaysUseSilk=true; var SilkVisualMode=true;</script>
  <script defer src="https://dagammla.gitlab.io/keep-silk-open/keep.js"></script>
  ```
- **לא מומלץ** — פתרון שביר, תלוי בסקריפט חיצוני, Amazon יכולה לחסום בכל עדכון

#### אופציה ב — Sideloading של Fully Kiosk Browser (מורכב, לא מובטח)

- Amazon חסמה את ADB ו-sideloading רשמי מפברואר 2023
- קיים מעקף דרך מנהל הקבצים המובנה של Android, אבל:
  - Amazon יכולה לחסום בעדכון firmware
  - דורש ידע טכני
  - לא ניתן לסמוך על זה לסביבת ייצור
- **לא מומלץ** — לא יציב לשימוש עסקי

### סיכום — כמסך Kiosk

| קריטריון | Echo Show 15 | טאבלט אנדרואיד/iPad |
|-----------|-------------|---------------------|
| הצגת ToiletMon | ⚠️ עם מעקפים | ✅ מושלם |
| Fully Kiosk Browser | ❌ חסום | ✅ נתמך |
| מצב קיוסק נעול | ❌ לא קיים | ✅ Screen Pinning / Guided Access |
| יציבות לטווח ארוך | ❌ Amazon שולטת | ✅ מלא |
| עלות | ~700–1,000 ₪ | 300–500 ₪ |

**מסקנה:** ה-Echo Show 15 **אינו מתאים כמסך קיוסק** עבור ToiletMon. טאבלט אנדרואיד רגיל זול יותר, אמין יותר, ותומך ב-Fully Kiosk Browser ו-Screen Pinning.

---

## 2. גישה לחיישנים — ספירת אנשים

### מה חושף ה-Echo Show 15?

ל-Echo Show 15 יש מצלמה עם יכולות Visual ID וזיהוי נוכחות. Amazon חושפת את היכולות האלה דרך שני ממשקי API:

### 2.1 APL Entity-Sensing Extension

**URI:** `alexaext:entitysensing:10`

ממשק שעובד בתוך Alexa Skills עם APL (Alexa Presentation Language). מספק:

| יכולת | פרט |
|--------|------|
| `PrimaryUser.isSeen` | `true`/`false` — האם המכשיר מזהה משתמש |
| `PrimaryUser.id` | מזהה ייחודי לכל אדם שמזוהה |
| `PrimaryUser.poise.absoluteAngle` | זווית האדם ביחס למכשיר |
| `OnPrimaryUserChanged` | event שנורה כשמשתמש חדש מזוהה או שהנוכחי עוזב |

**מגבלות קריטיות:**
- ✅ מזהה אם יש מישהו — `isSeen: true/false`
- ✅ נותן `id` ייחודי לכל אדם
- ❌ **מזהה רק "Primary User" אחד** — לא סופר כמה אנשים בו-זמנית
- ❌ **עובד רק בתוך Alexa Skill פעיל** — אי אפשר להשתמש ברקע
- ❌ **לא מספק feed מצלמה** — רק מידע מובנה (seen/not seen, angle)
- ❌ **אין API לשלוח נתונים לשרת חיצוני ישירות** מתוך ה-APL

### 2.2 Web API Entity-Sensing Extension (Alexa Web API for Games)

ממשק JavaScript שעובד בתוך Alexa Web App (HTML5):

```javascript
Alexa.create({version: "1.1"})
  .then(async ({alexa, createExtensionsMessageProvider}) => {
    if (alexa.capabilities.extensions['alexaext:entitysensing:10']) {
      entitySensing = await EntitySensing.create(createExtensionsMessageProvider);
      
      // בדיקה אם יש מישהו
      let isSeen = entitySensing.primaryUser.isSeen;
      let userId = entitySensing.primaryUser.id;
    }
  });
```

**אותן מגבלות** כמו ב-APL — רק Primary User אחד, רק בתוך skill פעיל.

### 2.3 Alexa.SmartVision.ObjectDetectionSensor

ממשק לזיהוי אובייקטים (בני אדם, חבילות). מיועד ל-smart home skills:

- מזהה אובייקטים מסוג `PERSON`
- שולח הודעות לאפליקציית Alexa
- **דורש שהמשתמש יפעיל** את הזיהוי דרך אפליקציית Alexa
- **לא מספק ספירה** — רק "זוהה אובייקט"
- **לא שולח נתונים לשרת חיצוני** — רק notifications ל-Alexa app

---

## 3. האם אפשר לספור אנשים עם Echo Show 15?

### תשובה: לא באופן ישיר ומעשי.

| דרישה | מצב |
|--------|------|
| זיהוי אם עובר מישהו | ⚠️ חלקי — רק Primary User |
| ספירת כמה אנשים עברו | ❌ אין API לזה |
| ספירה רציפית ברקע | ❌ רק בזמן ש-Skill פעיל |
| שליחת נתונים ל-ToiletMon API | ❌ אין דרך ישירה |
| ספירה בו-זמנית של מספר אנשים | ❌ רק PrimaryUser אחד |
| גישה ל-feed המצלמה | ❌ חסום לחלוטין |

### מעקף תיאורטי (לא מומלץ)

אפשר בתיאוריה לבנות Alexa Skill שמשתמש ב-Entity Sensing ו:
1. מנטר שינויים ב-`PrimaryUser.id` כדי לזהות אנשים חדשים
2. שולח counter ל-Lambda function
3. ה-Lambda שולח webhook ל-ToiletMon API

**למה זה לא מעשי:**
- ה-Skill חייב להיות **פעיל על המסך** — אם המשתמש אומר "Alexa, stop" או ש-Skill עושה timeout, הספירה נעצרת
- מזהה רק **Primary User אחד** — אם שני אנשים עוברים, נספר רק אחד
- **Entity Sensing לא נועד לספירה** — הוא מיועד להתאמת ממשק למשתמש הנוכחי
- Amazon יכולה לשנות/לחסום את ה-API
- דורש חשבון Amazon Developer, Lambda, ועלויות AWS

---

## 4. חלופות מומלצות לספירת אנשים

אם הצורך הוא לספור אנשים שעוברים ליד השירותים, הנה חלופות טובות יותר:

### אופציה א — חיישן PIR (Passive Infrared) + ESP32

| פרט | ערך |
|------|------|
| חומרה | ESP32 + HC-SR501 PIR sensor |
| עלות | ~30–50 ₪ |
| חיבור | Wi-Fi ישירות ל-ToiletMon API |
| יכולת | ספירת מעברים (כניסה/יציאה) |
| אמינות | גבוהה מאוד |

```
ESP32 + PIR → HTTP POST → ToiletMon API /api/sensors/count
```

ToiletMon כבר מכיל `DeviceType.SENSOR` ב-Prisma schema ו-shared-types — תשתית מוכנה.

### אופציה ב — חיישן ToF (Time of Flight) + ESP32

| פרט | ערך |
|------|------|
| חומרה | ESP32 + VL53L1X ToF sensor |
| עלות | ~50–80 ₪ |
| חיבור | Wi-Fi ישירות ל-ToiletMon API |
| יכולת | ספירה מדויקת + כיוון (כניסה/יציאה) |
| אמינות | גבוהה מאוד, מדויק יותר מ-PIR |

### אופציה ג — חיישן beam-break (IR barrier)

| פרט | ערך |
|------|------|
| חומרה | ESP32 + זוג פוטו-סנסורים IR |
| עלות | ~40–60 ₪ |
| חיבור | Wi-Fi ישירות ל-ToiletMon API |
| יכולת | ספירה כיוונית (שני סנסורים = כניסה vs יציאה) |
| אמינות | גבוהה, פשוט להתקנה |

### השוואה

| קריטריון | Echo Show 15 | ESP32 + PIR | ESP32 + ToF |
|-----------|-------------|-------------|-------------|
| ספירת אנשים | ❌ | ✅ | ✅ |
| ספירה רציפית 24/7 | ❌ | ✅ | ✅ |
| עלות | ~700–1,000 ₪ | ~30–50 ₪ | ~50–80 ₪ |
| שליחה ל-API | ❌ | ✅ ישירות | ✅ ישירות |
| כיוון (כניסה/יציאה) | ❌ | ⚠️ צריך שניים | ✅ מובנה |
| מורכבות התקנה | גבוהה | נמוכה | נמוכה-בינונית |
| תלות ב-Amazon | כן | לא | לא |
| תאימות ל-ToiletMon | ❌ | ✅ DeviceType.SENSOR קיים | ✅ DeviceType.SENSOR קיים |

---

## 5. המלצה

### לקיוסק (מסך) — להשאר עם טאבלט אנדרואיד / iPad
- עלות נמוכה יותר (300–500 ₪ vs 700–1,000 ₪)
- Fully Kiosk Browser עובד מושלם
- Screen Pinning / Guided Access לנעילה
- ToiletMon כבר תומך בזה לגמרי

### לספירת אנשים — ESP32 + חיישן (PIR / ToF)
- עלות נמוכה (30–80 ₪)
- ספירה רציפית 24/7
- שליחה ישירה ל-ToiletMon API דרך Wi-Fi
- `DeviceType.SENSOR` כבר קיים ב-schema — צריך רק לבנות:
  1. API endpoint לקליטת נתוני ספירה (`POST /api/sensors/count`)
  2. קוד ESP32 (Arduino/MicroPython) שמדווח מעברים
  3. דשבורד Analytics לתצוגת נתוני ספירה

### Echo Show 15 — לא מומלץ
- לא מתאים כקיוסק (אין kiosk mode, סגירה אוטומטית, יקר)
- לא מתאים לספירת אנשים (API מוגבל, Primary User בלבד, לא רציף)
- תלות מלאה ב-Amazon — שינויים ב-firmware/API יכולים לשבור הכל

---

## 6. קישורים רלוונטיים

- [APL Entity-Sensing Extension](https://developer.amazon.com/en-US/docs/alexa/alexa-presentation-language/apl-ext-entity-sensing.html)
- [Web API Entity-Sensing Extension](https://developer.amazon.com/en-US/docs/alexa/web-api-for-games/alexa-games-extensions-entitysensing.html)
- [SmartVision ObjectDetectionSensor](https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-smartvision-objectdetectionsensor.html)
- [Echo Show Device Specifications](https://developer.amazon.com/docs/device-specs/device-specifications-echo-show.html)
