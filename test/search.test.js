// -----------------------------------------------------------------------------
// The "Find stations" action, on the recorded referential of the Ardennes.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuery } from '../src/search.js';
import { CHARLEVILLE, CHOOZ, captureLogs, createWorld } from './helpers/world.js';

async function search(t, fields, options = {}) {
  const world = await createWorld(options);
  t.after(() => world.app.stop());
  const ack = await world.fake.action('search_stations', fields);
  assert.equal(ack.success, true);
  return { message: ack.data.message, world };
}

test('the query: station codes, URLs, communes, a department and words', () => {
  assert.deepEqual(parseQuery('31 Toulouse'), {
    stations: [],
    communes: [],
    department: '31',
    words: ['Toulouse'],
  });
  assert.deepEqual(parseQuery('https://www.vigicrues.gouv.fr/station/b720000001, 08105 2A'), {
    stations: ['B720000001'],
    communes: ['08105'],
    department: '2A',
    words: [],
  });
  assert.deepEqual(parseQuery(''), { stations: [], communes: [], department: null, words: [] });
});

test('empty: the stations around the house, nearest first, with their river', async (t) => {
  const { message } = await search(t, {});
  const lines = message.fr.split('\n');
  assert.match(lines[0], /^4 station\(s\), les plus proches d'abord/);
  assert.equal(
    lines[1],
    'B540001001 — La Meuse à Charleville-Mézières (La Meuse), 0,7 km, temps réel',
  );
  assert.equal(lines.length, 5);
  assert.match(message.en, /0\.7 km, real-time/);
  assert.match(message.de, /0,7 km, Echtzeit/);
  // The closed stations (Montcy-Notre-Dame, Vrigne-aux-Bois) are not proposed.
  assert.doesNotMatch(message.en, /B560001001|B504000101/);
});

test('a larger radius, and words searched around the house', async (t) => {
  const { message } = await search(t, { radius: '50', query: 'Chooz' });
  assert.match(message.en, /^4 station\(s\)/);
  assert.match(
    message.en,
    /B720000001 — La Meuse à Chooz - Trou du Diable "DREAL" \(La Meuse\), 36\.\d km, real-time/,
  );
});

test('a department and a word, without a located house', async (t) => {
  const { message } = await search(t, { query: '08 sormonne' }, { houses: [] });
  assert.equal(
    message.en.split('\n')[1],
    'B557201001 — La Sormonne à Belval (La Sormonne), real-time',
  );
});

test('a commune code and a station code', async (t) => {
  const commune = await search(t, { query: '08122' });
  assert.match(commune.message.en, /^4 station\(s\)/);
  const station = await search(t, { query: `${CHOOZ}, ${CHARLEVILLE}` });
  assert.match(station.message.fr, /^2 station\(s\)/);
});

test('words alone without a located house ask for the department', async (t) => {
  const { message } = await search(t, { query: 'Toulouse' }, { houses: [] });
  assert.match(message.fr, /Ajoutez le numéro du département/);
  const empty = await search(t, {}, { houses: [] });
  assert.match(empty.message.es, /Su casa no tiene ubicación/);
});

test("nothing found, and Hub'Eau unavailable", async (t) => {
  const none = await search(t, { query: '08 Garonne' });
  assert.match(none.message.en, /No station in service found/);
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.api.down.hubeau = 503;
  const lines = captureLogs(t, 'info');
  const ack = await world.fake.action('search_stations', { query: '08' });
  assert.match(ack.data.message.fr, /Hub'Eau ne répond pas/);
  assert.equal(lines.length, 1);
  assert.match(lines[0].text, /\[WARN\].*Station search failed: hubeau\.eaufrance\.fr: HTTP 503/);
});

test('one info line per search, without the house coordinates', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const lines = captureLogs(t, 'debug');
  await world.fake.action('search_stations', {});
  const info = lines.filter((line) => line.level === 'info');
  assert.deepEqual(
    info.map((line) => line.text.replace(/^\[[^\]]+\] /, '')),
    ['[INFO] [vigicrues-search] Station search: 4 station(s) found'],
  );
  assert.ok(lines.every((line) => !/49\.76|4\.72/.test(line.text)));
});
