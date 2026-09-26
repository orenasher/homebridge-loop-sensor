'use strict';

const PLUGIN_NAME = 'homebridge-loop-sensor';
const PLATFORM_NAME = 'LoopSensor';

const UNIT_MS = { seconds: 1000, minutes: 60 * 1000, hours: 60 * 60 * 1000 };
const MIN_INTERVAL_MS = 10 * 1000; // never pulse more often than every 10 seconds

module.exports = (api) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, LoopSensorPlatform);
};

class LoopSensorPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.api = api;
    this.cached = new Map();
    this.loops = [];

    if (!api) return;
    api.on('didFinishLaunching', () => this.setup());
    api.on('shutdown', () => this.loops.forEach((l) => l.stop(false)));
  }

  configureAccessory(accessory) {
    this.cached.set(accessory.UUID, accessory);
  }

  setup() {
    const items = Array.isArray(this.config.loops) ? this.config.loops : [];
    const seen = new Set();

    items.forEach((item, i) => {
      if (!item || !item.name) {
        this.log.warn(`Loop #${i + 1} has no name, skipping`);
        return;
      }
      const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}:${item.id || item.name}`);
      if (seen.has(uuid)) {
        this.log.warn(`Duplicate loop name "${item.name}", skipping`);
        return;
      }
      seen.add(uuid);

      let accessory = this.cached.get(uuid);
      const isNew = !accessory;
      if (isNew) accessory = new this.api.platformAccessory(item.name, uuid);

      this.loops.push(new Loop(this, accessory, item));

      if (isNew) this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      else this.api.updatePlatformAccessories([accessory]);
    });

    const stale = [...this.cached.values()].filter((a) => !seen.has(a.UUID));
    if (stale.length) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
      this.log.info(`Removed ${stale.length} old accessory(ies)`);
    }
  }
}

const SENSORS = {
  contact: {
    service: 'ContactSensor',
    char: 'ContactSensorState',
    idle: (C) => C.ContactSensorState.CONTACT_DETECTED,
    active: (C) => C.ContactSensorState.CONTACT_NOT_DETECTED,
  },
  motion: { service: 'MotionSensor', char: 'MotionDetected', idle: () => false, active: () => true },
  occupancy: {
    service: 'OccupancySensor',
    char: 'OccupancyDetected',
    idle: (C) => C.OccupancyDetected.OCCUPANCY_NOT_DETECTED,
    active: (C) => C.OccupancyDetected.OCCUPANCY_DETECTED,
  },
  leak: {
    service: 'LeakSensor',
    char: 'LeakDetected',
    idle: (C) => C.LeakDetected.LEAK_NOT_DETECTED,
    active: (C) => C.LeakDetected.LEAK_DETECTED,
  },
};

const SWITCHES = { switch: 'Switch', outlet: 'Outlet', lightbulb: 'Lightbulb' };

class Loop {
  constructor(platform, accessory, cfg) {
    const { Service: S, Characteristic: C } = platform.api.hap;
    this.log = platform.log;
    this.C = C;
    this.accessory = accessory;
    this.name = cfg.name;
    this.debug = !!cfg.debug;

    const unit = UNIT_MS[cfg.intervalUnit] ? cfg.intervalUnit : 'minutes';
    const interval = Number(cfg.interval) > 0 ? Number(cfg.interval) : 2;
    this.intervalMs = Math.max(MIN_INTERVAL_MS, Math.round(interval * UNIT_MS[unit]));
    const pulseSec = Number(cfg.pulseSeconds) > 0 ? Number(cfg.pulseSeconds) : 2;
    this.pulseMs = Math.min(Math.round(pulseSec * 1000), this.intervalMs - 1000);
    this.pulseOnStart = cfg.pulseOnStart !== false;
    this.remember = cfg.rememberState !== false;
    this.autoOffMs = Number(cfg.autoOffMinutes) > 0 ? Math.round(cfg.autoOffMinutes * 60000) : 0;

    this.sensorDef = SENSORS[cfg.sensorType] || SENSORS.contact;
    const switchService = S[SWITCHES[cfg.switchType] || 'Switch'];

    accessory.getService(S.AccessoryInformation)
      .setCharacteristic(C.Manufacturer, 'Oren Asher')
      .setCharacteristic(C.Model, 'Loop Sensor')
      .setCharacteristic(C.SerialNumber, accessory.UUID.slice(0, 12));

    // Drop services left over from a previous config (sensor/switch type changed)
    const keep = new Set([S.AccessoryInformation.UUID, switchService.UUID, S[this.sensorDef.service].UUID]);
    accessory.services.filter((s) => !keep.has(s.UUID)).forEach((s) => accessory.removeService(s));

    const switchName = cfg.switchName || cfg.name;
    const sensorName = cfg.sensorName || `${cfg.name} חיישן`;

    this.switch = accessory.getServiceById(switchService, 'switch')
      || accessory.addService(switchService, switchName, 'switch');
    this.sensor = accessory.getServiceById(S[this.sensorDef.service], 'sensor')
      || accessory.addService(S[this.sensorDef.service], sensorName, 'sensor');
    this.setNames(this.switch, switchName);
    this.setNames(this.sensor, sensorName);
    this.switch.setPrimaryService(true);

    this.sensorChar = this.sensor.getCharacteristic(C[this.sensorDef.char]);
    this.sensorChar.updateValue(this.sensorDef.idle(C));

    this.onChar = this.switch.getCharacteristic(C.On);
    this.onChar
      .onGet(() => this.running)
      .onSet((value) => (value ? this.start() : this.stop()));

    this.running = false;
    this.cycleTimer = null;
    this.pulseTimer = null;
    this.autoOffTimer = null;

    const wasOn = this.remember && accessory.context.on === true;
    this.onChar.updateValue(false);
    if (wasOn) this.start(true);
  }

  setNames(service, name) {
    service.setCharacteristic(this.C.Name, name);
    if (this.C.ConfiguredName && !service.testCharacteristic(this.C.ConfiguredName)) {
      service.addOptionalCharacteristic(this.C.ConfiguredName);
      service.setCharacteristic(this.C.ConfiguredName, name);
    }
  }

  start(restoring = false) {
    if (this.running) return;
    this.running = true;
    this.accessory.context.on = true;
    this.onChar.updateValue(true);
    this.log.info(`${this.name}: loop started (every ${this.intervalMs / 1000}s)${restoring ? ' [restored]' : ''}`);

    if (this.pulseOnStart && !restoring) this.pulse();
    this.schedule();

    if (this.autoOffMs) {
      this.autoOffTimer = setTimeout(() => {
        this.log.info(`${this.name}: auto-off reached`);
        this.stop();
      }, this.autoOffMs);
    }
  }

  stop(persist = true) {
    clearTimeout(this.cycleTimer);
    clearTimeout(this.pulseTimer);
    clearTimeout(this.autoOffTimer);
    this.cycleTimer = this.pulseTimer = this.autoOffTimer = null;
    this.sensorChar.updateValue(this.sensorDef.idle(this.C));
    if (!this.running) return;
    this.running = false;
    if (persist) this.accessory.context.on = false;
    this.onChar.updateValue(false);
    this.log.info(`${this.name}: loop stopped`);
  }

  // Single timer chain: only one pending timer per loop, and none while off.
  schedule() {
    this.cycleTimer = setTimeout(() => {
      if (!this.running) return;
      this.pulse();
      this.schedule();
    }, this.intervalMs);
  }

  pulse() {
    clearTimeout(this.pulseTimer);
    this.sensorChar.updateValue(this.sensorDef.active(this.C));
    if (this.debug) this.log.info(`${this.name}: pulse`);
    this.pulseTimer = setTimeout(() => {
      this.sensorChar.updateValue(this.sensorDef.idle(this.C));
    }, this.pulseMs);
  }
}

module.exports.Loop = Loop;
module.exports.LoopSensorPlatform = LoopSensorPlatform;
