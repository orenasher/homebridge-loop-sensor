'use strict';

const https = require('https');
const { decode } = require('./pngmini');

const MAPS_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const Z = 7; // highest zoom the free RainViewer tiles offer

function get(url, timeoutMs, asBuffer) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'homebridge-windy-camera' }, timeout: timeoutMs || 15000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error('HTTP ' + res.statusCode)); return; }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => { size += c.length; if (size > 3e6) req.destroy(new Error('response too large')); else chunks.push(c); });
      res.on('end', () => {
        const b = Buffer.concat(chunks);
        if (asBuffer) { resolve(b); return; }
        try { resolve(JSON.parse(b.toString('utf8'))); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function tileAndPixel(lat, lon, z) {
  const n = Math.pow(2, z) * 256;
  const wx = (lon + 180) / 360 * n;
  const r = lat * Math.PI / 180;
  const wy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n;
  return { tx: Math.floor(wx / 256), ty: Math.floor(wy / 256), px: Math.floor(wx % 256), py: Math.floor(wy % 256) };
}

const cache = { path: '', hit: null };

/**
 * Is there a radar echo within `radiusPx` pixels (~1 km each at zoom 7) of the location?
 * Returns { hit, frameTime } or null when the radar cannot be read (caller keeps the model value).
 * `io` can be injected for tests: { json(url), buffer(url) }.
 */
async function radarHit(lat, lon, radiusPx, io) {
  const json = (io && io.json) || ((u) => get(u, 15000, false));
  const buffer = (io && io.buffer) || ((u) => get(u, 15000, true));
  try {
    const j = await json(MAPS_URL);
    const frames = (j.radar && j.radar.past) || [];
    if (!frames.length) return null;
    const f = frames[frames.length - 1];
    const key = f.path + '|' + lat + '|' + lon + '|' + radiusPx;
    if (cache.path === key && !(io && io.noCache)) return cache.hit;
    const { tx, ty, px, py } = tileAndPixel(lat, lon, Z);
    const url = `${j.host || 'https://tilecache.rainviewer.com'}${f.path}/256/${Z}/${tx}/${ty}/2/0_0.png`;
    const png = decode(await buffer(url));
    let hit = false;
    for (let dy = -radiusPx; dy <= radiusPx && !hit; dy++) {
      for (let dx = -radiusPx; dx <= radiusPx; dx++) {
        if (dx * dx + dy * dy <= radiusPx * radiusPx + 1 && png.alphaAt(px + dx, py + dy) > 0) { hit = true; break; }
      }
    }
    const res = { hit, frameTime: f.time };
    cache.path = key; cache.hit = res;
    return res;
  } catch (e) {
    return null;
  }
}

module.exports = { radarHit, tileAndPixel };
