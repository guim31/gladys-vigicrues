// -----------------------------------------------------------------------------
// The monitor against the recorded Hub'Eau and Vigicrues answers: which
// stations are followed, the states they publish (fresh, silent, without
// flow), the refresh without any onPoll, the vigilance triggers, the failures
// of the services and what survives a restart.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_STATIONS } from '../src/config.js';
import { TRIGGERS, trendOf } from '../src/monitor.js';
import { flowIn } from '../src/devices.js';
import {
  CHARLEVILLE,
  CHOOZ,
  HOUSE,
  STENAY,
  create,
  createApi,
  createClock,
  createWorld,
  cycle,
  discovered,
  featureId,
} from './helpers/world.js';

const MINUTE = 60 * 1000;

async function worldWith(t, codes, options = {}) {
  const world = await createWorld({ config: { stations: codes.join(',') }, ...options });
  t.after(() => world.app.stop());
  const devices = {};
  for (const code of codes) {
    devices[code] = await create(world, code);
  }
  return { world, devices };
}

const last = (world, device, key) => world.fake.lastState(featureId(device, key));
const statesOf = (world, device, key) =>
  world.fake.states.filter((state) => state.device_feature_external_id === featureId(device, key));

test('a station is published in metres and m³/h, with its vigilance and last reading', async (t) => {
  const { world, devices } = await worldWith(t, [CHOOZ]);
  const chooz = devices[CHOOZ];
  assert.equal(chooz.name, 'La Meuse à Chooz - Trou du Diable "DREAL"');
  assert.equal(chooz.should_poll, false);
  // Hub'Eau: 486 mm and 17000 l/s at 13:30 UTC.
  assert.equal(last(world, chooz, 'height'), 0.486);
  // 17 m³/s, in the m³/h of Gladys (the default unit).
  assert.equal(last(world, chooz, 'flow'), 61200);
  assert.equal(last(world, chooz, 'last_reading'), '29/09 15:30');
  // Section LO18, green on 13/10/2026: the risk badge "no risk".
  assert.equal(last(world, chooz, 'vigilance'), 0);
  assert.equal(last(world, chooz, 'vigilance_color'), 'Vert');
  assert.deepEqual(
    chooz.params.find((p) => p.name === 'VIGICRUES_SECTION'),
    { name: 'VIGICRUES_SECTION', value: 'LO18' },
  );
});

test('the flow: m³/h with the Gladys unit by default, m³/s without unit on demand', async (t) => {
  const { devices } = await worldWith(t, [CHOOZ]);
  const flow = devices[CHOOZ].features.find((f) => f.external_id.endsWith(':flow'));
  assert.equal(flow.unit, 'cubic-meter-per-hour');
  assert.equal(flow.name, 'Débit');
  assert.deepEqual([flow.min, flow.max], [-180000000, 180000000]);

  const m3s = await worldWith(t, [CHOOZ], { config: { stations: CHOOZ, flow_unit: 'm3s' } });
  const device = m3s.devices[CHOOZ];
  const feature = device.features.find((f) => f.external_id.endsWith(':flow'));
  assert.equal(feature.unit, undefined);
  assert.equal(feature.name, 'Débit (m³/s)');
  assert.deepEqual([feature.min, feature.max], [-50000, 50000]);
  assert.equal(last(m3s.world, device, 'flow'), 17);
});

test("the m³/h conversion keeps every litre per second of Hub'Eau", () => {
  assert.equal(flowIn('m3h', 17), 61200);
  assert.equal(flowIn('m3h', 0.001), 3.6);
  assert.equal(flowIn('m3h', 0.123), 442.8);
  assert.equal(flowIn('m3h', -2.5), -9000);
  assert.equal(flowIn('m3s', 0.123), 0.123);
});

test('a device created in m³/s keeps m³/s until it is updated in the Discover tab', async (t) => {
  const { world, devices } = await worldWith(t, [CHOOZ], {
    config: { stations: CHOOZ, flow_unit: 'm3s' },
  });
  await world.fake.configUpdated({ stations: CHOOZ, flow_unit: 'm3h' });
  await cycle(world, 15);
  // Gladys still holds the feature without unit: the value stays in m³/s.
  assert.equal(last(world, devices[CHOOZ], 'flow'), 17);
  const updated = discovered(world, CHOOZ);
  assert.equal(
    updated.features.find((f) => f.external_id.endsWith(':flow')).unit,
    'cubic-meter-per-hour',
  );
  await world.fake.deviceUpdated(updated);
  assert.equal(last(world, updated, 'flow'), 61200);
});

test('a station without flow has no flow feature and sends none', async (t) => {
  const { world, devices } = await worldWith(t, [CHARLEVILLE]);
  const device = devices[CHARLEVILLE];
  assert.equal(featureId(device, 'flow'), undefined);
  assert.equal(last(world, device, 'height'), 2.59);
  assert.ok(
    world.fake.states.every((state) => !state.device_feature_external_id.endsWith(':flow')),
  );
});

test('the states refresh with the internal timer, without any onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const { world, devices } = await worldWith(t, [CHOOZ], { timers: true });
  const poll = t.mock.method(world.monitor, 'poll');
  const device = devices[CHOOZ];
  world.clock.advance(15 * MINUTE);
  world.api.addReading(CHOOZ, Date.parse('2026-09-29T13:50:00Z'), 512, 18200);
  t.mock.timers.tick(15 * MINUTE);
  await world.monitor.running;
  assert.equal(last(world, device, 'height'), 0.512);
  assert.equal(last(world, device, 'flow'), 65520);
  assert.equal(last(world, device, 'last_reading'), '29/09 15:50');
  assert.equal(poll.mock.callCount(), 0);
});

test('only the changes are published', async (t) => {
  const { world } = await worldWith(t, [CHOOZ]);
  const count = world.fake.states.length;
  await cycle(world, 15);
  await cycle(world, 15);
  assert.equal(world.fake.states.length, count, 'nothing new, nothing sent');
});

test('a silent station is not published again as fresh, and says since when', async (t) => {
  const { world, devices } = await worldWith(t, [CHOOZ]);
  const device = devices[CHOOZ];
  const heights = statesOf(world, device, 'height').length;
  for (let i = 0; i < 16; i += 1) {
    await cycle(world, 15);
  }
  assert.equal(last(world, device, 'last_reading'), 'Pas de nouvelle mesure depuis le 29/09 15:30');
  // 13 hours later: the heartbeat would have sent a fresh height, a silent one is not.
  for (let i = 0; i < 40; i += 1) {
    await cycle(world, 15);
  }
  assert.equal(statesOf(world, device, 'height').length, heights);
  assert.equal(world.monitor.view(CHOOZ).height, null);
  // A new reading: fresh again.
  world.api.addReading(CHOOZ, world.clock.now() - 5 * MINUTE, 700, 25000);
  await cycle(world, 1);
  assert.equal(last(world, device, 'height'), 0.7);
  assert.doesNotMatch(last(world, device, 'last_reading'), /Pas de nouvelle/);
});

test('a stable value is published again every 12 hours (heartbeat)', async (t) => {
  // The SDK dates its memory of the published states with Date.now().
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-09-29T13:40:00Z') });
  const { world, devices } = await worldWith(t, [CHOOZ]);
  const device = devices[CHOOZ];
  const before = statesOf(world, device, 'vigilance').length;
  for (let i = 0; i < 47; i += 1) {
    t.mock.timers.tick(15 * MINUTE);
    await cycle(world, 15);
  }
  assert.equal(statesOf(world, device, 'vigilance').length, before, 'not before 12 hours');
  t.mock.timers.tick(15 * MINUTE);
  await cycle(world, 15);
  assert.equal(statesOf(world, device, 'vigilance').length, before + 1);
});

test('the trend compares the height with the one of about an hour before', () => {
  const at = (minutes, v) => ({ t: Date.parse('2026-09-29T13:30:00Z') - minutes * MINUTE, v });
  assert.equal(trendOf([at(0, 1.2), at(30, 1.15), at(60, 1.1)]), 'rising');
  assert.equal(trendOf([at(0, 1.0), at(60, 1.1)]), 'falling');
  assert.equal(trendOf([at(0, 1.0), at(60, 1.005)]), 'steady');
  assert.equal(trendOf([at(0, 1.0), at(20, 1.1)]), null, 'too short');
  assert.equal(trendOf([at(0, 1.0), at(180, 1.1)]), null, 'too far apart');
  assert.equal(trendOf([]), null);
});

test('the vigilance triggers: raised, then lowered, with the section and the colours', async (t) => {
  const { world, devices } = await worldWith(t, [CHOOZ, CHARLEVILLE]);
  world.api.setLevel('LO18', 3);
  await cycle(world, 30);
  assert.equal(last(world, devices[CHOOZ], 'vigilance'), 2);
  assert.equal(last(world, devices[CHOOZ], 'vigilance_color'), 'Orange');
  assert.equal(last(world, devices[CHARLEVILLE], 'vigilance'), 0, 'another section');
  assert.deepEqual(world.fake.sceneEvents, [
    {
      key: TRIGGERS.RAISED,
      data: {
        station: devices[CHOOZ].external_id,
        station_name: 'La Meuse à Chooz - Trou du Diable "DREAL"',
        river: 'La Meuse',
        section: 'LO18',
        section_name: 'Meuse frontalière - Semoy',
        color: 'orange',
        color_name: 'Orange',
        previous_color: 'green',
        previous_color_name: 'Vert',
      },
    },
  ]);
  world.api.setLevel('LO18', 2);
  await cycle(world, 30);
  world.api.setLevel('LO18', 1);
  await cycle(world, 30);
  assert.deepEqual(
    world.fake.sceneEvents.map((event) => [event.key, event.data.previous_color, event.data.color]),
    [
      [TRIGGERS.RAISED, 'green', 'orange'],
      [TRIGGERS.LOWERED, 'orange', 'yellow'],
      [TRIGGERS.LOWERED, 'yellow', 'green'],
    ],
  );
  assert.equal(last(world, devices[CHOOZ], 'vigilance_color'), 'Vert');
});

test('the vigilance is read every 30 minutes, not at every cycle', async (t) => {
  const { world } = await worldWith(t, [CHOOZ]);
  const reads = () =>
    world.api.requests.filter((url) => url.pathname.endsWith('InfoVigiCru.geojson')).length;
  const before = reads();
  await cycle(world, 15);
  await cycle(world, 15);
  await cycle(world, 15);
  await cycle(world, 15);
  assert.equal(reads() - before, 2);
});

test('no trigger without a created device, nor for the first level ever read', async (t) => {
  const world = await createWorld({ config: { stations: CHOOZ } });
  t.after(() => world.app.stop());
  world.api.setLevel('LO18', 4);
  await cycle(world, 30);
  assert.deepEqual(world.fake.sceneEvents, [], 'device not created');
  await create(world, CHOOZ);
  world.api.setLevel('LO18', 3);
  await cycle(world, 30);
  assert.deepEqual(
    world.fake.sceneEvents.map((event) => event.key),
    [TRIGGERS.LOWERED],
  );
});

test('the vigilance level and the triggers survive a restart', async (t) => {
  const dataDir = mkdtempSync(join(tmpdir(), 'gladys-vigicrues-'));
  const api = createApi();
  const first = await createWorld({ config: { stations: CHOOZ }, api, dataDir });
  const device = await create(first, CHOOZ);
  await first.app.stop();
  const requests = api.requests.length;

  api.setLevel('LO18', 2);
  const clock = createClock(first.clock.now() + 10 * MINUTE);
  const second = await createWorld({
    config: { stations: CHOOZ },
    api,
    dataDir,
    clock,
    devices: [device],
  });
  t.after(() => second.app.stop());
  // Name, flow and section came from /data: only the readings and the vigilance were asked.
  const asked = api.requests.slice(requests).map((url) => url.pathname.split('/').pop());
  assert.deepEqual(asked.sort(), ['InfoVigiCru.geojson', 'observations_tr']);
  assert.deepEqual(
    second.fake.sceneEvents.map((event) => [event.key, event.data.color]),
    [[TRIGGERS.RAISED, 'yellow']],
  );
});

test('an unknown station code is reported, not published, and asked again later', async (t) => {
  const world = await createWorld({ config: { stations: `${CHOOZ}, Z999999999` } });
  t.after(() => world.app.stop());
  assert.equal(world.fake.discoveredDevices.length, 1);
  const status = world.fake.connectionStatus;
  assert.equal(status.connected, true);
  assert.match(status.message.fr, /Code de station inconnu : Z999999999/);
  assert.match(status.message.de, /Unbekannter Stationscode: Z999999999/);
  const asked = () =>
    world.api.requests.filter((url) => url.searchParams.get('code_station') === 'Z999999999')
      .length;
  assert.equal(asked(), 1);
  await cycle(world, 15);
  assert.equal(asked(), 1, 'not at every cycle');
  await cycle(world, 60);
  assert.equal(asked(), 2, 'an hour later');
});

test('what is neither a station code nor an INSEE code is reported', async (t) => {
  const world = await createWorld({ config: { stations: 'Toulouse', communes: '31555, abc' } });
  t.after(() => world.app.stop());
  assert.match(world.fake.connectionStatus.message.en, /Ignored .*: Toulouse, abc/);
});

test("Hub'Eau unavailable: disconnected status, nothing published, back when it answers", async (t) => {
  const { world, devices } = await worldWith(t, [CHOOZ]);
  const count = world.fake.states.length;
  world.api.down.hubeau = 503;
  await cycle(world, 15);
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.fr, /Hub'Eau ne répond pas/);
  world.api.down.hubeau = 'network';
  await cycle(world, 15);
  assert.equal(world.fake.states.length, count);
  world.api.down.hubeau = false;
  world.api.addReading(CHOOZ, world.clock.now() - 5 * MINUTE, 530, 19000);
  await cycle(world, 15);
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(world.fake.connectionStatus.message, undefined);
  assert.equal(last(world, devices[CHOOZ], 'height'), 0.53);
});

test('Vigicrues unavailable: the readings go on, the vigilance stops after a day', async (t) => {
  const { world, devices } = await worldWith(t, [CHOOZ]);
  world.api.down.vigicrues = 503;
  await cycle(world, 30);
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.match(world.fake.connectionStatus.message.en, /Vigicrues does not answer/);
  assert.ok(world.monitor.view(CHOOZ).level !== null, 'the last vigilance is still shown');
  for (let i = 0; i < 48; i += 1) {
    world.api.addReading(CHOOZ, world.clock.now(), 500 + i, 17000);
    await cycle(world, 30);
  }
  assert.equal(last(world, devices[CHOOZ], 'height'), 0.547);
  assert.equal(world.monitor.view(CHOOZ).level, null, 'a vigilance older than a day');
});

test('a Vigicrues section lookup that fails is tried again an hour later', async (t) => {
  const api = createApi();
  api.down.vigicrues = 'network';
  const world = await createWorld({ config: { stations: CHOOZ }, api });
  t.after(() => world.app.stop());
  assert.equal(featureId(discovered(world, CHOOZ), 'vigilance'), undefined);
  api.down.vigicrues = false;
  await cycle(world, 15);
  assert.equal(featureId(discovered(world, CHOOZ), 'vigilance'), undefined, 'not yet');
  await cycle(world, 60);
  assert.ok(featureId(discovered(world, CHOOZ), 'vigilance'), 'found, the device can be updated');
});

test('a flow appearing later adds the flow feature to the device', async (t) => {
  const { world } = await worldWith(t, [CHARLEVILLE]);
  world.api.addReading(CHARLEVILLE, world.clock.now() + 5 * MINUTE, 2600, 45000);
  await cycle(world, 15);
  assert.ok(featureId(discovered(world, CHARLEVILLE), 'flow'));
});

test('communes and "around my house" add their stations', async (t) => {
  const world = await createWorld({ config: { communes: '08409', around_home: '10' } });
  t.after(() => world.app.stop());
  const codes = world.monitor.followed();
  assert.ok(codes.includes('B502001001'), 'Sedan, commune 08409');
  // The 3 nearest stations of the house with a recent reading, Montcy (closed) excluded.
  assert.deepEqual(codes.slice(1), ['B540001001', 'B560010101', 'B532201001']);
  // The house coordinates are not stored in /data.
  await world.store.flush();
  const saved = JSON.stringify(await world.store.load());
  assert.doesNotMatch(saved, /49\.762|4\.725/);
});

test('"around my house" without a located house is reported', async (t) => {
  const world = await createWorld({ config: { around_home: '10' }, houses: [] });
  t.after(() => world.app.stop());
  assert.match(world.fake.connectionStatus.message.fr, /Autour de ma maison/);
});

// A second house, first by name, far from the recorded stations of the Ardennes.
const FLAT = {
  id: 'house-2',
  name: 'Appartement',
  selector: 'appartement',
  latitude: 43.6045,
  longitude: 1.4442,
};
const UNLOCATED = {
  id: 'house-3',
  name: 'Chalet',
  selector: 'chalet',
  latitude: null,
  longitude: null,
};

test('"around my house": the house chosen in the configuration, else the first located one', async (t) => {
  const houses = [UNLOCATED, FLAT, HOUSE];
  const empty = await createWorld({ config: { around_home: '10' }, houses });
  t.after(() => empty.app.stop());
  // Empty: the first house that has a location (Appartement, no station around it).
  assert.deepEqual(empty.monitor.followed(), []);
  assert.equal((await empty.monitor.house()).selector, 'appartement');

  const chosen = await createWorld({ config: { around_home: '10', house: 'maison' }, houses });
  t.after(() => chosen.app.stop());
  assert.deepEqual(chosen.monitor.followed(), ['B540001001', 'B560010101', 'B532201001']);
  // Its selector is stored with the stations, never its coordinates.
  await chosen.store.flush();
  const saved = await chosen.store.load();
  assert.equal(saved.home.house, 'maison');
  assert.doesNotMatch(JSON.stringify(saved), /49\.762|4\.725/);

  // Choosing another house chooses the stations again.
  await chosen.fake.configUpdated({ around_home: '10', house: 'appartement' });
  assert.deepEqual(chosen.monitor.followed(), []);
});

test('"around my house": a chosen house without location is named in the status', async (t) => {
  const world = await createWorld({
    config: { around_home: '10', house: 'chalet' },
    houses: [UNLOCATED, HOUSE],
  });
  t.after(() => world.app.stop());
  // Not replaced by the other house: the user chose this one.
  assert.deepEqual(world.monitor.followed(), []);
  const { message } = world.fake.connectionStatus;
  assert.match(message.fr, /la maison « Chalet » n'a pas de position/);
  assert.match(message.en, /the house "Chalet" has no location/);
  assert.match(message.de, /Das Haus „Chalet“ hat in Gladys keinen Standort/);
  assert.match(message.es, /la casa «Chalet» no tiene ubicación/);
});

test('"around my house": a chosen house deleted since is reported', async (t) => {
  const world = await createWorld({
    config: { around_home: '10', house: 'maison-de-vacances' },
    houses: [HOUSE],
  });
  t.after(() => world.app.stop());
  assert.deepEqual(world.monitor.followed(), []);
  assert.match(
    world.fake.connectionStatus.message.fr,
    /la maison « maison-de-vacances » n'existe plus dans Gladys/,
  );
  assert.doesNotMatch(world.fake.connectionStatus.message.fr, /Aucune station/);
});

test('an empty configuration says what to do', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.deepEqual(world.fake.discoveredDevices, []);
  assert.match(world.fake.connectionStatus.message.en, /No station yet/);
});

test(`the configuration follows ${MAX_STATIONS} stations at most`, async (t) => {
  const world = await createWorld({ config: { communes: '08105', around_home: '20' } });
  t.after(() => world.app.stop());
  const monitor = world.monitor;
  monitor.config.stationCodes = Array.from(
    { length: MAX_STATIONS + 2 },
    (_, i) => `B5${String(i).padStart(8, '0')}`,
  );
  t.mock.method(monitor, 'knownStation', async () => true);
  await monitor.resolve();
  assert.equal(monitor.configured.length, MAX_STATIONS);
  assert.equal(monitor.problems.tooMany, true);
});

test('a created device is followed even once removed from the configuration', async (t) => {
  const { world, devices } = await worldWith(t, [CHOOZ]);
  await world.fake.configUpdated({ stations: STENAY });
  assert.deepEqual(world.monitor.followed().sort(), [CHOOZ, STENAY].sort());
  await world.fake.deviceDeleted(devices[CHOOZ]);
  assert.deepEqual(world.monitor.followed(), [STENAY]);
  assert.deepEqual(
    world.fake.discoveredDevices.map((device) => device.params[0].value),
    [STENAY],
  );
});

test('a created device gets all its states at once, and the widget is refreshed', async (t) => {
  const world = await createWorld({ config: { stations: CHOOZ } });
  t.after(() => world.app.stop());
  const refreshes = world.fake.widgetRefreshes.length;
  // requestWidgetRefresh is rate-limited to one call every 10 s.
  world.clock.advance(11 * 1000);
  const device = await create(world, CHOOZ);
  for (const key of ['height', 'flow', 'vigilance', 'vigilance_color', 'last_reading']) {
    assert.notEqual(last(world, device, key), undefined, key);
  }
  assert.ok(world.fake.widgetRefreshes.length > refreshes);
});

test('a reconnection publishes the devices and every state again', async (t) => {
  const { world } = await worldWith(t, [CHOOZ]);
  const count = world.fake.states.length;
  await world.gladys.disconnect();
  await world.gladys.connect();
  assert.equal(world.fake.states.length, count * 2);
});

test('onPoll, should a Gladys call it: reads again only when the cycle is old', async (t) => {
  const { world, devices } = await worldWith(t, [CHOOZ]);
  const cycles = () =>
    world.api.requests.filter((url) => url.pathname.endsWith('observations_tr')).length;
  const before = cycles();
  assert.deepEqual(await world.fake.poll(devices[CHOOZ]), { success: true });
  assert.equal(cycles(), before, 'the last cycle is recent');
  world.clock.advance(10 * MINUTE);
  await world.fake.poll(devices[CHOOZ]);
  assert.equal(cycles(), before + 1);
});

test('a station silent for a month says so', async (t) => {
  const api = createApi();
  api.rows = api.rows.filter((row) => row.code_station !== CHOOZ);
  const world = await createWorld({ config: { stations: CHOOZ }, api });
  t.after(() => world.app.stop());
  const device = await create(world, CHOOZ);
  assert.equal(last(world, device, 'last_reading'), "Aucune mesure depuis plus d'un mois");
  assert.equal(last(world, device, 'height'), undefined);
  // Asked again every 6 hours at most.
  const latest = () =>
    api.requests.filter(
      (url) => url.pathname.endsWith('observations_tr') && url.searchParams.get('size') === '20',
    ).length;
  const before = latest();
  await cycle(world, 60);
  assert.equal(latest(), before);
  await cycle(world, 6 * 60);
  assert.equal(latest(), before + 1);
});
