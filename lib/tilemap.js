'use strict';

const https = require('https');

// Free raster tile sources (no API key). Attribution is drawn on the image (can be turned off).
const BASE_LAYERS = {
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maxZoom: 18, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
  },
  streets: {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    maxZoom: 19, attribution: '© OpenStreetMap contributors',
  },
  voyager: {
    url: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    maxZoom: 19, attribution: '© OpenStreetMap contributors © CARTO',
  },
  dark: {
    url: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    maxZoom: 19, attribution: '© OpenStreetMap contributors © CARTO',
  },
  topo: {
    url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
    maxZoom: 17, attribution: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)',
  },
};

// RainViewer color schemes
const RADAR_COLORS = { original: 1, blue: 2, titan: 3, twc: 4, meteored: 5, nexrad: 6, rainbow: 7, darksky: 8 };

function getJson(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'homebridge-windy-camera' }, timeout: timeoutMs || 15000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); reject(new Error('HTTP ' + res.statusCode)); return; }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

/** Returns the newest RainViewer radar tile URL template, or throws. */
async function radarTemplate(cfg) {
  if (cfg.map._radarTemplate) return cfg.map._radarTemplate; // tests / advanced override
  const j = await getJson('https://api.rainviewer.com/public/weather-maps.json');
  const frames = (j.radar && j.radar.past) || [];
  if (!frames.length) throw new Error('no radar frames');
  const f = frames[frames.length - 1];
  const color = RADAR_COLORS[cfg.map.radarColors] || RADAR_COLORS.rainbow;
  return `${j.host || 'https://tilecache.rainviewer.com'}${f.path}/256/{z}/{x}/{y}/${color}/1_1.png`;
}

function baseLayer(cfg) {
  if (cfg.map.style === 'custom') {
    return { url: cfg.map.customTileUrl, maxZoom: 19, attribution: '' };
  }
  return BASE_LAYERS[cfg.map.style];
}

/** Full HTML page that draws the tile map (own tiny slippy-map renderer, no libraries). */
function buildHtml(cfg, radarUrl) {
  const base = baseLayer(cfg);
  const data = {
    lat: cfg.lat, lon: cfg.lon, zoom: cfg.windy.zoom,
    w: cfg.image.width, h: cfg.image.height,
    base: { url: base.url, maxZoom: base.maxZoom },
    radar: radarUrl ? { url: radarUrl, maxZoom: 7, opacity: cfg.map.radarOpacity } : null,
    marker: cfg.map.marker,
    attribution: cfg.map.attribution ? [base.attribution, radarUrl ? 'Radar © RainViewer' : ''].filter(Boolean).join(' · ') : '',
    timeout: 25000,
  };
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#1b2330;overflow:hidden}
#map{position:absolute;left:0;top:0;width:${data.w}px;height:${data.h}px;overflow:hidden;background:#1b2330}
#map img{position:absolute;display:block;user-select:none}
#pin{position:absolute;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:#ef4444;border:3px solid #fff;box-shadow:0 0 0 3px rgba(239,68,68,.35),0 2px 8px rgba(0,0,0,.6);z-index:5}
#attr{position:absolute;right:6px;bottom:4px;z-index:6;font:11px/1.2 system-ui,Arial,sans-serif;color:#fff;background:rgba(0,0,0,.45);padding:2px 6px;border-radius:4px}
</style></head><body><div id="map"></div><script>
(function(){
var D=${JSON.stringify(data)};
var map=document.getElementById('map');
var stats={ok:0,fail:0,total:0};
var pending=0, finished=false;
function done(){ if(finished) return; finished=true; window.__tiles=stats; window.__tilesDone=true; }
function worldX(lon,z){ return (lon+180)/360*256*Math.pow(2,z); }
function worldY(lat,z){ var r=lat*Math.PI/180; return (1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*256*Math.pow(2,z); }
function fill(tpl,z,x,y){ return tpl.replace('{z}',z).replace('{x}',x).replace('{y}',y).replace('{s}','a'); }
function layer(L,opacity){
  var zl=Math.min(D.zoom,L.maxZoom), s=Math.pow(2,D.zoom-zl), size=256*s;
  var cx=worldX(D.lon,D.zoom), cy=worldY(D.lat,D.zoom);
  var left=cx-D.w/2, top=cy-D.h/2;
  var x0=Math.floor(left/size), x1=Math.floor((left+D.w)/size), y0=Math.floor(top/size), y1=Math.floor((top+D.h)/size);
  var n=Math.pow(2,zl);
  for(var ty=y0;ty<=y1;ty++){ for(var tx=x0;tx<=x1;tx++){
    if(ty<0||ty>=n) continue;
    var wx=((tx%n)+n)%n;
    var im=new Image();
    im.style.left=Math.round(tx*size-left)+'px'; im.style.top=Math.round(ty*size-top)+'px';
    im.style.width=Math.ceil(size)+'px'; im.style.height=Math.ceil(size)+'px';
    if(opacity<1) im.style.opacity=opacity;
    stats.total++; pending++;
    (function(im,isBase){
      im.onload=function(){ if(isBase) stats.ok++; if(--pending===0) done(); };
      im.onerror=function(){ if(isBase) stats.fail++; im.remove(); if(--pending===0) done(); };
    })(im,L===D.base);
    im.src=fill(L.url,zl,wx,ty);
    map.appendChild(im);
  }}
}
layer(D.base,1);
if(D.radar) layer(D.radar,D.radar.opacity);
if(D.marker){ var p=document.createElement('div'); p.id='pin'; p.style.left=(D.w/2)+'px'; p.style.top=(D.h/2)+'px'; document.body.appendChild(p); }
if(D.attribution){ var a=document.createElement('div'); a.id='attr'; a.textContent=D.attribution; document.body.appendChild(a); }
setTimeout(done,D.timeout);
if(pending===0) done();
})();
</script></body></html>`;
}

module.exports = { BASE_LAYERS, RADAR_COLORS, radarTemplate, buildHtml, baseLayer };
