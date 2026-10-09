'use strict';

const fs = require('fs');
const path = require('path');
const { normalize } = require('./lib/config');
const { fetchWeather } = require('./lib/weather');
const { capture } = require('./lib/capture');
const { WindyCameraDelegate } = require('./lib/camera');
const { t } = require('./lib/i18n');

const PLUGIN_NAME = 'homebridge-windy-camera';
const PLATFORM_NAME = 'WindyCamera';

// tiny dark 320x220 JPEG placeholder served until the first radar frame exists
const PLACEHOLDER_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgQEBMQExYWFhYWFhoYGhsbGxoaGhobGxsdHR0iIiIdHR0bGx0dICAiIiUmJSMjIiMmJigoKDAwLi44ODpFRVP/xABNAAEBAAAAAAAAAAAAAAAAAAAABwEBAQEAAAAAAAAAAAAAAAAAAAMEEAEAAAAAAAAAAAAAAAAAAAAAEQEAAAAAAAAAAAAAAAAAAAAA/8AAEQgA3AFAAwEiAAIRAAMRAP/aAAwDAQACEQMRAD8Ak4DWgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//9k=',
  'base64');

class WindyCameraPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.api = api;
    this.hap = api.hap;
    this.cfg = normalize(config);
    this.cachedAccessories = new Map();
    this.weather = null;
    this.capturing = false;
    this.timers = [];
    this.sensorServices = {};
    this.stopped = false;

    const base = path.join(api.user.storagePath(), 'windy-camera');
    this.imagePath = this.cfg.imagePath || path.join(base, 'rain.jpg');
    this.tr = (k, a) => t(this.cfg.language, k, a);
    this.cfg.notes.forEach((n) => this.log.warn(this.tr(n)));

    if (!api.hap || !api.hap.CameraController) {
      this.log.error(this.tr('oldHap'));
      return;
    }
    try { fs.mkdirSync(path.dirname(this.imagePath), { recursive: true }); } catch (e) { /* ignore */ }

    this.uuidCamera = this.hap.uuid.generate(`${PLUGIN_NAME}:camera:${this.cfg.name}`);
    this.uuidSensors = this.hap.uuid.generate(`${PLUGIN_NAME}:sensors:${this.cfg.name}`);
    this.delegate = new WindyCameraDelegate(this.hap, this.log, this.cfg, () => this.currentImage());

    api.on('didFinishLaunching', () => this.start());
    api.on('shutdown', () => this.shutdown());
  }

  // Homebridge restores cached bridged accessories here (sensors, and the camera in "bridged" mode).
  configureAccessory(accessory) {
    this.cachedAccessories.set(accessory.UUID, accessory);
    if (accessory.UUID === this.uuidCamera && this.delegate && this.cfg.mode === 'bridged') {
      accessory.configureController(this.delegate.controller);
    }
  }

  currentImage() {
    if (fs.existsSync(this.imagePath)) return this.imagePath;
    return this.placeholderPath();
  }

  placeholderPath() {
    const p = path.join(path.dirname(this.imagePath), 'placeholder.jpg');
    if (!fs.existsSync(p)) { try { fs.writeFileSync(p, PLACEHOLDER_JPEG); } catch (e) { /* ignore */ } }
    return p;
  }

  start() {
    this.setupCamera();
    this.setupSensors();
    this.legacyCheck();

    if (!this.cfg.chromiumPath) {
      this.log.warn(this.tr('noChromium'));
    }
    this.log.info(this.tr('ready', { where: this.cfg.locationName || this.cfg.cityLabel, lat: this.cfg.lat, lon: this.cfg.lon, q: this.cfg.image.quality, w: this.cfg.image.width, h: this.cfg.image.height, s: Math.round(this.cfg.captureIntervalMs / 1000) }));

    if (this.cfg.weather.enabled) {
      this.refreshWeather().finally(() => this.scheduleCapture(500));
      this.timers.push(setInterval(() => this.refreshWeather(), this.cfg.weather.refreshMinutes * 60 * 1000));
    } else {
      this.scheduleCapture(500);
    }
  }

  // ---------- accessories ----------
  setupCamera() {
    if (this.cfg.mode === 'bridged') {
      let acc = this.cachedAccessories.get(this.uuidCamera);
      if (!acc) {
        acc = new this.api.platformAccessory(this.cfg.name, this.uuidCamera, this.hap.Categories.IP_CAMERA);
        acc.configureController(this.delegate.controller);
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [acc]);
      }
      this.fillInfo(acc);
      this.log.info(this.tr('bridged'));
      return;
    }
    // external (unbridged) accessory - default. Paired separately with the same PIN as the bridge.
    const stale = this.cachedAccessories.get(this.uuidCamera);
    if (stale) this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [stale]);
    const acc = new this.api.platformAccessory(this.cfg.name, this.uuidCamera, this.hap.Categories.IP_CAMERA);
    acc.configureController(this.delegate.controller);
    this.fillInfo(acc);
    this.api.publishExternalAccessories(PLUGIN_NAME, [acc]);
    this.log.info(this.tr('external'));
  }

  fillInfo(acc) {
    const { Service, Characteristic } = this.hap;
    const info = acc.getService(Service.AccessoryInformation) || acc.addService(Service.AccessoryInformation);
    info.setCharacteristic(Characteristic.Manufacturer, 'homebridge-windy-camera')
      .setCharacteristic(Characteristic.Model, 'Windy Radar Camera')
      .setCharacteristic(Characteristic.SerialNumber, 'WINDY-' + this.uuidCamera.slice(0, 8));
  }

  setupSensors() {
    const s = this.cfg.sensors;
    const want = s.rain || s.temperature || s.humidity;
    const cached = this.cachedAccessories.get(this.uuidSensors);
    if (!want) {
      if (cached) this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [cached]);
      return;
    }
    const { Service, Characteristic } = this.hap;
    const acc = cached || new this.api.platformAccessory(this.cfg.name + ' Sensors', this.uuidSensors, this.hap.Categories.SENSOR);
    this.fillInfoGeneric(acc, 'Windy Weather Sensors', 'WINDY-S-' + this.uuidSensors.slice(0, 8));

    const kinds = {
      motion: [Service.MotionSensor, 'MotionDetected'],
      leak: [Service.LeakSensor, 'LeakDetected'],
      occupancy: [Service.OccupancySensor, 'OccupancyDetected'],
      contact: [Service.ContactSensor, 'ContactSensorState'],
    };
    const wanted = new Set();
    const ensure = (type, name, subtype) => {
      wanted.add(subtype);
      let svc = acc.getServiceById(type, subtype);
      if (!svc) svc = acc.addService(type, name, subtype);
      svc.setCharacteristic(Characteristic.Name, name);
      try { svc.setCharacteristic(Characteristic.ConfiguredName, name); } catch (e) { /* optional */ }
      return svc;
    };

    if (s.rain) {
      const [type, charName] = kinds[s.rainType];
      const svc = ensure(type, s.rainName, 'rain-' + s.rainType);
      this.sensorServices.rain = { svc, charName };
    }
    if (s.temperature) {
      const svc = ensure(Service.TemperatureSensor, s.temperatureName, 'temp');
      svc.getCharacteristic(Characteristic.CurrentTemperature).setProps({ minValue: -50, maxValue: 70 });
      this.sensorServices.temp = svc;
    }
    if (s.humidity) {
      this.sensorServices.hum = ensure(Service.HumiditySensor, s.humidityName, 'hum');
    }
    // remove services that are no longer wanted (e.g. user switched sensor type)
    acc.services.slice().forEach((svc) => {
      if (svc.UUID === Service.AccessoryInformation.UUID) return;
      if (svc.subtype && !wanted.has(svc.subtype)) acc.removeService(svc);
    });

    if (!cached) this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [acc]);
    else this.api.updatePlatformAccessories([acc]);
    this.sensorAccessory = acc;
  }

  fillInfoGeneric(acc, model, serial) {
    const { Service, Characteristic } = this.hap;
    const info = acc.getService(Service.AccessoryInformation) || acc.addService(Service.AccessoryInformation);
    info.setCharacteristic(Characteristic.Manufacturer, 'homebridge-windy-camera')
      .setCharacteristic(Characteristic.Model, model)
      .setCharacteristic(Characteristic.SerialNumber, serial);
  }

  updateSensors() {
    if (!this.weather) return;
    const { Characteristic } = this.hap;
    const cur = this.weather.current;
    const r = this.sensorServices.rain;
    if (r) {
      let value;
      if (r.charName === 'ContactSensorState') value = cur.raining ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED : Characteristic.ContactSensorState.CONTACT_DETECTED;
      else if (r.charName === 'LeakDetected') value = cur.raining ? Characteristic.LeakDetected.LEAK_DETECTED : Characteristic.LeakDetected.LEAK_NOT_DETECTED;
      else if (r.charName === 'OccupancyDetected') value = cur.raining ? Characteristic.OccupancyDetected.OCCUPANCY_DETECTED : Characteristic.OccupancyDetected.OCCUPANCY_NOT_DETECTED;
      else value = !!cur.raining;
      r.svc.updateCharacteristic(Characteristic[r.charName], value);
    }
    if (this.sensorServices.temp) this.sensorServices.temp.updateCharacteristic(Characteristic.CurrentTemperature, cur.temp);
    if (this.sensorServices.hum) this.sensorServices.hum.updateCharacteristic(Characteristic.CurrentRelativeHumidity, cur.humidity);
  }

  // ---------- weather + capture ----------
  async refreshWeather() {
    try {
      this.weather = await fetchWeather(this.cfg.lat, this.cfg.lon, this.cfg.weather);
      const c = this.weather.current;
      this.log.info(this.tr('weather', { t: c.temp, h: c.humidity, c: c.weatherCode, r: c.raining }));
      this.updateSensors();
    } catch (e) {
      this.log.warn(this.tr('weatherFail', e.message));
      if (this.weather && Date.now() - this.weather.fetchedAt > 3 * 3600 * 1000) {
        this.log.warn(this.tr('weatherOld'));
        this.weather = null;
      }
    }
  }

  scheduleCapture(delay) {
    if (this.stopped) return;
    const t = setTimeout(async () => {
      await this.doCapture();
      this.scheduleCapture(this.cfg.captureIntervalMs);
    }, delay);
    this.timers.push(t);
  }

  async doCapture() {
    if (this.capturing || this.stopped) return;
    this.capturing = true;
    try {
      const fresh = this.weather && Date.now() - this.weather.fetchedAt < 3 * 3600 * 1000 ? this.weather : null;
      await capture(this.cfg, fresh, this.imagePath, undefined, { onRadarFail: (m) => { if (!this.radarWarned) { this.radarWarned = true; this.log.warn(this.tr('radarFail', m)); } } });
      if (this.cfg.debug) this.log.info('Radar frame updated');
    } catch (e) {
      this.log.warn(e && e.code === 'NO_TILES' ? this.tr('noTiles') : this.tr('captureFail', e.message));
    } finally {
      this.capturing = false;
    }
  }

  // Detects the pieces left by v1.x (camera-ui injection hook) that are no longer needed.
  legacyCheck() {
    try {
      const dir = '/etc/hb-service/homebridge/prestart.d';
      if (!fs.existsSync(dir)) return;
      const hits = fs.readdirSync(dir).filter((f) => {
        try { return /windy-camera|inject-camera/.test(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { return false; }
      });
      if (hits.length) {
        this.log.warn(this.tr('legacy', hits.map((h) => path.join(dir, h)).join(', ')));
      }
    } catch (e) { /* ignore */ }
  }

  shutdown() {
    this.stopped = true;
    this.timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
    if (this.delegate) this.delegate.shutdown();
  }
}

module.exports = (api) => {
  api.registerPlatform(PLATFORM_NAME, WindyCameraPlatform);
};
module.exports.WindyCameraPlatform = WindyCameraPlatform;
