'use strict';

const fs = require('fs');
const path = require('path');
const { render } = require('./overlay');
const { radarTemplate, buildHtml } = require('./tilemap');

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
    if (cfg.map.style === 'windy') {
      await page.goto(cfg.windy.url || windyUrl(cfg), { waitUntil: 'domcontentloaded', timeout: cfg.windy.timeoutMs });
      await page.waitForTimeout(cfg.windy.waitMs);
      if (cfg.windy.hideWindyUi) {
        await page.addStyleTag({ content: HIDE_UI_CSS }).catch(() => {});
      }
    } else {
      // own tile map: base map (satellite / streets / ...) + RainViewer radar
      let radarUrl = '';
      if (cfg.map.radar) {
        try { radarUrl = await radarTemplate(cfg); } catch (e) { if (hooks.onRadarFail) hooks.onRadarFail(e.message); }
      }
      await page.setContent(buildHtml(cfg, radarUrl), { waitUntil: 'domcontentloaded', timeout: cfg.windy.timeoutMs });
      await page.waitForFunction(() => window.__tilesDone === true, null, { timeout: cfg.windy.timeoutMs });
      const st = await page.evaluate(() => window.__tiles);
      if (!st || st.ok === 0) { const err = new Error('noTiles'); err.code = 'NO_TILES'; throw err; }
      await page.waitForTimeout(500);
    }
    if (cfg.overlay.enabled && weather) {
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

    const tmp = outPath + '.tmp';
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await page.screenshot({ path: tmp, type: 'jpeg', quality: cfg.image.jpegQuality });
    fs.renameSync(tmp, outPath);
  } finally {
    if (browser) { try { await browser.close(); } catch (e) { /* ignore */ } }
  }
}

module.exports = { capture, windyUrl };
