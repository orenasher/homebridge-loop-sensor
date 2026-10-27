# homebridge-windy-camera

A **fully standalone** Homebridge plugin that shows a live **Windy.com rain radar** as a camera in Apple Home, with the **current weather and forecast drawn on the picture**, and a **"is it raining right now?" sensor**.

No other plugin (no camera-ui), no external script, no manual files. Install it, pick your city, done.

## Features

- Rain radar (or satellite / clouds / wind / temperature) of your area as a HomeKit camera – snapshot **and** live view
- Current weather + forecast on the image (Open-Meteo, free, no API key)
- **Choose where it appears** (8 positions), the **layout** (compact / card / detailed / banner / your own HTML) and the **theme** – and restyle everything with colors, size, opacity, fonts or your own CSS
- **Image quality** presets: low / medium / high / ultra (or exact width/height/JPEG quality)
- HomeKit **rain sensor** (motion / leak / occupancy / contact – your choice), optional outdoor **temperature** and **humidity** sensors
- **English by default, Hebrew optional** (`"language": "he"`), metric & imperial
- Fully covered by the normal Homebridge backup/restore – everything lives in `config.json`; nothing else to save

## Design templates & the visual settings screen

Open the plugin **Settings** in Homebridge UI: you get a designer with a **live preview** and a gallery of **12 ready-made templates** (Classic, Minimal, Frosted glass, Dark/Light banner, Neon, Sunset, Ocean, Forest, High contrast, Big (TV), Full forecast). Click a template, pick the position on a 3×3 grid, layout, theme, size and forecast days, the image quality and the sensors – then **Save**. The **All settings** button opens the full form (colors, fonts, custom CSS/HTML, Windy layer, intervals…). Anything you set yourself overrides the template.

In `config.json` this is simply `"template": "neon"` (ids: `classic` `minimal` `glass` `banner-dark` `banner-light` `neon` `sunset` `ocean` `forest` `high-contrast` `big-tv` `full-forecast`).

## Dependencies & requirements

**Independent:** this plugin needs **no other Homebridge plugin** (no homebridge-camera-ui) and **no external script or startup hook**. Everything runs inside the plugin.

What it does rely on:

| What | Needed? | Why / how to get it |
| --- | --- | --- |
| Homebridge 1.6+ and Node 18+ | required | – |
| `playwright-core` (npm) | installed automatically | controls the browser; the only dependency the plugin brings |
| **Chromium** on the Homebridge machine | **required** | takes the radar picture: `sudo apt install chromium` (Raspberry Pi OS / Debian / Ubuntu) |
| **ffmpeg** | needed for live view and sharper snapshots | `sudo apt install ffmpeg`, or the optional `ffmpeg-for-homebridge` package. Without it you still get still-image snapshots |
| `fonts-noto-color-emoji` | only for the emoji weather icons | `sudo apt install fonts-noto-color-emoji`, or turn icons off in the settings |
| Internet access to **windy.com** (radar) and **open-meteo.com** (weather, free, no API key) | required | if one is down, the last picture / last weather (up to 3 hours) keeps being shown |

## Installation

Homebridge UI → Plugins → search `homebridge-windy-camera` → Install. Then open the plugin **Settings**, choose your city and save. Restart Homebridge.

### Add the camera to Apple Home

By default the camera is published as a **separate accessory**: Homebridge UI → **Status** → **Unpaired Accessories** → *Windy Camera* → Setup, or in the Home app: **+ → Add Accessory → More options** and enter the same PIN as your Homebridge bridge. (Prefer it inside the bridge? Set *How to expose the camera* to "Inside the Homebridge bridge".)

The sensors are normal bridge accessories and appear in Home automatically after the restart.

## Configuration

Everything is available in the plugin Settings screen. Minimal config:

```json
{
  "platform": "WindyCamera",
  "name": "Rain Radar",
  "city": "כפר יונה"
}
```

Cities can be written in English (`Kfar Yona`) or Hebrew (`כפר יונה`). Custom location: set `"city": "מותאם אישית (הזן קווים ידנית)"` with `"lat"` and `"lon"` (and optionally `"locationName"`).

Full example:

```json
{
  "platform": "WindyCamera",
  "name": "Rain Radar",
  "language": "en",
  "city": "Kfar Yona",
  "quality": "high",
  "captureIntervalMs": 120000,
  "weather": { "units": "metric", "rainDetection": "both" },
  "overlay": {
    "position": "bottom-right",
    "layout": "detailed",
    "theme": "glass",
    "forecastDays": 3,
    "hourlyCount": 4,
    "scale": 1.2
  },
  "sensors": { "rain": true, "rainType": "motion", "temperature": true, "humidity": true },
  "streaming": { "enabled": true, "fps": 5 }
}
```

### Main options

| Option | Values | Default |
| --- | --- | --- |
| `language` | `en` (default) · `he` – language of the overlay, log messages and default names | `en` |
| `aspectRatio` | `16:9` · `4:3` · `13:9` (the old 1300×900 shape). **Use 16:9 to avoid black bars in the Home app** | `16:9` |
| `quality` | `low` · `medium` · `high` · `ultra` (2x sharpness, heavy). With 16:9: 960×540 · 1280×720 · 1600×900 · 1600×900 @2x | `high` |
| `width`, `height`, `jpegQuality` | override the preset (an explicit width/height wins over aspectRatio) | – |
| `captureIntervalMs` | ≥ 30000 | 120000 |
| `windyOverlay` | `radar` `satellite` `rain` `clouds` `wind` `temp` | `radar` |
| `zoom` | 3–12 | 9 |
| `template` | see ids above | `classic` |
| `overlay.position` | `top-left` `top-center` `top-right` `middle-left` `middle-right` `bottom-left` `bottom-center` `bottom-right` | `top-left` |
| `overlay.layout` | `compact` `card` `detailed` `banner` `custom` | `card` |
| `overlay.theme` | `dark` `light` `glass` `transparent` `custom` | `dark` |
| `overlay.scale` / `opacity` / `margin` / `borderRadius` | numbers | 1 / 0.85 / 24 / 16 |
| `overlay.textColor` / `backgroundColor` / `accentColor` / `fontFamily` | any CSS value | theme |
| `overlay.forecastDays` / `hourlyCount` | 0–5 / 0–8 | 3 / 0 |
| `overlay.show*` | City, FeelsLike, Humidity, Wind, RainStatus, Timestamp | all on |
| `overlay.icons` | emoji icons on/off | on |
| `sensors.rainType` | `motion` `leak` `occupancy` `contact` | `motion` |
| `weather.rainDetection` | `both` `precipitation` `weatherCode` | `both` |
| `weather.rainThresholdMm` | mm | 0.1 |
| `weather.rainConfirmReadings` | 1-6; rain must appear in this many consecutive refreshes before the sensor turns on (turns off immediately). Reduces false alerts | 2 |
| `cameraMode` | `external` `bridged` | `external` |

### Design it yourself

- **Colors/size:** `textColor`, `backgroundColor` (e.g. `rgba(0,0,0,.5)`), `accentColor`, `scale`, `fontFamily`.
- **Custom CSS:** the overlay is `#wc-overlay` with the classes `.wc-city .wc-icon .wc-temp .wc-desc .wc-stats .wc-rain .wc-row .wc-cell`. Example: `"customCss": "#wc-overlay{border:2px solid #fff} .wc-temp{font-size:70px}"`.
- **Own template:** `"layout": "custom"` and `"customHtml": "<b>{{city}}</b> {{icon}} {{temp}}{{unit}} – {{rain}}"`. Placeholders: `{{city}} {{icon}} {{temp}} {{unit}} {{desc}} {{feels}} {{humidity}} {{wind}} {{windUnit}} {{rain}} {{rainIcon}} {{time}} {{forecast}}`.

### The rain sensor

HomeKit has no "rain" sensor, so choose the type that suits you. **Motion** (notifications + automations: "when motion is detected → …") is the most flexible. Contact: *open* = raining. Rain is detected when Open-Meteo reports measured precipitation above the threshold **or** a rain/drizzle/shower/thunderstorm weather code (configurable).

## Map styles (colorful / satellite)

By default the picture is the Windy map (gray base). In the settings screen ("Map style") or via the `map` block you can pick a more colorful base instead:

| `map.style` | Look |
|---|---|
| `windy` | Windy website (default) |
| `satellite` | Satellite photo (Esri World Imagery) |
| `streets` | OpenStreetMap, colorful |
| `voyager` | Colorful street map (Esri World Street Map) |
| `dark` | Dark map (Esri Dark Gray) |
| `topo` | Topographic map |
| `custom` | Your own tile URL in `map.customTileUrl` (must contain `{z}`, `{x}`, `{y}`) |

Other options: `map.radar` (show rain radar), `map.radarColors` (`rainbow`, `twc`, `nexrad`, `titan`, `original`, `blue`, `meteored`, `darksky`), `map.radarOpacity`, `map.marker`, `map.attribution`.
Non-Windy styles use free map tiles plus RainViewer radar (max zoom 7, so the radar looks slightly softer than Windy). They need internet access to the tile servers; if no tiles load, the previous picture is kept and a warning is logged. Map credits are drawn on the image (can be turned off, please keep them where licenses require).

## How it works

Every `captureIntervalMs` the plugin opens Windy's embedded map in headless Chromium, draws the weather card on top and saves one JPEG. HomeKit snapshots and the live view (ffmpeg → SRTP) serve that image. Weather comes from [Open-Meteo](https://open-meteo.com/). The plugin has no startup hooks and touches no files outside the Homebridge storage folder (`windy-camera/rain.jpg`).

## Upgrading from 1.x

Version 2 no longer needs **homebridge-camera-ui** or any helper script.

1. Update the plugin and restart Homebridge.
2. In camera-ui (port 8081) delete the old *Windy* camera, and in Apple Home remove the old camera accessory.
3. If the log mentions a *legacy startup hook*, delete the file it names: `sudo rm /etc/hb-service/homebridge/prestart.d/<file>`.
4. Add the new camera as described above. (Your `city`, `lat`, `lon`, `width`, `height`, `captureIntervalMs` and `chromiumPath` keep working as they are.)

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Black bars on the sides in the Home app | Set `aspectRatio` to `16:9` (and remove a custom `width`/`height` such as 1300×900) |
| Log: *Chromium was not found* | `sudo apt install chromium` or set `chromiumPath` |
| Image never updates | Check the log for `Capture failed`; the Pi needs internet access to windy.com |
| Squares instead of icons | `sudo apt install fonts-noto-color-emoji`, or set `overlay.icons` to off |
| Live view does not start | `sudo apt install ffmpeg`; check `streaming.enabled` |
| Hebrew letters look wrong | `sudo apt install fonts-dejavu fonts-noto-core` |
| Camera not in Unpaired Accessories | Restart Homebridge; make sure it is not already paired |

---

# מדריך בעברית

תוסף **עצמאי לחלוטין** ל‑Homebridge: מכ״ם גשם של Windy.com כמצלמה באפל הום, עם **מזג האוויר העכשווי והתחזית על התמונה**, ו**חיישן "יורד גשם עכשיו?"**. בלי camera‑ui, בלי סקריפט חיצוני ובלי קבצים ידניים.

להפעלת הממשק בעברית (התחזית על התמונה, הודעות הלוג ושמות ברירת המחדל) הגדירו `"language": "he"`. ברירת המחדל היא אנגלית. מסך ההגדרות דו‑לשוני.

## מה יש בו

- מכ״ם גשם (או לווין / עננים / רוח / טמפרטורה) של האזור שלך – תמונה וגם צפייה חיה
- מזג אוויר עכשווי ותחזית על התמונה (Open‑Meteo – חינמי, בלי מפתח)
- **בחירת מיקום** התחזית על התמונה (8 מיקומים), **תבנית** (קומפקטי / כרטיס / מפורט / פס רחב / HTML משלך) ו**ערכת נושא**, ועיצוב מלא: צבעים, גודל, שקיפות, גופן, CSS משלך
- **איכות תמונה**: נמוכה / בינונית / גבוהה / אולטרה
- **חיישן גשם** ב‑HomeKit (תנועה / נזילה / נוכחות / מגע) + חיישני טמפרטורה ולחות חיצוניים אופציונליים
- עברית ואנגלית, מעלות צלזיוס או פרנהייט
- גיבוי ושחזור רגילים של Homebridge מכסים הכול – הכול נמצא ב‑`config.json`

## תבניות עיצוב ומסך הגדרות חזותי

ב‑Settings של התוסף ב‑Homebridge UI תמצאו מעצב עם **תצוגה מקדימה חיה** וגלריה של **12 תבניות מוכנות**. לוחצים על תבנית, בוחרים מיקום ברשת 3×3, פריסה, ערכת נושא, גודל, איכות וחיישנים, ושומרים. הכפתור **כל ההגדרות** פותח את הטופס המלא (צבעים, גופנים, CSS/HTML מותאם ועוד). כל מה שתגדירו בעצמכם גובר על התבנית. ב‑`config.json`: `"template": "neon"`.

## תלויות ודרישות

**עצמאי:** התוסף **לא צריך שום תוסף Homebridge אחר** (לא homebridge-camera-ui) ו**לא שום סקריפט חיצוני או hook בהפעלה**. הכול רץ בתוך התוסף.

ועל מה כן הוא נשען:

| רכיב | נחוץ? | למה ואיך מתקינים |
| --- | --- | --- |
| Homebridge 1.6 ומעלה, Node 18 ומעלה | חובה | – |
| `playwright-core` (npm) | מותקן אוטומטית | שולט בדפדפן; התלות היחידה שהתוסף מביא איתו |
| **Chromium** במחשב של Homebridge | **חובה** | מצלם את תמונת המכ״ם: `sudo apt install chromium` |
| **ffmpeg** | לצפייה חיה ולתמונות חדות יותר | `sudo apt install ffmpeg`, או החבילה האופציונלית `ffmpeg-for-homebridge`. בלעדיו עדיין מקבלים תמונה סטטית |
| `fonts-noto-color-emoji` | רק לאייקוני האימוג׳י של מזג האוויר | `sudo apt install fonts-noto-color-emoji`, או לכבות אייקונים בהגדרות |
| גישה לאינטרנט אל **windy.com** (מכ״ם) ו‑**open-meteo.com** (מזג אוויר, חינמי, בלי מפתח) | חובה | אם אחד לא זמין, מוצגים התמונה האחרונה ומזג האוויר האחרון (עד 3 שעות) |

## התקנה

Homebridge UI ← Plugins ← חפשו `homebridge-windy-camera` ← Install. פתחו **Settings**, בחרו עיר, שמרו, והפעילו מחדש.

**הוספה לאפל הום:** המצלמה מתפרסמת כאביזר נפרד. ב‑Homebridge UI: **Status ← Unpaired Accessories ← Windy Camera ← Setup**, או באפליקציית הבית: **+ ← הוסף אביזר ← אפשרויות נוספות** והזינו את אותו קוד PIN של ה‑Bridge. החיישנים מופיעים אוטומטית.

## סגנונות מפה (צבעוני / לוויין)

כברירת מחדל התמונה היא מפת Windy (רקע אפור). במסך ההגדרות ("סגנון מפה") או בבלוק `map` אפשר לבחור רקע צבעוני יותר: `satellite` (צילום לוויין), `streets` (רחובות צבעוני), `voyager` (צבעים רכים), `dark` (כהה), `topo` (טופוגרפי), או `custom` (כתובת אריחים משלך ב-`map.customTileUrl` עם `{z}` `{x}` `{y}`).
אפשרויות נוספות: `map.radar` (הצגת מכ״ם), `map.radarColors` (פלטת צבעי המכ״ם), `map.radarOpacity`, `map.marker`, `map.attribution`.
הסגנונות שאינם Windy משתמשים באריחי מפה חינמיים ובמכ״ם של RainViewer (זום מקסימלי 7, לכן המכ״ם מעט פחות חד מ-Windy) ודורשים גישה לאינטרנט. אם האריחים לא נטענים, התמונה הקודמת נשמרת ומופיעה אזהרה בלוג.

## עיצוב עצמי

- `overlay.position` – איפה התחזית תופיע על המצלמה (למשל `bottom-right`)
- `overlay.layout` – `compact` / `card` / `detailed` / `banner` / `custom`
- `overlay.theme`, `textColor`, `backgroundColor`, `accentColor`, `scale`, `opacity`, `fontFamily`
- `customCss` – CSS משלכם (האלמנט `#wc-overlay`)
- `layout: "custom"` + `customHtml` – תבנית משלכם עם `{{city}} {{icon}} {{temp}} {{desc}} {{rain}}` ועוד
- `quality` – `low` / `medium` / `high` / `ultra`

## חיישן הגשם

ב‑HomeKit אין חיישן גשם, לכן בוחרים סוג (`sensors.rainType`). **חיישן תנועה** הוא הגמיש ביותר להתראות ואוטומציות. גשם מזוהה לפי כמות משקעים שנמדדה או לפי קוד מזג אוויר של גשם/טפטוף/ממטרים/סופת רעמים (ניתן לשינוי ב‑`weather.rainDetection`).

**התראות שווא:** החיישן נדלק רק אחרי שהגשם דווח ב‑`weather.rainConfirmReadings` רענוני מזג אוויר רצופים (ברירת מחדל 2) וכבה מיד בקריאה יבשה הראשונה. אם עדיין יש התראות שווא, הגדירו `weather.rainDetection: "precipitation"` ו‑`weather.rainThresholdMm: 0.3`.

## שדרוג מגרסה 1.x

גרסה 2 **לא צריכה** את camera‑ui ולא שום סקריפט.

1. עדכנו את התוסף והפעילו מחדש את Homebridge.
2. ב‑camera‑ui (פורט 8081) מחקו את מצלמת Windy הישנה, ובאפל הום הסירו את המצלמה הישנה.
3. אם בלוג מופיעה אזהרה על *legacy startup hook* – מחקו את הקובץ שהיא מציינת: `sudo rm /etc/hb-service/homebridge/prestart.d/<file>`.
4. הוסיפו את המצלמה החדשה כמתואר למעלה. ההגדרות הקיימות (`city`, `lat`, `lon`, `width`, `height`, `captureIntervalMs`, `chromiumPath`) ממשיכות לעבוד.

## פתרון בעיות

- *Chromium was not found* – `sudo apt install chromium`
- התמונה לא מתעדכנת – חפשו `Capture failed` בלוג; נדרש אינטרנט ל‑windy.com
- פסים שחורים בצדדים באפל הום – הגדירו `aspectRatio` ל‑`16:9` (והסירו `width`/`height` מותאמים כמו 1300×900)
- ריבועים במקום אייקונים – `sudo apt install fonts-noto-color-emoji` או כבו `overlay.icons`
- צפייה חיה לא עובדת – `sudo apt install ffmpeg`
