'use strict';

const https = require('https');

const { RAIN_CODES, describe } = require('./codes');
const { derive } = require('./nowcast');
const { fetchMetno } = require('./metno');

function getJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'homebridge-windy-camera' }, timeout: timeoutMs || 20000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error('HTTP ' + res.statusCode)); return; }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; if (body.length > 2e6) req.destroy(new Error('response too large')); });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function buildUrl(lat, lon, timezone, extended) {
  const q = [
    `latitude=${lat}`, `longitude=${lon}`,
    'current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,weather_code,wind_speed_10m,wind_direction_10m' + (extended ? ',wind_gusts_10m,pressure_msl,uv_index' : ''),
    'hourly=temperature_2m,precipitation_probability,weather_code,is_day' + (extended ? ',precipitation' : ''),
    'daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum' + (extended ? ',sunrise,sunset,uv_index_max' : ''),
    'forecast_days=6', 'wind_speed_unit=kmh', 'temperature_unit=celsius', 'precipitation_unit=mm',
    `timezone=${encodeURIComponent(timezone || 'auto')}`,
  ];
  if (extended) q.push('minutely_15=precipitation', 'forecast_minutely_15=24');
  return 'https://api.open-meteo.com/v1/forecast?' + q.join('&');
}

function isRaining(cur, cfg) {
  const mm = Math.max(cur.precipitation || 0, cur.rain || 0, cur.showers || 0);
  const byMm = mm >= Math.max(cfg.rainThresholdMm, 0.01);
  const byCode = RAIN_CODES.has(cur.weatherCode);
  if (cfg.rainDetection === 'precipitation') return byMm;
  if (cfg.rainDetection === 'weatherCode') return byCode;
  return byMm || byCode;
}

function parse(json, cfg) {
  const c = json.current;
  if (!c || typeof c.temperature_2m !== 'number') throw new Error('unexpected weather response');
  const current = {
    time: c.time,
    temp: c.temperature_2m,
    feels: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    isDay: c.is_day,
    precipitation: c.precipitation,
    rain: c.rain,
    showers: c.showers,
    weatherCode: c.weather_code,
    windKmh: c.wind_speed_10m,
    windDir: c.wind_direction_10m,
    gustKmh: c.wind_gusts_10m,
    pressure: c.pressure_msl,
    uv: c.uv_index,
  };
  current.raining = isRaining(current, cfg);

  const daily = [];
  const d = json.daily || {};
  (d.time || []).forEach((t, i) => daily.push({
    date: t, code: d.weather_code && d.weather_code[i],
    max: d.temperature_2m_max && d.temperature_2m_max[i],
    min: d.temperature_2m_min && d.temperature_2m_min[i],
    rainProb: d.precipitation_probability_max && d.precipitation_probability_max[i],
    rainSum: d.precipitation_sum && d.precipitation_sum[i],
    sunrise: d.sunrise && d.sunrise[i], sunset: d.sunset && d.sunset[i],
    uvMax: d.uv_index_max && d.uv_index_max[i],
  }));

  // next hours starting from the current local hour
  const hourly = [];
  const h = json.hourly || {};
  const times = h.time || [];
  const nowKey = (c.time || '').slice(0, 13);
  let start = times.findIndex((t) => t.slice(0, 13) >= nowKey);
  if (start < 0) start = 0;
  for (let i = start + 1; i < times.length && hourly.length < 12; i++) {
    hourly.push({
      time: times[i], temp: h.temperature_2m && h.temperature_2m[i],
      rainProb: h.precipitation_probability && h.precipitation_probability[i],
      code: h.weather_code && h.weather_code[i], isDay: h.is_day && h.is_day[i],
      precip: h.precipitation && h.precipitation[i],
    });
  }
  const minutely = [];
  const mm15 = json.minutely_15 || {};
  (mm15.time || []).forEach((t, i) => minutely.push({ time: t, precip: mm15.precipitation && mm15.precipitation[i] }));
  const out = { fetchedAt: Date.now(), timezone: json.timezone, source: 'open-meteo', current, daily, hourly, minutely };
  if (cfg.soonMinutes !== undefined) derive(out, cfg);
  return out;
}

async function fetchWeather(lat, lon, cfg, lastTimezone) {
  let extended = true;
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try { return parse(await getJson(buildUrl(lat, lon, cfg.timezone, extended)), cfg); } catch (e) {
      lastErr = e;
      // an unknown parameter must never break the basic weather: retry with the original (v2.4) request
      if (extended && /^HTTP 4\d\d/.test(e.message)) extended = false;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
  if (cfg.fallback === 'metno') {
    const tz = cfg.timezone || lastTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      const w = await fetchMetno(lat, lon, tz);
      w.current.raining = isRaining(w.current, cfg);
      if (cfg.soonMinutes !== undefined) derive(w, cfg);
      w.fellBack = true;
      return w;
    } catch (e2) { lastErr = new Error(lastErr.message + ' (fallback: ' + e2.message + ')'); }
  }
  throw lastErr;
}

module.exports = { fetchWeather, parse, describe, isRaining, buildUrl, RAIN_CODES };
