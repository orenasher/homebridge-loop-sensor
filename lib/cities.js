'use strict';

const CUSTOM_CITY_LABEL = 'מותאם אישית (הזן קווים ידנית)';

// Built-in city presets (Hebrew names). Any location can be used via "custom" + lat/lon.
const CITIES = {
  'כפר יונה': { lat: 32.3167, lon: 34.9351 },
  'נתניה': { lat: 32.3215, lon: 34.8532 },
  'תל אביב - יפו': { lat: 32.0853, lon: 34.7818 },
  'חיפה': { lat: 32.7940, lon: 34.9896 },
  'ירושלים': { lat: 31.7683, lon: 35.2137 },
  'באר שבע': { lat: 31.2518, lon: 34.7913 },
  'אשדוד': { lat: 31.8044, lon: 34.6553 },
  'אילת': { lat: 29.5581, lon: 34.9482 },
  'רעננה': { lat: 32.1848, lon: 34.8713 },
  'חדרה': { lat: 32.4340, lon: 34.9196 },
};

module.exports = { CITIES, CUSTOM_CITY_LABEL };
