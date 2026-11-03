'use strict';

const zlib = require('zlib');

/**
 * Minimal PNG reader (no dependencies): returns { width, height, alphaAt(x, y) }.
 * Supports non-interlaced 8-bit grey/rgb/palette/grey+alpha/rgba and 1/2/4/8-bit palette images (tRNS aware).
 */
function decode(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8, width = 0, height = 0, depth = 0, ctype = 0, interlace = 0;
  let plte = null, trns = null;
  const idat = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; ctype = data[9]; interlace = data[12]; }
    else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!width || !height || !idat.length) throw new Error('bad PNG');
  if (interlace) throw new Error('interlaced PNG not supported');
  const chans = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  if (!chans) throw new Error('unsupported PNG type');
  if (depth !== 8 && ctype !== 3) throw new Error('unsupported PNG bit depth');
  const bitsPerPixel = chans * depth;
  const bpp = Math.max(1, bitsPerPixel >> 3);
  const stride = Math.ceil((width * bitsPerPixel) / 8);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  if (raw.length < (stride + 1) * height) throw new Error('truncated PNG');
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[dst + x - bpp] : 0;
      const b = y > 0 ? out[dst - stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[dst - stride + x - bpp] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[dst + x] = v & 255;
    }
  }
  function alphaAt(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    if (ctype === 6) return out[y * stride + x * 4 + 3];
    if (ctype === 4) return out[y * stride + x * 2 + 1];
    if (ctype === 3) {
      const bit = x * depth;
      const byte = out[y * stride + (bit >> 3)];
      const idx = depth === 8 ? byte : (byte >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
      return trns && idx < trns.length ? trns[idx] : 255;
    }
    return 255;
  }
  return { width, height, alphaAt };
}

module.exports = { decode };
