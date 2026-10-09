'use strict';

// Image size presets per aspect ratio. 16:9 matches the HomeKit camera player (no black bars).
const ASPECTS = ['16:9', '4:3', '13:9'];

const PRESETS = {
  '16:9': {
    low: { width: 960, height: 540, jpegQuality: 70, deviceScaleFactor: 1 },
    medium: { width: 1280, height: 720, jpegQuality: 82, deviceScaleFactor: 1 },
    high: { width: 1600, height: 900, jpegQuality: 92, deviceScaleFactor: 1 },
    ultra: { width: 1600, height: 900, jpegQuality: 95, deviceScaleFactor: 2 },
  },
  '4:3': {
    low: { width: 800, height: 600, jpegQuality: 70, deviceScaleFactor: 1 },
    medium: { width: 1024, height: 768, jpegQuality: 82, deviceScaleFactor: 1 },
    high: { width: 1280, height: 960, jpegQuality: 92, deviceScaleFactor: 1 },
    ultra: { width: 1280, height: 960, jpegQuality: 95, deviceScaleFactor: 2 },
  },
  // the original plugin size (1300x900)
  '13:9': {
    low: { width: 800, height: 550, jpegQuality: 70, deviceScaleFactor: 1 },
    medium: { width: 1000, height: 700, jpegQuality: 82, deviceScaleFactor: 1 },
    high: { width: 1300, height: 900, jpegQuality: 95, deviceScaleFactor: 1 },
    ultra: { width: 1300, height: 900, jpegQuality: 95, deviceScaleFactor: 2 },
  },
};

function preset(aspect, quality) {
  const a = PRESETS[aspect] || PRESETS['16:9'];
  return a[quality] || a.high;
}

module.exports = { ASPECTS, PRESETS, preset };
