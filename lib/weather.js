'use strict';

const https = require('https');

const { RAIN_CODES, describe } = require('./codes');

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

function buildUrl(lat, lon, timezone) {
  const q = [
    `latitude=${lat}`, `longitude=${lon}`,
    'current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,weather_code,wind_speed_10m,wind_direction_10m',
    'hourly=temperature_2m,precipitation_probability,weather_code,is_day',
    'daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum',
    'forecast_days=6', 'wind_speed_unit=kmh', 'temperature_unit=celsius', 'precipitation_unit=mm',
    `timezone=${encodeURIComponent(timezone || 'auto')}`,
  ];
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
    });
  }
  return { fetchedAt: Date.now(), timezone: json.timezone, current, daily, hourly };
}

async function fetchWeather(lat, lon, cfg) {
  const url = buildUrl(lat, lon, cfg.timezone);
  let lastErr;
  for (let i = 0; i < 3; i++) {
    try { return parse(await getJson(url), cfg); } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 2000 * (i + 1))); }
  }
  throw lastErr;
}

module.exports = { fetchWeather, parse, describe, isRaining, buildUrl, RAIN_CODES };
