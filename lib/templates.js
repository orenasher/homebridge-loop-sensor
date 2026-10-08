'use strict';

// Ready-made design templates. Anything you set yourself in "overlay" wins over the template.
const TEMPLATES = {
  classic: {
    name: { en: 'Classic', he: 'קלאסי' },
    overlay: { layout: 'card', theme: 'dark', position: 'top-left' },
  },
  minimal: {
    name: { en: 'Minimal', he: 'מינימלי' },
    overlay: { layout: 'compact', theme: 'transparent', position: 'top-left', scale: 1.3, margin: 28 },
  },
  glass: {
    name: { en: 'Frosted glass', he: 'זכוכית' },
    overlay: { layout: 'detailed', theme: 'glass', position: 'bottom-right', forecastDays: 3, hourlyCount: 0, borderRadius: 22 },
  },
  'banner-dark': {
    name: { en: 'Dark banner', he: 'פס כהה' },
    overlay: { layout: 'banner', theme: 'dark', position: 'bottom-center', forecastDays: 3, margin: 16, borderRadius: 14 },
  },
  'banner-light': {
    name: { en: 'Light banner', he: 'פס בהיר' },
    overlay: { layout: 'banner', theme: 'light', position: 'top-center', forecastDays: 3, margin: 16, borderRadius: 14 },
  },
  neon: {
    name: { en: 'Neon', he: 'ניאון' },
    overlay: {
      layout: 'detailed', theme: 'dark', position: 'top-right', forecastDays: 3,
      backgroundColor: 'rgba(8,8,24,.88)', textColor: '#e0f2fe', accentColor: '#22d3ee', borderRadius: 18,
      customCss: '#wc-overlay{border:1px solid #22d3ee;box-shadow:0 0 18px rgba(34,211,238,.55)} #wc-overlay .wc-temp{text-shadow:0 0 14px rgba(34,211,238,.9)}',
    },
  },
  sunset: {
    name: { en: 'Sunset', he: 'שקיעה' },
    overlay: {
      layout: 'card', theme: 'dark', position: 'bottom-left',
      backgroundColor: 'linear-gradient(135deg,rgba(249,115,22,.92),rgba(190,24,93,.92))', textColor: '#fff7ed', accentColor: '#fde047', borderRadius: 24,
    },
  },
  ocean: {
    name: { en: 'Ocean', he: 'אוקיינוס' },
    overlay: {
      layout: 'detailed', theme: 'dark', position: 'bottom-left', forecastDays: 3,
      backgroundColor: 'linear-gradient(135deg,rgba(14,165,233,.9),rgba(30,58,138,.92))', textColor: '#f0f9ff', accentColor: '#bae6fd', borderRadius: 22,
    },
  },
  forest: {
    name: { en: 'Forest', he: 'יער' },
    overlay: {
      layout: 'card', theme: 'dark', position: 'top-right',
      backgroundColor: 'linear-gradient(135deg,rgba(22,101,52,.92),rgba(6,78,59,.94))', textColor: '#f0fdf4', accentColor: '#86efac', borderRadius: 20,
    },
  },
  'high-contrast': {
    name: { en: 'High contrast', he: 'ניגודיות גבוהה' },
    overlay: {
      layout: 'card', theme: 'dark', position: 'top-left', scale: 1.2,
      backgroundColor: '#000000', textColor: '#ffffff', accentColor: '#facc15', opacity: 1, borderRadius: 8,
    },
  },
  'big-tv': {
    name: { en: 'Big (TV)', he: 'גדול (טלוויזיה)' },
    overlay: { layout: 'compact', theme: 'dark', position: 'top-right', scale: 1.8, margin: 30 },
  },
  'full-forecast': {
    name: { en: 'Full forecast', he: 'תחזית מלאה' },
    overlay: { layout: 'detailed', theme: 'glass', position: 'bottom-left', forecastDays: 5, hourlyCount: 6, scale: 0.95 },
  },
};

const TEMPLATE_IDS = Object.keys(TEMPLATES);

module.exports = { TEMPLATES, TEMPLATE_IDS };
