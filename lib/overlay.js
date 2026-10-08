'use strict';

const { describe } = require('./codes');

const THEMES = {
  dark: { bg: 'rgba(15,23,42,{o})', fg: '#ffffff', sub: 'rgba(255,255,255,.72)', accent: '#38bdf8', border: 'rgba(255,255,255,.12)', blur: '0px' },
  light: { bg: 'rgba(255,255,255,{o})', fg: '#0f172a', sub: 'rgba(15,23,42,.65)', accent: '#0369a1', border: 'rgba(15,23,42,.12)', blur: '0px' },
  glass: { bg: 'rgba(255,255,255,{o2})', fg: '#ffffff', sub: 'rgba(255,255,255,.8)', accent: '#7dd3fc', border: 'rgba(255,255,255,.35)', blur: '10px' },
  transparent: { bg: 'rgba(0,0,0,0)', fg: '#ffffff', sub: 'rgba(255,255,255,.85)', accent: '#7dd3fc', border: 'rgba(0,0,0,0)', blur: '0px' },
  custom: { bg: 'rgba(15,23,42,{o})', fg: '#ffffff', sub: 'rgba(255,255,255,.72)', accent: '#38bdf8', border: 'rgba(255,255,255,.12)', blur: '0px' },
};

function esc(s) {
  return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const T = {
  he: { feels: 'מורגש', humidity: 'לחות', wind: 'רוח', raining: 'יורד גשם', dry: 'אין גשם', updated: 'עודכן', today: 'היום', kmh: 'קמ״ש', mph: 'מייל/ש׳', days: ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'] },
  en: { feels: 'Feels', humidity: 'Humidity', wind: 'Wind', raining: 'Raining now', dry: 'No rain', updated: 'Updated', today: 'Today', kmh: 'km/h', mph: 'mph', days: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] },
};

function fmt(w, cfg) {
  const imp = cfg.weather.units === 'imperial';
  const t = (c) => (typeof c === 'number' ? Math.round(imp ? c * 9 / 5 + 32 : c) : '–');
  const unit = imp ? '°F' : '°C';
  const lang = T[cfg.weather.language];
  const cur = w.current;
  const d = describe(cur.weatherCode, cur.isDay, cfg.weather.language);
  const wind = typeof cur.windKmh === 'number' ? Math.round(imp ? cur.windKmh * 0.621371 : cur.windKmh) : '–';
  const tz = cfg.weather.timezone || w.timezone || undefined;
  let clock = '';
  try {
    clock = new Intl.DateTimeFormat(cfg.weather.language === 'he' ? 'he-IL' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date());
  } catch (e) { clock = new Date().toTimeString().slice(0, 5); }
  return { t, unit, lang, cur, d, wind, windUnit: imp ? lang.mph : lang.kmh, clock };
}

function dayName(dateStr, lang, i) {
  if (i === 0) return lang.today;
  const [y, m, dd] = dateStr.split('-').map(Number);
  return lang.days[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()];
}

function forecastHtml(w, cfg, f) {
  const o = cfg.overlay;
  let out = '';
  if (o.hourlyCount > 0 && w.hourly.length) {
    out += '<div class="wc-row">' + w.hourly.slice(0, o.hourlyCount).map((h) => {
      const d = describe(h.code, h.isDay, cfg.weather.language);
      return `<div class="wc-cell"><span class="wc-sub">${esc(String(h.time).slice(11, 16))}</span><span class="wc-ic">${o.icons ? d.icon : ''}</span><b>${f.t(h.temp)}°</b>` +
        (typeof h.rainProb === 'number' ? `<span class="wc-sub">${h.rainProb}%</span>` : '') + '</div>';
    }).join('') + '</div>';
  }
  if (o.forecastDays > 0 && w.daily.length) {
    out += '<div class="wc-row">' + w.daily.slice(1, 1 + o.forecastDays).map((dd) => {
      const d = describe(dd.code, 1, cfg.weather.language);
      return `<div class="wc-cell"><span class="wc-sub">${esc(dayName(dd.date, f.lang, 1))}</span><span class="wc-ic">${o.icons ? d.icon : ''}</span>` +
        `<b>${f.t(dd.max)}°</b><span class="wc-sub">${f.t(dd.min)}°</span>` +
        (typeof dd.rainProb === 'number' ? `<span class="wc-sub">${o.icons ? '💧' : ''}${dd.rainProb}%</span>` : '') + '</div>';
    }).join('') + '</div>';
  }
  return out;
}

function vars(cfg, w) {
  const o = cfg.overlay;
  const f = fmt(w, cfg);
  return {
    temp: f.t(f.cur.temp), unit: f.unit, icon: o.icons ? f.d.icon : '', desc: f.d.text, feels: f.t(f.cur.feels),
    humidity: f.cur.humidity, wind: f.wind, windUnit: f.windUnit,
    city: cfg.locationName, time: f.clock,
    rain: f.cur.raining ? f.lang.raining : f.lang.dry, rainIcon: o.icons ? (f.cur.raining ? '🌧️' : '✔️') : '',
    forecast: forecastHtml(w, cfg, f),
    _f: f, _o: o,
  };
}

function render(cfg, w, opts) {
  opts = opts || {};
  const o = cfg.overlay;
  const v = vars(cfg, w);
  const f = v._f;
  const rtl = cfg.weather.language === 'he';

  let body;
  if (o.layout === 'custom') {
    const map = { temp: v.temp, unit: v.unit, icon: v.icon, desc: v.desc, feels: v.feels, humidity: v.humidity, wind: v.wind, windUnit: v.windUnit, city: v.city, time: v.time, rain: v.rain, rainIcon: v.rainIcon, forecast: v.forecast };
    body = o.customHtml.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in map ? (k === 'forecast' ? map[k] : esc(map[k])) : m));
  } else {
    const city = o.showCity && v.city ? `<div class="wc-city">${esc(v.city)}</div>` : '';
    const rainBadge = o.showRainStatus ? `<div class="wc-rain ${f.cur.raining ? 'on' : 'off'}">${v.rainIcon} ${esc(v.rain)}</div>` : '';
    const stamp = o.showTimestamp ? `<div class="wc-sub wc-stamp">${esc(f.lang.updated)} ${esc(v.time)}</div>` : '';
    const stats = [
      o.showFeelsLike ? `<span>${esc(f.lang.feels)} <b>${v.feels}°</b></span>` : '',
      o.showHumidity ? `<span>${esc(f.lang.humidity)} <b>${v.humidity}%</b></span>` : '',
      o.showWind ? `<span>${esc(f.lang.wind)} <b>${v.wind}</b> ${esc(v.windUnit)}</span>` : '',
    ].filter(Boolean).join('');
    const main = `<div class="wc-main"><span class="wc-icon">${v.icon}</span><span class="wc-temp">${v.temp}<small>${esc(v.unit)}</small></span></div>`;
    if (o.layout === 'compact') {
      body = `${main}${o.showRainStatus && f.cur.raining ? rainBadge : ''}`;
    } else if (o.layout === 'banner') {
      body = `<div class="wc-banner">${city}${main}<div class="wc-desc">${esc(v.desc)}</div><div class="wc-stats">${stats}</div>${rainBadge}${v.forecast}${stamp}</div>`;
    } else {
      body = `${city}${main}<div class="wc-desc">${esc(v.desc)}</div><div class="wc-stats">${stats}</div>${rainBadge}` +
        (o.layout === 'detailed' ? v.forecast : '') + stamp;
    }
  }

  const th = THEMES[o.theme];
  const alpha = o.opacity;
  const bg = o.backgroundColor || th.bg.replace('{o}', String(alpha)).replace('{o2}', String(Math.min(0.35, alpha * 0.4)));
  const fg = o.textColor || th.fg;
  const accent = o.accentColor || th.accent;
  const [vp, hp] = o.position.split('-');
  const m = o.margin;
  const pos = [];
  if (o.layout === 'banner') {
    pos.push(vp === 'bottom' ? `bottom:${m}px` : `top:${m}px`, `left:${m}px`, `right:${m}px`);
  } else {
    pos.push(vp === 'top' ? `top:${m}px` : vp === 'bottom' ? `bottom:${m}px` : 'top:50%');
    pos.push(hp === 'left' ? `left:${m}px` : hp === 'right' ? `right:${m}px` : 'left:50%');
  }
  const tx = o.layout === 'banner' ? '' : (hp === 'center' ? 'translateX(-50%)' : '') + (vp === 'middle' ? ' translateY(-50%)' : '');
  const origin = `${hp === 'right' ? 'right' : hp === 'center' ? 'center' : 'left'} ${vp === 'bottom' ? 'bottom' : vp === 'middle' ? 'center' : 'top'}`;

  const css = `
#wc-overlay{position:fixed;z-index:2147483647;${pos.join(';')};direction:${rtl ? 'rtl' : 'ltr'};
 transform:${tx} scale(${o.scale});transform-origin:${origin};
 font-family:${o.fontFamily};color:${fg};background:${bg};border:1px solid ${th.border};border-radius:${o.borderRadius}px;
 padding:14px 18px;box-sizing:border-box;backdrop-filter:blur(${th.blur});-webkit-backdrop-filter:blur(${th.blur});
 min-width:${o.layout === 'compact' ? 0 : 190}px;line-height:1.25;text-shadow:${o.theme === 'transparent' || o.theme === 'glass' ? '0 1px 4px rgba(0,0,0,.65)' : 'none'};
 ${o.layout === 'banner' ? 'text-align:center' : ''}}
#wc-overlay .wc-city{font-size:20px;font-weight:700;margin-bottom:4px}
#wc-overlay .wc-main{display:flex;align-items:center;gap:10px}
#wc-overlay .wc-icon{font-size:44px;line-height:1}
#wc-overlay .wc-temp{font-size:46px;font-weight:700;line-height:1}
#wc-overlay .wc-temp small{font-size:20px;font-weight:500;margin-inline-start:2px}
#wc-overlay .wc-desc{font-size:18px;margin:2px 0 6px;color:${fg}}
#wc-overlay .wc-stats{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:15px;color:${th.sub}}
#wc-overlay .wc-stats b{color:${fg}}
#wc-overlay .wc-sub{font-size:13px;color:${th.sub}}
#wc-overlay .wc-stamp{margin-top:6px}
#wc-overlay .wc-rain{display:inline-block;margin-top:8px;padding:3px 10px;border-radius:999px;font-size:14px;font-weight:600;border:1px solid ${th.border}}
#wc-overlay .wc-rain.on{background:${accent};color:#04202e}
#wc-overlay .wc-row{display:flex;gap:10px;margin-top:10px;padding-top:8px;border-top:1px solid ${th.border}}
#wc-overlay .wc-cell{display:flex;flex-direction:column;align-items:center;gap:1px;min-width:46px;font-size:15px}
#wc-overlay .wc-ic{font-size:22px}
#wc-overlay .wc-banner{display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px 22px}
#wc-overlay .wc-banner .wc-row{margin:0;padding:0;border:0}
#wc-overlay .wc-banner .wc-rain{margin:0}
${o.customCss}`;

  let outCss = css;
  let outHtml = `<div id="wc-overlay">${body}</div>`;
  if (opts.id) {
    outCss = outCss.split('#wc-overlay').join('#' + opts.id);
    outHtml = outHtml.replace('id="wc-overlay"', `id="${opts.id}"`);
  }
  if (opts.absolute) outCss = outCss.replace('position:fixed', 'position:absolute');
  return { css: outCss, html: outHtml };
}

module.exports = { render, esc, THEMES };
