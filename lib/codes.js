'use strict';

// WMO weather codes -> text + emoji (Open-Meteo)
const CODES = {
  0: ['בהיר', 'Clear', '☀️', '🌙'],
  1: ['בהיר ברובו', 'Mostly clear', '🌤️', '🌙'],
  2: ['מעונן חלקית', 'Partly cloudy', '⛅', '☁️'],
  3: ['מעונן', 'Overcast', '☁️', '☁️'],
  45: ['ערפל', 'Fog', '🌫️', '🌫️'],
  48: ['ערפל כפור', 'Rime fog', '🌫️', '🌫️'],
  51: ['טפטוף קל', 'Light drizzle', '🌦️', '🌧️'],
  53: ['טפטוף', 'Drizzle', '🌦️', '🌧️'],
  55: ['טפטוף חזק', 'Heavy drizzle', '🌧️', '🌧️'],
  56: ['טפטוף קופא', 'Freezing drizzle', '🌧️', '🌧️'],
  57: ['טפטוף קופא חזק', 'Heavy freezing drizzle', '🌧️', '🌧️'],
  61: ['גשם קל', 'Light rain', '🌦️', '🌧️'],
  63: ['גשם', 'Rain', '🌧️', '🌧️'],
  65: ['גשם חזק', 'Heavy rain', '🌧️', '🌧️'],
  66: ['גשם קופא', 'Freezing rain', '🌧️', '🌧️'],
  67: ['גשם קופא חזק', 'Heavy freezing rain', '🌧️', '🌧️'],
  71: ['שלג קל', 'Light snow', '🌨️', '🌨️'],
  73: ['שלג', 'Snow', '🌨️', '🌨️'],
  75: ['שלג כבד', 'Heavy snow', '❄️', '❄️'],
  77: ['גרגרי שלג', 'Snow grains', '🌨️', '🌨️'],
  80: ['ממטרים קלים', 'Light showers', '🌦️', '🌧️'],
  81: ['ממטרים', 'Showers', '🌧️', '🌧️'],
  82: ['ממטרים עזים', 'Violent showers', '⛈️', '⛈️'],
  85: ['ממטרי שלג', 'Snow showers', '🌨️', '🌨️'],
  86: ['ממטרי שלג כבדים', 'Heavy snow showers', '❄️', '❄️'],
  95: ['סופת רעמים', 'Thunderstorm', '⛈️', '⛈️'],
  96: ['סופת רעמים וברד', 'Thunderstorm with hail', '⛈️', '⛈️'],
  99: ['סופת רעמים וברד כבד', 'Thunderstorm, heavy hail', '⛈️', '⛈️'],
};
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);

function describe(code, isDay, lang) {
  const e = CODES[code] || ['—', '—', '❓', '❓'];
  return { text: lang === 'en' ? e[1] : e[0], icon: isDay === 0 ? e[3] : e[2] };
}

module.exports = { CODES, RAIN_CODES, describe };
