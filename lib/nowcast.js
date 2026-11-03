'use strict';

const { RAIN_CODES } = require('./codes');

// "YYYY-MM-DDTHH:MM" (local, no zone) -> minutes since epoch, treating both sides as the same zone
function mins(t) { return Date.parse(String(t).slice(0, 16) + ':00Z') / 60000; }

/**
 * Derives extra flags from a parsed weather object and stores them on weather.current:
 * rainSoon / rainSoonInMin, storm / stormWhy, windy, uvHigh.
 * Pure function; all thresholds come from cfg (weather block).
 */
function derive(w, cfg) {
  const c = w.current;
  const mm = Math.max(c.precipitation || 0, c.rain || 0, c.showers || 0);

  // --- rain expected soon (only meaningful while it is not raining) ---
  let soonIn = null;
  if (!c.raining && c.time) {
    const now = mins(c.time);
    const horizon = now + cfg.soonMinutes;
    (w.minutely || []).forEach((m) => {
      const t = mins(m.time);
      if (t > now && t <= horizon && (m.precip || 0) >= cfg.soonMm && (soonIn === null || t - now < soonIn)) soonIn = Math.round(t - now);
    });
    if (soonIn === null) {
      (w.hourly || []).forEach((h) => {
        const t = mins(h.time);
        // sources without a probability (MET Norway fallback) are judged on amount / weather code alone
        const probOk = typeof h.rainProb === 'number' ? h.rainProb >= cfg.soonProbability : true;
        const hit = probOk && ((h.precip || 0) >= cfg.soonMm || RAIN_CODES.has(h.code));
        if (hit && t > now - 59 && t <= horizon && (soonIn === null || Math.max(0, t - now) < soonIn)) soonIn = Math.max(0, Math.round(t - now));
      });
    }
  }
  c.rainSoon = soonIn !== null;
  c.rainSoonInMin = soonIn;

  // --- storm: thunderstorm code OR strong gusts OR heavy rain ---
  const why = [];
  if (c.weatherCode >= 95 && c.weatherCode <= 99) why.push('thunder');
  if (typeof c.gustKmh === 'number' && c.gustKmh >= cfg.stormGustKmh) why.push('gust');
  if (mm >= cfg.stormHeavyMm) why.push('heavyRain');
  c.storm = why.length > 0;
  c.stormWhy = why;

  // --- windy / UV ---
  const wind = typeof c.windKmh === 'number' ? c.windKmh : 0;
  const gust = typeof c.gustKmh === 'number' ? c.gustKmh : 0;
  c.windy = wind >= cfg.windyKmh || gust >= cfg.windyKmh * 1.5;
  c.uvHigh = typeof c.uv === 'number' && c.uv >= cfg.uvHighIndex;
  return w;
}

module.exports = { derive };
