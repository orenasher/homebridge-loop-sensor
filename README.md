# homebridge-windy-camera

A **fully standalone** Homebridge plugin that shows a live **Windy.com rain radar** as a camera in Apple Home, with the **current weather and forecast drawn on the picture**, and a **"is it raining right now?" sensor**.

No other plugin (no camera-ui), no external script, no manual files. Install it, pick your city, done.

## Features

- Rain radar (or satellite / clouds / wind / temperature) of your area as a HomeKit camera – snapshot **and** live view
- Current weather + forecast on the image (Open-Meteo, free, no API key)
- **Choose where it appears** (8 positions), the **layout** (compact / card / detailed / banner / your own HTML) and the **theme** – and restyle everything with colors, size, opacity, fonts or your own CSS
- **Image quality** presets: low / medium / high / ultra (or exact width/height/JPEG quality)
- HomeKit **rain sensor** (motion / leak / occupancy / contact – your choice), optional outdoor **temperature** and **humidity** sensors
- Hebrew & English, metric & imperial
- Fully covered by the normal Homebridge backup/restore – everything lives in `config.json`; nothing else to save

## Requirements

- Homebridge 1.6+ and Node 18+
- Chromium on the Homebridge machine: `sudo apt install chromium` (Raspberry Pi OS / Debian / Ubuntu)
- For the emoji weather icons: `sudo apt install fonts-noto-color-emoji` (or turn icons off in the plugin settings)
- For live view and sharper snapshots: `ffmpeg` (`sudo apt install ffmpeg`). Without it you still get snapshots.

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

Custom location: set `"city": "מותאם אישית (הזן קווים ידנית)"` with `"lat"` and `"lon"` (and optionally `"locationName"`).

Full example:

```json
{
  "platform": "WindyCamera",
  "name": "Rain Radar",
  "city": "כפר יונה",
  "quality": "high",
  "captureIntervalMs": 120000,
  "weather": { "units": "metric", "language": "he", "rainDetection": "both" },
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
| `quality` | `low` 800×550 · `medium` 1000×700 · `high` 1300×900 · `ultra` 1300×900 @2x | `high` |
| `width`, `height`, `jpegQuality` | override the preset | – |
| `captureIntervalMs` | ≥ 30000 | 120000 |
| `windyOverlay` | `radar` `satellite` `rain` `clouds` `wind` `temp` | `radar` |
| `zoom` | 3–12 | 9 |
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
| `cameraMode` | `external` `bridged` | `external` |

### Design it yourself

- **Colors/size:** `textColor`, `backgroundColor` (e.g. `rgba(0,0,0,.5)`), `accentColor`, `scale`, `fontFamily`.
- **Custom CSS:** the overlay is `#wc-overlay` with the classes `.wc-city .wc-icon .wc-temp .wc-desc .wc-stats .wc-rain .wc-row .wc-cell`. Example: `"customCss": "#wc-overlay{border:2px solid #fff} .wc-temp{font-size:70px}"`.
- **Own template:** `"layout": "custom"` and `"customHtml": "<b>{{city}}</b> {{icon}} {{temp}}{{unit}} – {{rain}}"`. Placeholders: `{{city}} {{icon}} {{temp}} {{unit}} {{desc}} {{feels}} {{humidity}} {{wind}} {{windUnit}} {{rain}} {{rainIcon}} {{time}} {{forecast}}`.

### The rain sensor

HomeKit has no "rain" sensor, so choose the type that suits you. **Motion** (notifications + automations: "when motion is detected → …") is the most flexible. Contact: *open* = raining. Rain is detected when Open-Meteo reports measured precipitation above the threshold **or** a rain/drizzle/shower/thunderstorm weather code (configurable).

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
| Log: *Chromium was not found* | `sudo apt install chromium` or set `chromiumPath` |
| Image never updates | Check the log for `Capture failed`; the Pi needs internet access to windy.com |
| Squares instead of icons | `sudo apt install fonts-noto-color-emoji`, or set `overlay.icons` to off |
| Live view does not start | `sudo apt install ffmpeg`; check `streaming.enabled` |
| Hebrew letters look wrong | `sudo apt install fonts-dejavu fonts-noto-core` |
| Camera not in Unpaired Accessories | Restart Homebridge; make sure it is not already paired |

---

# מדריך בעברית

תוסף **עצמאי לחלוטין** ל‑Homebridge: מכ״ם גשם של Windy.com כמצלמה באפל הום, עם **מזג האוויר העכשווי והתחזית על התמונה**, ו**חיישן "יורד גשם עכשיו?"**. בלי camera‑ui, בלי סקריפט חיצוני ובלי קבצים ידניים.

## מה יש בו

- מכ״ם גשם (או לווין / עננים / רוח / טמפרטורה) של האזור שלך – תמונה וגם צפייה חיה
- מזג אוויר עכשווי ותחזית על התמונה (Open‑Meteo – חינמי, בלי מפתח)
- **בחירת מיקום** התחזית על התמונה (8 מיקומים), **תבנית** (קומפקטי / כרטיס / מפורט / פס רחב / HTML משלך) ו**ערכת נושא**, ועיצוב מלא: צבעים, גודל, שקיפות, גופן, CSS משלך
- **איכות תמונה**: נמוכה / בינונית / גבוהה / אולטרה
- **חיישן גשם** ב‑HomeKit (תנועה / נזילה / נוכחות / מגע) + חיישני טמפרטורה ולחות חיצוניים אופציונליים
- עברית ואנגלית, מעלות צלזיוס או פרנהייט
- גיבוי ושחזור רגילים של Homebridge מכסים הכול – הכול נמצא ב‑`config.json`

## דרישות

- Homebridge 1.6 ומעלה, Node 18 ומעלה
- Chromium: `sudo apt install chromium`
- לאייקונים: `sudo apt install fonts-noto-color-emoji`
- לצפייה חיה: `sudo apt install ffmpeg`

## התקנה

Homebridge UI ← Plugins ← חפשו `homebridge-windy-camera` ← Install. פתחו **Settings**, בחרו עיר, שמרו, והפעילו מחדש.

**הוספה לאפל הום:** המצלמה מתפרסמת כאביזר נפרד. ב‑Homebridge UI: **Status ← Unpaired Accessories ← Windy Camera ← Setup**, או באפליקציית הבית: **+ ← הוסף אביזר ← אפשרויות נוספות** והזינו את אותו קוד PIN של ה‑Bridge. החיישנים מופיעים אוטומטית.

## עיצוב עצמי

- `overlay.position` – איפה התחזית תופיע על המצלמה (למשל `bottom-right`)
- `overlay.layout` – `compact` / `card` / `detailed` / `banner` / `custom`
- `overlay.theme`, `textColor`, `backgroundColor`, `accentColor`, `scale`, `opacity`, `fontFamily`
- `customCss` – CSS משלכם (האלמנט `#wc-overlay`)
- `layout: "custom"` + `customHtml` – תבנית משלכם עם `{{city}} {{icon}} {{temp}} {{desc}} {{rain}}` ועוד
- `quality` – `low` / `medium` / `high` / `ultra`

## חיישן הגשם

ב‑HomeKit אין חיישן גשם, לכן בוחרים סוג (`sensors.rainType`). **חיישן תנועה** הוא הגמיש ביותר להתראות ואוטומציות. גשם מזוהה לפי כמות משקעים שנמדדה או לפי קוד מזג אוויר של גשם/טפטוף/ממטרים/סופת רעמים (ניתן לשינוי ב‑`weather.rainDetection`).

## שדרוג מגרסה 1.x

גרסה 2 **לא צריכה** את camera‑ui ולא שום סקריפט.

1. עדכנו את התוסף והפעילו מחדש את Homebridge.
2. ב‑camera‑ui (פורט 8081) מחקו את מצלמת Windy הישנה, ובאפל הום הסירו את המצלמה הישנה.
3. אם בלוג מופיעה אזהרה על *legacy startup hook* – מחקו את הקובץ שהיא מציינת: `sudo rm /etc/hb-service/homebridge/prestart.d/<file>`.
4. הוסיפו את המצלמה החדשה כמתואר למעלה. ההגדרות הקיימות (`city`, `lat`, `lon`, `width`, `height`, `captureIntervalMs`, `chromiumPath`) ממשיכות לעבוד.

## פתרון בעיות

- *Chromium was not found* – `sudo apt install chromium`
- התמונה לא מתעדכנת – חפשו `Capture failed` בלוג; נדרש אינטרנט ל‑windy.com
- ריבועים במקום אייקונים – `sudo apt install fonts-noto-color-emoji` או כבו `overlay.icons`
- צפייה חיה לא עובדת – `sudo apt install ffmpeg`
