'use strict';

const M = {
  en: {
    noLocation: 'No valid location configured - falling back to Kfar Yona.',
    badCustomTiles: 'map.customTileUrl must contain {z}, {x} and {y} - using the Windy map instead.',
    radarFail: (a) => 'Radar layer unavailable (showing the base map only): ' + a,
    noTiles: 'No map tiles could be loaded (no internet or tile server down) - keeping the previous picture.',
    oldHap: 'This Homebridge version does not support cameras (HAP-NodeJS too old). Please update Homebridge.',
    bridged: 'Camera exposed on the Homebridge bridge.',
    external: 'Camera published as a separate HomeKit accessory. Add it in Apple Home with the same PIN as your Homebridge bridge (Homebridge UI > Status > Unpaired Accessories).',
    noChromium: 'Chromium was not found automatically. Install it (sudo apt install chromium) or set "chromiumPath" in the plugin config.',
    ready: (a) => `Windy Camera ready: ${a.where} (${a.lat}, ${a.lon}), quality=${a.q} ${a.w}x${a.h}, every ${a.s}s`,
    weather: (a) => `Weather: ${a.t}°C, humidity ${a.h}%, code ${a.c}, raining=${a.r} (raw=${a.w})`,
    weatherFail: (a) => 'Weather update failed: ' + a,
    weatherOld: 'Weather data is older than 3 hours - hiding it.',
    captureFail: (a) => 'Capture failed: ' + a,
    legacy: (a) => `Legacy v1.x startup hook found (${a}). It is not needed anymore - remove it (sudo rm) and delete the old camera from camera-ui. See the README migration guide.`,
  },
  he: {
    noLocation: 'לא הוגדר מיקום תקין - משתמש בכפר יונה.',
    badCustomTiles: 'map.customTileUrl חייב לכלול {z}, {x} ו‑{y} - משתמש במפת Windy.',
    radarFail: (a) => 'שכבת המכ״ם לא זמינה (מוצגת מפת הבסיס בלבד): ' + a,
    noTiles: 'לא ניתן לטעון אריחי מפה (אין אינטרנט או שהשרת למטה) - נשמרת התמונה הקודמת.',
    oldHap: 'גרסת Homebridge הזו לא תומכת במצלמות (HAP-NodeJS ישן). יש לעדכן את Homebridge.',
    bridged: 'המצלמה מוצגת בתוך ה‑Bridge של Homebridge.',
    external: 'המצלמה פורסמה כאביזר HomeKit נפרד. הוסיפו אותה באפל הום עם אותו PIN של ה‑Bridge (Homebridge UI ← Status ← Unpaired Accessories).',
    noChromium: 'Chromium לא נמצא אוטומטית. התקינו אותו (sudo apt install chromium) או הגדירו "chromiumPath" בהגדרות התוסף.',
    ready: (a) => `מצלמת Windy מוכנה: ${a.where} (${a.lat}, ${a.lon}), איכות=${a.q} ${a.w}x${a.h}, כל ${a.s} שניות`,
    weather: (a) => `מזג אוויר: ${a.t}°C, לחות ${a.h}%, קוד ${a.c}, יורד גשם=${a.r} (גולמי=${a.w})`,
    weatherFail: (a) => 'עדכון מזג האוויר נכשל: ' + a,
    weatherOld: 'נתוני מזג האוויר ישנים מ‑3 שעות - מוסתרים.',
    captureFail: (a) => 'הצילום נכשל: ' + a,
    legacy: (a) => `נמצא hook ישן של גרסה 1.x (${a}). הוא כבר לא נחוץ - מחקו אותו (sudo rm) ומחקו את המצלמה הישנה מ‑camera-ui. ראו מדריך שדרוג ב‑README.`,
  },
};

function t(lang, key, arg) {
  const v = (M[lang] || M.en)[key] || M.en[key];
  return typeof v === 'function' ? v(arg) : v;
}

module.exports = { t };
