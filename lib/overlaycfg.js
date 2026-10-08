'use strict';

const { TEMPLATES } = require('./templates');

const POSITIONS = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

function num(v, def, min, max) {
  const n = Number(v);
  if (v === undefined || v === null || v === '' || !Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}
function bool(v, def) { return typeof v === 'boolean' ? v : def; }
function oneOf(v, list, def) { return list.includes(v) ? v : def; }
function str(v, def) { return typeof v === 'string' && v.trim() ? v.trim() : def; }

/**
 * Normalizes the "overlay" block. Template values are the base, the user's own values win.
 * Pure function (also used by the settings page in the browser).
 */
function normalizeOverlay(raw, template, weatherEnabled) {
  const tpl = (TEMPLATES[template] || TEMPLATES.classic).overlay;
  const own = raw || {};
  const o = Object.assign({}, tpl, Object.fromEntries(Object.entries(own).filter(([, v]) => v !== undefined && v !== null && v !== '')));
  const css = [tpl.customCss, own.customCss].filter((x) => typeof x === 'string' && x.trim()).join('\n');
  const out = {
    enabled: bool(o.enabled, true) && weatherEnabled,
    template: TEMPLATES[template] ? template : 'classic',
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
    customCss: css,
    customHtml: typeof o.customHtml === 'string' ? o.customHtml : '',
  };
  if (out.layout === 'custom' && !out.customHtml.trim()) out.layout = 'card';
  return out;
}

module.exports = { normalizeOverlay, POSITIONS };
