'use strict';
// Standalone test with a minimal fake Homebridge/HAP (no dependencies).
// Run: node test.js
const { test, mock } = require('node:test');
const assert = require('node:assert');
const plugin = require('./index.js');

function fakeApi() {
  class Characteristic {
    constructor(name) { this.name = name; this.value = null; this.getter = null; this.setter = null; }
    onGet(fn) { this.getter = fn; return this; }
    onSet(fn) { this.setter = fn; return this; }
    updateValue(v) { this.value = v; this.history.push(v); return this; }
  }
  const C = {
    Manufacturer: 'Manufacturer', Model: 'Model', SerialNumber: 'SerialNumber', Name: 'Name',
    ConfiguredName: 'ConfiguredName', On: 'On',
    ContactSensorState: Object.assign('ContactSensorState', {}),
    MotionDetected: 'MotionDetected',
    OccupancyDetected: 'OccupancyDetected', LeakDetected: 'LeakDetected',
  };
  // enum values
  C.ContactSensorState = new String('ContactSensorState');
  C.ContactSensorState.CONTACT_DETECTED = 0; C.ContactSensorState.CONTACT_NOT_DETECTED = 1;
  C.OccupancyDetected = new String('OccupancyDetected');
  C.OccupancyDetected.OCCUPANCY_NOT_DETECTED = 0; C.OccupancyDetected.OCCUPANCY_DETECTED = 1;
  C.LeakDetected = new String('LeakDetected');
  C.LeakDetected.LEAK_NOT_DETECTED = 0; C.LeakDetected.LEAK_DETECTED = 1;

  class Service {
    constructor(type, name, subtype) { this.UUID = type.UUID; this.type = type; this.subtype = subtype; this.chars = {}; }
    getCharacteristic(c) {
      const k = String(c);
      if (!this.chars[k]) { this.chars[k] = new Characteristic(k); this.chars[k].history = []; }
      return this.chars[k];
    }
    setCharacteristic(c, v) { this.getCharacteristic(c).updateValue(v); return this; }
    testCharacteristic(c) { return !!this.chars[String(c)]; }
    addOptionalCharacteristic() {}
    setPrimaryService() {}
  }
  const S = {};
  for (const n of ['AccessoryInformation', 'Switch', 'Outlet', 'Lightbulb', 'ContactSensor', 'MotionSensor', 'OccupancySensor', 'LeakSensor']) {
    S[n] = { UUID: n };
  }
  class PlatformAccessory {
    constructor(name, uuid) {
      this.displayName = name; this.UUID = uuid; this.context = {};
      this.services = [new Service(S.AccessoryInformation)];
    }
    getService(t) { return this.services.find((s) => s.UUID === t.UUID); }
    getServiceById(t, sub) { return this.services.find((s) => s.UUID === t.UUID && s.subtype === sub); }
    addService(t, name, sub) { const s = new Service(t, name, sub); this.services.push(s); return s; }
    removeService(s) { this.services = this.services.filter((x) => x !== s); }
  }
  const handlers = {};
  const api = {
    hap: { Service: S, Characteristic: C, uuid: { generate: (s) => 'uuid-' + s } },
    platformAccessory: PlatformAccessory,
    registered: [], unregistered: [],
    registerPlatform(p, n, cls) { this.cls = cls; },
    registerPlatformAccessories(p, n, a) { this.registered.push(...a); },
    updatePlatformAccessories() {},
    unregisterPlatformAccessories(p, n, a) { this.unregistered.push(...a); },
    on(ev, fn) { handlers[ev] = fn; },
    emit(ev) { handlers[ev](); },
  };
  return api;
}

const log = Object.assign(() => {}, { info() {}, warn() {}, error() {}, debug() {} });

function boot(config, cached = []) {
  const api = fakeApi();
  plugin(api);
  const platform = new api.cls(log, config, api);
  cached.forEach((a) => platform.configureAccessory(a));
  api.emit('didFinishLaunching');
  return { api, platform };
}

test('loop pulses only while switch is on', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const { platform } = boot({ loops: [{ name: 'AC', interval: 2, intervalUnit: 'minutes', pulseSeconds: 2 }] });
  const loop = platform.loops[0];
  const sensor = loop.sensorChar;
  const on = loop.onChar;

  assert.strictEqual(sensor.value, 0, 'sensor idle at boot');
  assert.strictEqual(on.getter(), false);

  on.setter(true);
  assert.strictEqual(sensor.value, 1, 'pulse on start');
  mock.timers.tick(2000);
  assert.strictEqual(sensor.value, 0, 'back to idle after 2s');

  mock.timers.tick(118000);
  assert.strictEqual(sensor.value, 1, 'pulse at 2 minutes');
  mock.timers.tick(2000);
  assert.strictEqual(sensor.value, 0);

  const before = sensor.history.length;
  on.setter(false);
  for (let i = 0; i < 600; i++) mock.timers.tick(1000);
  assert.strictEqual(sensor.value, 0, 'idle while off');
  assert.ok(sensor.history.length - before <= 1, 'no pulses while off');
  assert.strictEqual(loop.cycleTimer, null);
  mock.timers.reset();
});

test('stopping mid-pulse resets sensor and restarting works', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const { platform } = boot({ loops: [{ name: 'AC', interval: 30, intervalUnit: 'seconds' }] });
  const loop = platform.loops[0];
  loop.onChar.setter(true);
  assert.strictEqual(loop.sensorChar.value, 1);
  loop.onChar.setter(false);
  assert.strictEqual(loop.sensorChar.value, 0);
  loop.onChar.setter(true);
  loop.onChar.setter(true); // double-on should not create a second timer chain
  let pulses = 0;
  const orig = loop.pulse.bind(loop);
  loop.pulse = () => { pulses++; orig(); };
  for (let i = 0; i < 90; i++) mock.timers.tick(1000);
  assert.strictEqual(pulses, 3, 'exactly 3 pulses in 90s at 30s interval');
  mock.timers.reset();
});

test('min interval clamp, other sensor types, auto-off, remember state', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const { platform, api } = boot({ loops: [
    { name: 'Fast', interval: 1, intervalUnit: 'seconds', sensorType: 'motion', switchType: 'outlet' },
    { name: 'Auto', interval: 1, intervalUnit: 'minutes', sensorType: 'leak', autoOffMinutes: 5 },
  ] });
  const [fast, auto] = platform.loops;
  assert.strictEqual(fast.intervalMs, 10000, 'clamped to 10s');
  assert.ok(fast.accessory.getServiceById({ UUID: 'Outlet' }, 'switch'));
  fast.onChar.setter(true);
  assert.strictEqual(fast.sensorChar.value, true);

  auto.onChar.setter(true);
  for (let i = 0; i <= 300; i++) mock.timers.tick(1000);
  assert.strictEqual(auto.running, false, 'auto-off stopped loop');
  assert.strictEqual(auto.onChar.value, false);

  // simulate Homebridge restart: fast was on and should be restored
  platform.loops.forEach((l) => l.stop(false)); // shutdown
  const cached = api.registered;
  const again = boot({ loops: [
    { name: 'Fast', interval: 1, intervalUnit: 'seconds', sensorType: 'contact', switchType: 'outlet' },
  ] }, cached);
  const restored = again.platform.loops[0];
  assert.strictEqual(restored.running, true, 'restored after restart');
  assert.ok(!restored.accessory.services.some((s) => s.UUID === 'MotionSensor'), 'old sensor service removed');
  assert.strictEqual(again.api.unregistered.length, 1, 'removed loop "Auto" unregistered');
  restored.stop();
  mock.timers.reset();
});

test('startMode afterInterval waits a full interval before first pulse', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  const { platform } = boot({ loops: [
    { name: 'Late', interval: 2, intervalUnit: 'minutes', startMode: 'afterInterval' },
    { name: 'Now', interval: 2, intervalUnit: 'minutes', startMode: 'immediate' },
  ] });
  const [late, now] = platform.loops;
  late.onChar.setter(true);
  now.onChar.setter(true);
  assert.strictEqual(late.sensorChar.value, 0, 'afterInterval: sensor stays off at start');
  assert.strictEqual(now.sensorChar.value, 1, 'immediate: sensor pulses at start');
  for (let i = 0; i < 119; i++) mock.timers.tick(1000);
  assert.strictEqual(late.sensorChar.value, 0, 'still off at 1:59');
  mock.timers.tick(1000);
  assert.strictEqual(late.sensorChar.value, 1, 'first pulse at 2:00');
  late.stop(); now.stop();
  mock.timers.reset();
});
