'use strict';

const https = require('https');

// Fallback weather source (MET Norway, no API key). Used only when Open-Meteo fails.
const UA = 'homebridge-windy-camera https://github.com/orenasher/homebridge-loop-sensor';

function getJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, timeout: timeoutMs || 20000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error('HTTP ' + res.statusCode)); return; }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; if (body.length > 4e6) req.destroy(new Error('response too large')); });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/** MET Norway symbol_code -> WMO weather code (the table used by the rest of the plugin). */
function symbolToWmo(sym) {
  const s = String(sym || '').replace(/_(day|night|polartwilight)$/, '');
  const light = s.startsWith('light'), heavy = s.startsWith('heavy');
  if (s.includes('thunder')) return 95;
  if (s.includes('sleet')) return 67;
  if (s.includes('snow')) return s.includes('shower') ? (heavy ? 86 : 85) : (heavy ? 75 : light ? 71 : 73);
  if (s.includes('rain')) {
    if (s.includes('shower')) return heavy ? 82 : light ? 80 : 81;
    return heavy ? 65 : light ? 61 : 63;
  }
  if (s === 'clearsky') return 0;
  if (s === 'fair') return 1;
  if (s === 'partlycloudy') return 2;
  if (s === 'cloudy') return 3;
  if (s === 'fog') return 45;
  return 3;
}
function symbolIsDay(sym) {
  const m = /_(day|night|polartwilight)$/.exec(String(sym || ''));
  return m ? (m[1] === 'night' ? 0 : 1) : 1;
}

/** ISO instant -> { date: 'YYYY-MM-DD', hm: 'HH:MM', hour } in the given IANA zone */
function localParts(iso, tz) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso));
  } catch (e) {
    parts = new Intl.DateTimeFormat('en-CA', { hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(iso));
  }
  const g = (t) => (parts.find((p) => p.type === t) || {}).value;
  const hour = Number(g('hour'));
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hm: `${String(hour).padStart(2, '0')}:${g('minute')}`, hour };
}

function parse(json, tz) {
  const ts = json && json.properties && json.properties.timeseries;
  if (!ts || !ts.length) throw new Error('unexpected MET Norway response');
  const first = ts[0];
  const d0 = first.data.instant.details;
  const n1 = (e) => e.data.next_1_hours;
  const sym = (e) => (n1(e) || e.data.next_6_hours || e.data.next_12_hours || {}).summary && (n1(e) || e.data.next_6_hours || e.data.next_12_hours).summary.symbol_code;
  const precip1 = (e) => (n1(e) && n1(e).details && n1(e).details.precipitation_amount) || 0;
  const lp0 = localParts(first.time, tz);
  const s0 = sym(first);
  const kmh = (ms) => (typeof ms === 'number' ? Math.round(ms * 3.6 * 10) / 10 : undefined);
  const current = {
    time: `${lp0.date}T${lp0.hm}`,
    temp: d0.air_temperature,
    feels: d0.air_temperature,
    humidity: d0.relative_humidity,
    isDay: symbolIsDay(s0),
    precipitation: precip1(first), rain: precip1(first), showers: 0,
    weatherCode: symbolToWmo(s0),
    windKmh: kmh(d0.wind_speed), windDir: d0.wind_from_direction,
    gustKmh: kmh(d0.wind_speed_of_gust),
    pressure: d0.air_pressure_at_sea_level,
  };

  const hourly = [];
  for (let i = 1; i < ts.length && hourly.length < 12; i++) {
    const e = ts[i];
    if (!n1(e)) break;
    const lp = localParts(e.time, tz);
    hourly.push({ time: `${lp.date}T${lp.hm}`, temp: e.data.instant.details.air_temperature, rainProb: undefined, precip: precip1(e), code: symbolToWmo(sym(e)), isDay: symbolIsDay(sym(e)) });
  }

  const byDay = new Map();
  ts.forEach((e) => {
    const lp = localParts(e.time, tz);
    let day = byDay.get(lp.date);
    if (!day) { day = { date: lp.date, max: -1e9, min: 1e9, sum: 0, code: undefined, codeHourDist: 99 }; byDay.set(lp.date, day); }
    const t = e.data.instant.details.air_temperature;
    if (typeof t === 'number') { day.max = Math.max(day.max, t); day.min = Math.min(day.min, t); }
    if (n1(e)) day.sum += precip1(e);
    else if (e.data.next_6_hours && lp.hour % 6 === 0) day.sum += (e.data.next_6_hours.details || {}).precipitation_amount || 0;
    const dist = Math.abs(lp.hour - 12);
    if (dist < day.codeHourDist && sym(e)) { day.code = symbolToWmo(sym(e)); day.codeHourDist = dist; }
  });
  const daily = [...byDay.values()].slice(0, 6).map((d) => ({
    date: d.date, code: d.code, max: d.max > -1e8 ? Math.round(d.max * 10) / 10 : undefined, min: d.min < 1e8 ? Math.round(d.min * 10) / 10 : undefined,
    rainProb: undefined, rainSum: Math.round(d.sum * 10) / 10,
  }));
  return { fetchedAt: Date.now(), timezone: tz, source: 'metno', current, daily, hourly, minutely: [] };
}

async function fetchMetno(lat, lon, tz) {
  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${Number(lat).toFixed(4)}&lon=${Number(lon).toFixed(4)}`;
  return parse(await getJson(url), tz);
}

module.exports = { fetchMetno, parse, symbolToWmo };
