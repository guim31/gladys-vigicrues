// -----------------------------------------------------------------------------
// What the integration writes to `docker logs`: at info, only the lifecycle (a
// station going silent or coming back, a vigilance change, the start), never
// one line per refresh cycle; a failure that repeats at every cycle is logged
// once, plus one line when it is over. Never the house coordinates: the
// configuration holds no secret, the location of the home is the sensitive data.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHOOZ, HOUSE, captureLogs, create, createWorld, cycle } from './helpers/world.js';

const strip = (line) => line.text.replace(/^\[[^\]]+\] /, '');

async function followed(t, config = {}) {
  const world = await createWorld({ config: { stations: CHOOZ, around_home: '10', ...config } });
  t.after(() => world.app.stop());
  await create(world, CHOOZ);
  return world;
}

test('the start is one info line', async (t) => {
  const lines = captureLogs(t, 'info');
  const world = await createWorld({ config: { stations: CHOOZ } });
  t.after(() => world.app.stop());
  assert.deepEqual(lines.map(strip), [
    '[INFO] [vigicrues] Started: 1 station(s) followed, refreshed every 15 min',
  ]);
});

test('a normal refresh cycle writes nothing at info', async (t) => {
  const world = await followed(t);
  const lines = captureLogs(t, 'info');
  for (let i = 0; i < 6; i += 1) {
    world.api.addReading(CHOOZ, world.clock.now(), 490 + i, 17000);
    await cycle(world, 15);
  }
  assert.deepEqual(lines, []);
});

test('LOG_LEVEL=debug shows the cycles, never the house coordinates', async (t) => {
  const lines = captureLogs(t, 'debug');
  const world = await followed(t);
  await cycle(world, 15);
  await cycle(world, 15);
  assert.equal(
    lines.filter((line) => /Refresh cycle: 4 station/.test(line.text)).length >= 2,
    true,
  );
  const all = lines.map((line) => line.text).join('\n');
  assert.doesNotMatch(all, new RegExp(String(HOUSE.latitude).replace('.', '\\.')));
  assert.doesNotMatch(all, new RegExp(String(HOUSE.longitude).replace('.', '\\.')));
});

test('a station going silent and coming back is one info line each', async (t) => {
  const world = await followed(t, { around_home: '0' });
  const lines = captureLogs(t, 'info');
  for (let i = 0; i < 14; i += 1) {
    await cycle(world, 15);
  }
  world.api.addReading(CHOOZ, world.clock.now(), 500, 17000);
  await cycle(world, 15);
  assert.deepEqual(lines.map(strip), [
    '[INFO] [vigicrues] La Meuse à Chooz - Trou du Diable "DREAL": no new reading for 3 hours',
    '[INFO] [vigicrues] La Meuse à Chooz - Trou du Diable "DREAL": readings are back',
  ]);
});

test('a vigilance change is one info line', async (t) => {
  const world = await followed(t, { around_home: '0' });
  const lines = captureLogs(t, 'info');
  world.api.setLevel('LO18', 2);
  await cycle(world, 30);
  await cycle(world, 30);
  assert.deepEqual(lines.map(strip), [
    '[INFO] [vigicrues] La Meuse à Chooz - Trou du Diable "DREAL": flood vigilance green -> yellow (LO18 Meuse frontalière - Semoy)',
  ]);
});

test("Hub'Eau down at every cycle: one warning, then one line at recovery", async (t) => {
  const world = await followed(t);
  const lines = captureLogs(t, 'info');
  world.api.down.hubeau = 503;
  for (let i = 0; i < 4; i += 1) {
    await cycle(world, 15);
  }
  assert.deepEqual(
    lines.map((line) => [line.level, strip(line).replace(/^\[\w+\] /, '')]),
    [['warn', "[vigicrues] Hub'Eau unreachable: hubeau.eaufrance.fr: HTTP 503"]],
  );
  world.api.down.hubeau = false;
  world.api.addReading(CHOOZ, world.clock.now(), 500, 17000);
  await cycle(world, 15);
  assert.deepEqual(lines.slice(1).map(strip), ["[INFO] [vigicrues] Hub'Eau answers again"]);
});

test('Vigicrues down at every cycle: one warning, then one line at recovery', async (t) => {
  const world = await followed(t, { around_home: '0' });
  const lines = captureLogs(t, 'info');
  world.api.down.vigicrues = 'network';
  for (let i = 0; i < 4; i += 1) {
    await cycle(world, 30);
  }
  assert.equal(lines.length, 1);
  assert.match(
    lines[0].text,
    /\[WARN\].*Vigicrues vigilance unavailable: www\.vigicrues\.gouv\.fr: fetch failed/,
  );
  world.api.down.vigicrues = false;
  await cycle(world, 30);
  assert.match(lines.at(-1).text, /\[INFO\].*Vigicrues answers again/);
});

test('states refused at every cycle: one warning, then one line at recovery', async (t) => {
  const world = await followed(t, { around_home: '0' });
  const lines = captureLogs(t, 'info');
  const publish = t.mock.method(world.gladys, 'publishChangedStates', async () => {
    throw new Error('Gladys unreachable');
  });
  for (let i = 0; i < 3; i += 1) {
    world.api.addReading(CHOOZ, world.clock.now(), 500 + i, 17000);
    await cycle(world, 15);
  }
  assert.ok(publish.mock.callCount() >= 3);
  assert.deepEqual(
    lines.map((line) => [line.level, strip(line).replace(/^\[\w+\] /, '')]),
    [['warn', '[vigicrues] Publishing the states failed: Gladys unreachable']],
  );
  publish.mock.restore();
  await cycle(world, 15);
  assert.match(lines.at(-1).text, /\[INFO\].*Publishing the states works again/);
});

test('an unknown station code is one warning, not one per cycle', async (t) => {
  const lines = captureLogs(t, 'info');
  const world = await createWorld({ config: { stations: 'Z999999999' } });
  t.after(() => world.app.stop());
  for (let i = 0; i < 6; i += 1) {
    await cycle(world, 30);
  }
  assert.equal(
    lines.filter((line) => /Unknown station or commune code: Z999999999/.test(line.text)).length,
    1,
  );
});
