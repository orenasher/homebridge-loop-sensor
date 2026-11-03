'use strict';

const fs = require('fs');
const path = require('path');
const { render } = require('./overlay');
const { radarTemplate, radarFrames, cloudsTemplate, buildHtml } = require('./tilemap');

function windyUrl(cfg) {
  const { lat, lon, image, windy } = cfg;
  const ov = windy.overlay;
  const product = ov === 'radar' ? 'radar' : ov === 'satellite' ? 'satellite' : 'ecmwf';
  return 'https://embed.windy.com/embed2.html?' + [
    `lat=${lat}`, `lon=${lon}`, `detailLat=${lat}`, `detailLon=${lon}`,
    `width=${image.width}`, `height=${image.height}`, `zoom=${windy.zoom}`,
    'level=surface', `overlay=${ov}`, `product=${product}`, 'menu=', 'message=true', 'marker=',
    'calendar=now', 'pressure=false', 'type=map', 'location=coordinates', 'detail=',
    'metricWind=default', 'metricTemp=default', 'radarRange=-1',
  ].join('&');
}

const HIDE_UI_CSS = '#logo-wrapper,#bottom,#embed-zoom,.leaflet-control-zoom,#mobile-ovr-select,#windy-logo,.logo-wrapper{display:none!important}';

function loadPlaywright() {
  try { return require('playwright-core'); } catch (e) {
    try { return require('playwright'); } catch (e2) {
      throw new Error('playwright-core is not installed (reinstall the plugin): ' + e.message);
    }
  }
}

async function injectOverlay(page, cfg, weather) {
  if (!(cfg.overlay.enabled && weather)) return;
  const { css, html } = render(cfg, weather);
  await page.evaluate(({ css, html }) => {
    const old = document.getElementById('wc-overlay-wrap');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'wc-overlay-wrap';
    const st = document.createElement('style');
    st.textContent = css;
    wrap.appendChild(st);
    wrap.insertAdjacentHTML('beforeend', html);
    document.body.appendChild(wrap);
  }, { css, html });
  await page.waitForTimeout(300);
}

function clockLabel(unixSec, cfg, weather, minsAgo) {
  const tz = cfg.weather.timezone || (weather && weather.timezone) || undefined;
  let t;
  try { t = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date(unixSec * 1000)); } catch (e) { t = new Date(unixSec * 1000).toTimeString().slice(0, 5); }
  return minsAgo > 0 ? `${t}  (-${minsAgo}${cfg.weather.language === 'he' ? ' דק׳' : ' min'})` : `${t}  ${cfg.weather.language === 'he' ? 'עכשיו' : 'now'}`;
}

/** Renders the last N radar frames (oldest first) as frames/f0.jpg ... used by the animated live view. */
async function renderFrames(page, cfg, weather, outPath, hooks, cloudsUrl) {
  const frames = await radarFrames(cfg, cfg.map.animationFrames);
  const latest = frames[frames.length - 1].time;
  const dir = path.join(path.dirname(outPath), 'frames');
  fs.mkdirSync(dir, { recursive: true });
  if (hooks.anim && hooks.anim.time === latest && fs.existsSync(path.join(dir, 'f0.jpg'))) return;
  for (let i = 0; i < frames.length; i++) {
    const ago = Math.round((latest - frames[i].time) / 60);
    await page.setContent(buildHtml(cfg, frames[i].url, { cloudsUrl, label: clockLabel(frames[i].time, cfg, weather, ago) }), { waitUntil: 'domcontentloaded', timeout: cfg.windy.timeoutMs });
    await page.waitForFunction(() => window.__tilesDone === true, null, { timeout: cfg.windy.timeoutMs });
    const st = await page.evaluate(() => window.__tiles);
    if (!st || st.ok === 0) throw new Error('animation frame: no tiles');
    await page.waitForTimeout(300);
    await injectOverlay(page, cfg, weather);
    const f = path.join(dir, `f${i}.jpg`);
    await page.screenshot({ path: f + '.tmp', type: 'jpeg', quality: Math.min(cfg.image.jpegQuality, 85) });
    fs.renameSync(f + '.tmp', f);
  }
  // hold the newest frame a little longer before the loop restarts
  let count = frames.length;
  for (let k = 0; k < 3; k++) { fs.copyFileSync(path.join(dir, `f${frames.length - 1}.jpg`), path.join(dir, `f${count}.jpg`)); count++; }
  fs.readdirSync(dir).forEach((n) => { const m = /^f(\d+)\.jpg$/.exec(n); if (m && Number(m[1]) >= count) { try { fs.unlinkSync(path.join(dir, n)); } catch (e) { /* ignore */ } } });
  fs.writeFileSync(path.join(dir, 'frames.json'), JSON.stringify({ count, time: latest, fps: cfg.map.animationFps, written: Date.now() }));
  if (hooks.anim) hooks.anim.time = latest;
}

/**
 * Takes one screenshot of Windy, optionally with the weather overlay, and atomically writes it to outPath.
 * `playwright` can be injected for tests.
 */
async function capture(cfg, weather, outPath, playwright, hooks) {
  hooks = hooks || {};
  const pw = playwright || loadPlaywright();
  const launchOpts = {
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--disable-gpu', '--lang=' + (cfg.weather.language === 'he' ? 'he-IL' : 'en-US')],
  };
  if (cfg.chromiumPath) launchOpts.executablePath = cfg.chromiumPath;

  let browser;
  try {
    browser = await pw.chromium.launch(launchOpts);
    const context = await browser.newContext({
      viewport: { width: cfg.image.width, height: cfg.image.height },
      deviceScaleFactor: cfg.image.deviceScaleFactor,
      geolocation: { latitude: cfg.lat, longitude: cfg.lon },
      permissions: ['geolocation'],
      locale: cfg.weather.language === 'he' ? 'he-IL' : 'en-US',
    });
    const page = await context.newPage();
    let cloudsUrl = '';
    if (cfg.map.style === 'windy') {
      await page.goto(cfg.windy.url || windyUrl(cfg), { waitUntil: 'domcontentloaded', timeout: cfg.windy.timeoutMs });
      await page.waitForTimeout(cfg.windy.waitMs);
      if (cfg.windy.hideWindyUi) {
        await page.addStyleTag({ content: HIDE_UI_CSS }).catch(() => {});
      }
    } else {
      // own tile map: base map (satellite / streets / ...) + RainViewer radar
      let radarUrl = '';
      cloudsUrl = '';
      if (cfg.map.radar) {
        try { radarUrl = await radarTemplate(cfg); } catch (e) { if (hooks.onRadarFail) hooks.onRadarFail(e.message); }
      }
      if (cfg.map.clouds) {
        try { cloudsUrl = await cloudsTemplate(cfg); } catch (e) { if (hooks.onRadarFail) hooks.onRadarFail(e.message); }
      }
      await page.setContent(buildHtml(cfg, radarUrl, { cloudsUrl }), { waitUntil: 'domcontentloaded', timeout: cfg.windy.timeoutMs });
      await page.waitForFunction(() => window.__tilesDone === true, null, { timeout: cfg.windy.timeoutMs });
      const st = await page.evaluate(() => window.__tiles);
      if (!st || st.ok === 0) { const err = new Error('noTiles'); err.code = 'NO_TILES'; throw err; }
      await page.waitForTimeout(500);
    }
    await injectOverlay(page, cfg, weather);

    const tmp = outPath + '.tmp';
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await page.screenshot({ path: tmp, type: 'jpeg', quality: cfg.image.jpegQuality });
    fs.renameSync(tmp, outPath);

    // optional animated loop for the live view (never allowed to break the normal picture)
    if (cfg.map.animation && cfg.map.style !== 'windy') {
      try { await renderFrames(page, cfg, weather, outPath, hooks, cloudsUrl); } catch (e) { if (hooks.onAnimFail) hooks.onAnimFail(e.message); }
    }
  } finally {
    if (browser) { try { await browser.close(); } catch (e) { /* ignore */ } }
  }
}

module.exports = { capture, windyUrl, clockLabel };
