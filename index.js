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
    const seen = new Set();
    const loops = Array.isArray(this.config.loops) ? this.config.loops : [];
    const guards = Array.isArray(this.config.guards) ? this.config.guards : [];

    loops.forEach((item, i) => {
      const accessory = this.prepare(item, `${item && (item.id || item.name)}`, 'Loop', i, seen);
      if (accessory) this.finish(accessory, new Loop(this, accessory, item));
    });
    guards.forEach((item, i) => {
      const accessory = this.prepare(item, `guard:${item && (item.id || item.name)}`, 'Guard', i, seen);
      if (accessory) this.finish(accessory, new Guard(this, accessory, item));
    });

    const stale = [...this.cached.values()].filter((a) => !seen.has(a.UUID));
    if (stale.length) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
      this.log.info(`Removed ${stale.length} old accessory(ies)`);
    }
  }

  prepare(item, key, kind, i, seen) {
    if (!item || !item.name) {
      this.log.warn(`${kind} #${i + 1} has no name, skipping`);
      return null;
    }
    const uuid = this.api.hap.uuid.generate(`${PLUGIN_NAME}:${key}`);
    if (seen.has(uuid)) {
      this.log.warn(`Duplicate ${kind} name "${item.name}", skipping`);
      return null;
    }
    seen.add(uuid);
    const accessory = this.cached.get(uuid) || new this.api.platformAccessory(item.name, uuid);
    accessory._isNew = !this.cached.has(uuid);
    return accessory;
  }

  finish(accessory, handler) {
    this.loops.push(handler);
    if (accessory._isNew) this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    else this.api.updatePlatformAccessories([accessory]);
    delete accessory._isNew;
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
    this.once = cfg.mode === 'once';
    this.pulseOnStart = cfg.startMode
      ? cfg.startMode !== 'afterInterval'
      : cfg.pulseOnStart !== false;
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
    else delete accessory.context.endAt;
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

    if (this.once) {
      // Countdown: pulse the sensor once when time is up, then turn the switch off.
      const now = Date.now();
      const saved = Number(this.accessory.context.endAt);
      const endAt = restoring && saved ? saved : now + this.intervalMs;
      this.accessory.context.endAt = endAt;
      const remaining = Math.max(1000, endAt - now);
      this.log.info(`${this.name}: countdown started (${Math.round(remaining / 1000)}s)${restoring ? ' [restored]' : ''}`);
      this.cycleTimer = setTimeout(() => this.finishOnce(), remaining);
      return;
    }

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
    if (persist) {
      this.accessory.context.on = false;
      delete this.accessory.context.endAt;
    }
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

  finishOnce() {
    if (!this.running) return;
    this.cycleTimer = null;
    this.running = false;
    this.accessory.context.on = false;
    delete this.accessory.context.endAt;
    this.pulse();
    this.onChar.updateValue(false);
    this.log.info(`${this.name}: countdown finished`);
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

// Guard: fires the output sensor once when the condition switch ("AC") is on
// AND at least one input ("window") switch is on, continuously for X time.
// Closing all inputs or turning the condition off cancels the countdown.
class Guard {
  constructor(platform, accessory, cfg) {
    const { Service: S, Characteristic: C } = platform.api.hap;
    this.log = platform.log;
    this.C = C;
    this.accessory = accessory;
    this.name = cfg.name;

    const unit = UNIT_MS[cfg.delayUnit] ? cfg.delayUnit : 'minutes';
    const delay = Number(cfg.delay) > 0 ? Number(cfg.delay) : 30;
    this.delayMs = Math.max(MIN_INTERVAL_MS, Math.round(delay * UNIT_MS[unit]));
    this.pulseMs = Math.round((Number(cfg.pulseSeconds) > 0 ? Number(cfg.pulseSeconds) : 2) * 1000);
    this.sensorDef = SENSORS[cfg.sensorType] || SENSORS.contact;
    const remember = cfg.rememberState !== false;

    accessory.getService(S.AccessoryInformation)
      .setCharacteristic(C.Manufacturer, 'Oren Asher')
      .setCharacteristic(C.Model, 'Loop Sensor Guard')
      .setCharacteristic(C.SerialNumber, accessory.UUID.slice(0, 12));

    const inputNames = [...new Set((Array.isArray(cfg.inputs) ? cfg.inputs : [])
      .map((x) => (typeof x === 'string' ? x : x && x.name) || '')
      .map((x) => x.trim())
      .filter(Boolean))];
    if (!inputNames.length) this.log.warn(`${this.name}: no windows/doors configured`);

    const ctx = accessory.context;
    ctx.states = remember && ctx.states ? ctx.states : {};

    const wanted = new Map();
    const condName = (cfg.conditionName || 'מזגן').trim();
    wanted.set('cond', { type: S.Switch, name: condName });
    inputNames.forEach((n) => wanted.set(`in:${n}`, { type: S.Switch, name: n }));
    const outName = cfg.sensorName || `${this.name}`;
    wanted.set('out', { type: S[this.sensorDef.service], name: outName });

    // remove services from old configs (renamed/removed windows, changed sensor type)
    accessory.services
      .filter((svc) => svc.UUID !== S.AccessoryInformation.UUID)
      .filter((svc) => {
        const w = wanted.get(svc.subtype);
        return !w || w.type.UUID !== svc.UUID;
      })
      .forEach((svc) => {
        delete ctx.states[svc.subtype];
        accessory.removeService(svc);
      });

    this.switches = {};
    for (const [sub, w] of wanted) {
      const svc = accessory.getServiceById(w.type, sub) || accessory.addService(w.type, w.name, sub);
      setNames(C, svc, w.name);
      if (sub === 'out') {
        this.sensorChar = svc.getCharacteristic(C[this.sensorDef.char]);
        this.sensorChar.updateValue(this.sensorDef.idle(C));
        continue;
      }
      const ch = svc.getCharacteristic(C.On);
      ch.onGet(() => !!ctx.states[sub]).onSet((v) => this.setInput(sub, !!v));
      ch.updateValue(!!ctx.states[sub]);
      this.switches[sub] = ch;
    }
    for (const k of Object.keys(ctx.states)) if (!wanted.has(k)) delete ctx.states[k];

    this.timer = null;
    this.pulseTimer = null;
    if (!remember) delete ctx.endAt;
    this.evaluate(true);
  }

  armed() {
    const st = this.accessory.context.states;
    return !!st.cond && Object.keys(st).some((k) => k.startsWith('in:') && st[k]);
  }

  setInput(sub, value) {
    const st = this.accessory.context.states;
    if (!!st[sub] === value) return;
    st[sub] = value;
    this.evaluate(false);
  }

  evaluate(restoring) {
    const ctx = this.accessory.context;
    if (!this.armed()) {
      if (this.timer || ctx.endAt) this.log.info(`${this.name}: countdown cancelled`);
      clearTimeout(this.timer);
      this.timer = null;
      delete ctx.endAt;
      ctx.fired = false;
      return;
    }
    if (this.timer || ctx.fired) return; // already counting, or already fired this cycle
    const now = Date.now();
    if (!(restoring && ctx.endAt)) ctx.endAt = now + this.delayMs;
    const remaining = Math.max(1000, ctx.endAt - now);
    this.log.info(`${this.name}: countdown started (${Math.round(remaining / 1000)}s)${restoring ? ' [restored]' : ''}`);
    this.timer = setTimeout(() => this.fire(), remaining);
  }

  fire() {
    this.timer = null;
    const ctx = this.accessory.context;
    delete ctx.endAt;
    if (!this.armed()) return;
    ctx.fired = true; // fire once per cycle; re-arms after cancel (AC off / all closed)
    this.log.info(`${this.name}: time is up -> sensor triggered`);
    clearTimeout(this.pulseTimer);
    this.sensorChar.updateValue(this.sensorDef.active(this.C));
    this.pulseTimer = setTimeout(() => this.sensorChar.updateValue(this.sensorDef.idle(this.C)), this.pulseMs);
  }

  stop() {
    clearTimeout(this.timer);
    clearTimeout(this.pulseTimer);
    this.timer = this.pulseTimer = null;
  }
}

function setNames(C, service, name) {
  service.setCharacteristic(C.Name, name);
  if (C.ConfiguredName && !service.testCharacteristic(C.ConfiguredName)) {
    service.addOptionalCharacteristic(C.ConfiguredName);
    service.setCharacteristic(C.ConfiguredName, name);
  }
}

module.exports.Loop = Loop;
module.exports.Guard = Guard;
module.exports.LoopSensorPlatform = LoopSensorPlatform;
