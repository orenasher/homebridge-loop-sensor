# homebridge-loop-sensor

מתג + חיישן ל-HomeKit. **כשהמתג דלוק**, החיישן נדלק לרגע (ברירת מחדל 2 שניות) כל X זמן. **כשהמתג כבוי** – שום דבר לא רץ.

A HomeKit switch that pulses a sensor every X minutes while it's on. When the switch is off, nothing runs (no timers at all).

## למה זה טוב
אוטומציות שחוזרות על עצמן, למשל: "כל 2 דקות, אם המזגן דלוק והחלון בחדר פתוח – ההומפוד מכריז".

## תכונות
- כמה לופים שרוצים, לכל אחד זמן משלו (שניות / דקות / שעות)
- סוג חיישן לבחירה: Contact, Motion, Occupancy, Leak (התראה קריטית)
- סוג מתג לבחירה: Switch, Outlet, Lightbulb
- משך "הדלקה" של החיישן (שניות)
- הפעלה מיידית של החיישן כשהמתג נדלק (אפשר לכבות)
- כיבוי אוטומטי של המתג אחרי X דקות (אופציונלי)
- זוכר את מצב המתג אחרי הפעלה מחדש של Homebridge
- קל: טיימר אחד לכל לופ, ורק כשהמתג דלוק. בלי לוג על כל הפעלה (אלא אם מסמנים Debug)

## הגדרה

```json
{
  "platform": "LoopSensor",
  "name": "Loop Sensor",
  "loops": [
    {
      "name": "לופ מזגן",
      "switchType": "switch",
      "sensorType": "contact",
      "interval": 2,
      "intervalUnit": "minutes",
      "pulseSeconds": 2
    }
  ]
}
```

| שדה | ברירת מחדל | הסבר |
|---|---|---|
| `name` | – | שם הלופ (חובה) |
| `switchType` | `switch` | `switch` / `outlet` / `lightbulb` |
| `sensorType` | `contact` | `contact` / `motion` / `occupancy` / `leak` |
| `interval` + `intervalUnit` | `2` `minutes` | כל כמה זמן החיישן נדלק (מינימום 10 שניות) |
| `pulseSeconds` | `2` | כמה זמן החיישן נשאר דלוק |
| `pulseOnStart` | `true` | להדליק את החיישן מיד כשהמתג נדלק |
| `autoOffMinutes` | `0` | כיבוי אוטומטי של המתג (0 = אף פעם) |
| `rememberState` | `true` | לשחזר את מצב המתג אחרי ריסטארט |
| `switchName` / `sensorName` | – | שמות מותאמים |
| `debug` | `false` | שורת לוג על כל הפעלה של החיישן |

## דוגמה לאוטומציה
1. אוטומציה: כשהמזגן נדלק → להדליק "לופ מזגן". כשהמזגן כבה → לכבות.
2. אוטומציה: כשחיישן "לופ מזגן" נפתח → המרה לקיצור דרך → **אם** החלון פתוח → לנגן בהומפוד.

## License
MIT © Oren Asher
