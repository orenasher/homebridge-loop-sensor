'use strict';

const fs = require('fs');
const { CITIES, CUSTOM_CITY_LABEL } = require('./cities');

// Image quality presets. Explicit width/height/jpegQuality/scale in the config override these.
const QUALITY_PRESETS = {
  low: { width: 800, height: 550, jpegQuality: 70, deviceScaleFactor: 1 },
  medium: { width: 1000, height: 700, jpegQuality: 82, deviceScaleFactor: 1 },
  high: { width: 1300, height: 900, jpegQuality: 95, deviceScaleFactor: 1 },
  ultra: { width: 1300, height: 900, jpegQuality: 95, deviceScaleFactor: 2 },
};

const POSITIONS = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

const CHROMIUM_CANDIDATES = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/snap/bin/chromium',
  '/usr/lib/chromium/chromium',
  '/usr/lib/chromium-browser/chromium-browser',
];

function num(v, def, min, max) {
  const n = Number(v);
  if (v === undefined || v === null || v === '' || !Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}
function bool(v, def) { return typeof v === 'boolean' ? v : def; }
function oneOf(v, list, def) { return list.includes(v) ? v : def; }
function str(v, def) { return typeof v === 'string' && v.trim() ? v.trim() : def; }

function findChromium(configured) {
  if (configured && fs.existsSync(configured)) return configured;
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
  for (const p of CHROMIUM_CANDIDATES) { try { if (fs.existsSync(p)) return p; } catch (e) { /* ignore */ } }
  return undefined; // let playwright try its own bundled browser
}

function normalize(raw) {
  raw = raw || {};
  const log = [];

  // ---- location ----
  let lat = Number(raw.lat);
  let lon = Number(raw.lon);
  let cityLabel = str(raw.city, 'כפר יונה');
  const custom = cityLabel === CUSTOM_CITY_LABEL;
  if (!custom && CITIES[cityLabel]) {
    lat = CITIES[cityLabel].lat;
    lon = CITIES[cityLabel].lon;
  } else if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    lat = CITIES['כפר יונה'].lat;
    lon = CITIES['כפר יונה'].lon;
    cityLabel = 'כפר יונה';
    log.push('No valid location configured - falling back to Kfar Yona.');
  }
  const locationName = str(raw.locationName, custom ? '' : cityLabel);

  // ---- image quality ----
  const quality = oneOf(raw.quality, Object.keys(QUALITY_PRESETS), 'high');
  const preset = QUALITY_PRESETS[quality];
  const image = {
    quality,
    width: Math.round(num(raw.width, preset.width, 320, 3840)),
    height: Math.round(num(raw.height, preset.height, 240, 2160)),
    jpegQuality: Math.round(num(raw.jpegQuality, preset.jpegQuality, 30, 100)),
    deviceScaleFactor: num(raw.deviceScaleFactor, preset.deviceScaleFactor, 1, 3),
  };

  // ---- windy ----
  const windy = {
    overlay: oneOf(raw.windyOverlay, ['radar', 'satellite', 'rain', 'clouds', 'wind', 'temp'], 'radar'),
    zoom: Math.round(num(raw.zoom, 9, 3, 12)),
    waitMs: Math.round(num(raw.waitMs, 15000, 3000, 60000)),
    timeoutMs: Math.round(num(raw.pageTimeoutMs, 60000, 15000, 180000)),
    hideWindyUi: bool(raw.hideWindyUi, false),
  };

  // ---- weather ----
  const w = raw.weather || {};
  const weather = {
    enabled: bool(w.enabled, true),
    units: oneOf(w.units, ['metric', 'imperial'], 'metric'),
    language: oneOf(w.language, ['he', 'en'], 'he'),
    refreshMinutes: Math.round(num(w.refreshMinutes, 10, 5, 180)),
    timezone: str(w.timezone, ''),
    rainThresholdMm: num(w.rainThresholdMm, 0.1, 0, 50),
    rainDetection: oneOf(w.rainDetection, ['both', 'precipitation', 'weatherCode'], 'both'),
  };

  // ---- overlay ----
  const o = raw.overlay || {};
  const overlay = {
    enabled: bool(o.enabled, true) && weather.enabled,
    position: oneOf(o.position, POSITIONS, 'top-left'),
    layout: oneOf(o.layout, ['compact', 'card', 'detailed', 'banner', 'custom'], 'card'),
    theme: oneOf(o.theme, ['dark', 'light', 'glass', 'transparent', 'custom'], 'dark'),
    scale: num(o.scale, 1, 0.5, 3),
    opacity: num(o.opacity, 0.85, 0.1, 1),
    margin: Math.round(num(o.margin, 24, 0, 300)),
    borderRadius: Math.round(num(o.borderRadius, 16, 0, 60)),
    fontFamily: str(o.fontFamily, 'system-ui, "Segoe UI", Roboto, "Noto Sans Hebrew", Arial, sans-serif'),
    textColor: str(o.textColor, ''),
    backgroundColor: str(o.backgroundColor, ''),
    accentColor: str(o.accentColor, ''),
    icons: bool(o.icons, true),
    showCity: bool(o.showCity, true),
    showFeelsLike: bool(o.showFeelsLike, true),
    showHumidity: bool(o.showHumidity, true),
    showWind: bool(o.showWind, true),
    showRainStatus: bool(o.showRainStatus, true),
    showTimestamp: bool(o.showTimestamp, true),
    forecastDays: Math.round(num(o.forecastDays, 3, 0, 5)),
    hourlyCount: Math.round(num(o.hourlyCount, 0, 0, 8)),
    customCss: typeof o.customCss === 'string' ? o.customCss : '',
    customHtml: typeof o.customHtml === 'string' ? o.customHtml : '',
  };
  if (overlay.layout === 'custom' && !overlay.customHtml.trim()) overlay.layout = 'card';

  // ---- sensors ----
  const s = raw.sensors || {};
  const sensors = {
    rain: bool(s.rain, true) && weather.enabled,
    rainName: str(s.rainName, 'Raining'),
    rainType: oneOf(s.rainType, ['motion', 'leak', 'occupancy', 'contact'], 'motion'),
    temperature: bool(s.temperature, false) && weather.enabled,
    temperatureName: str(s.temperatureName, 'Outdoor Temperature'),
    humidity: bool(s.humidity, false) && weather.enabled,
    humidityName: str(s.humidityName, 'Outdoor Humidity'),
  };

  // ---- streaming ----
  const st = raw.streaming || {};
  const streaming = {
    enabled: bool(st.enabled, true),
    fps: Math.round(num(st.fps, 5, 1, 30)),
    maxBitrateKbps: Math.round(num(st.maxBitrateKbps, 600, 100, 8000)),
    ffmpegPath: str(st.ffmpegPath, ''),
    videoEncoder: str(st.videoEncoder, 'libx264'),
    maxSessionSeconds: Math.round(num(st.maxSessionSeconds, 600, 30, 3600)),
  };

  return {
    name: str(raw.name, 'מכ״ם גשם'),
    mode: oneOf(raw.cameraMode, ['external', 'bridged'], 'external'),
    lat, lon, cityLabel, locationName,
    captureIntervalMs: Math.round(num(raw.captureIntervalMs, 120000, 30000, 3600000)),
    chromiumPath: findChromium(str(raw.chromiumPath, '')),
    imagePath: str(raw.imagePath, ''),
    debug: bool(raw.debug, false),
    image, windy, weather, overlay, sensors, streaming,
    notes: log,
  };
}

module.exports = { normalize, QUALITY_PRESETS, POSITIONS, findChromium };
