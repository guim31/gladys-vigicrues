// -----------------------------------------------------------------------------
// The `stations` dashboard widget: the content fits the core vocabulary and
// budget (validateWidgetContent, empty array = rendered as sent), every bound
// feature exists on a published device, and the colours follow the vigilance.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGET_COLORS, validateWidgetContent } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from '../src/config.js';
import { WIDGET_KEY } from '../src/monitor.js';
import { stationValue } from '../src/widgets.js';
import { CHARLEVILLE, CHOOZ, STENAY, create, createWorld, cycle } from './helpers/world.js';

async function worldWith(t, codes) {
  const world = await createWorld({ config: { stations: codes.join(',') } });
  t.after(() => world.app.stop());
  const devices = [];
  for (const code of codes) {
    devices.push(await create(world, code));
  }
  return { world, devices };
}

async function content(world, settings = {}, language = 'fr') {
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings, language, units: 'metric' });
  assert.equal(ack.success, true);
  return ack.data.content;
}

const features = (devices) =>
  new Set(devices.flatMap((device) => device.features.map((feature) => feature.external_id)));

test('the overview: one line per station, valid in every language', async (t) => {
  const { world } = await worldWith(t, [CHOOZ, CHARLEVILLE, STENAY]);
  for (const language of LANGUAGES) {
    const widget = await content(world, {}, language);
    assert.deepEqual(validateWidgetContent(widget), [], language);
    const status = widget.components.find((c) => c.type === 'status');
    assert.equal(status.items.length, 3);
  }
  const widget = await content(world);
  const [chooz, charleville] = widget.components.find((c) => c.type === 'status').items;
  assert.deepEqual(chooz, {
    label: 'La Meuse à Chooz - Trou du Diable "DREA…',
    value: '0,49 m, stable',
    color: WIDGET_COLORS.SUCCESS,
    icon: 'minus',
  });
  assert.equal(charleville.value, '2,59 m, stable');
  assert.match(
    widget.components.find((c) => c.type === 'text').text,
    /^Source : © Vigicrues, Hub'Eau · /,
  );
  assert.deepEqual(widget.components.at(-1).link, { url: 'https://www.vigicrues.gouv.fr' });
});

test('a yellow or worse section adds a heading and colours its stations', async (t) => {
  const { world } = await worldWith(t, [CHOOZ, CHARLEVILLE]);
  world.api.setLevel('LO18', 3);
  await cycle(world, 30);
  const widget = await content(world);
  assert.deepEqual(validateWidgetContent(widget), []);
  assert.deepEqual(widget.components[0], {
    type: 'text',
    variant: 'heading',
    text: 'Vigilance crues : Orange',
  });
  const [chooz, charleville] = widget.components.find((c) => c.type === 'status').items;
  assert.equal(chooz.color, WIDGET_COLORS.DANGER);
  assert.equal(charleville.color, WIDGET_COLORS.SUCCESS);
  world.api.setLevel('LO17', 2);
  await cycle(world, 30);
  const after = await content(world, {}, 'en');
  assert.equal(after.components[0].text, 'Flood vigilance: Orange', 'the worst one');
  assert.equal(
    after.components.find((c) => c.type === 'status').items[1].color,
    WIDGET_COLORS.WARNING,
  );
});

test('the trend and a silent station', async (t) => {
  const { world } = await worldWith(t, [CHOOZ]);
  world.api.addReading(CHOOZ, Date.parse('2026-09-29T13:50:00Z'), 640, 21000);
  await cycle(world, 15);
  let [item] = (await content(world, {}, 'de')).components.find((c) => c.type === 'status').items;
  assert.deepEqual([item.value, item.icon], ['0,64 m, steigt', 'trending-up']);
  for (let i = 0; i < 16; i += 1) {
    await cycle(world, 15);
  }
  [item] = (await content(world)).components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    [item.value, item.color, item.icon],
    ['Muette depuis le 29/09 15:50', WIDGET_COLORS.NEUTRAL, 'clock'],
  );
});

test('the detail of one station: live tiles bound to its features, then its status', async (t) => {
  const { world, devices } = await worldWith(t, [CHOOZ, CHARLEVILLE]);
  const widget = await content(world, { station: devices[0].external_id });
  assert.deepEqual(validateWidgetContent(widget), []);
  const tiles = widget.components.filter((c) => c.type === 'value');
  assert.deepEqual(
    tiles.map((tile) => tile.device_feature.split(':').pop()),
    ['height', 'flow'],
  );
  const known = features(devices);
  for (const tile of tiles) {
    assert.ok(known.has(tile.device_feature), `${tile.device_feature} exists`);
  }
  const items = widget.components.find((c) => c.type === 'status').items;
  assert.deepEqual(items[0], {
    label: 'Vigilance',
    value: 'Vert · Meuse frontalière - Semoy',
    color: WIDGET_COLORS.SUCCESS,
  });
  assert.equal(items[2].value, '29/09 15:30');
  assert.deepEqual(widget.components.at(-1).link, {
    url: 'https://www.vigicrues.gouv.fr/station/B720000001',
  });
  // Without flow: one tile.
  const charleville = await content(world, { station: devices[1].external_id });
  assert.equal(charleville.components.filter((c) => c.type === 'value').length, 1);
});

test('empty, and a station no longer followed', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const empty = await content(world, {}, 'es');
  assert.deepEqual(validateWidgetContent(empty), []);
  assert.match(empty.components[0].text, /^Aún no hay estaciones/);
  const gone = await content(world, { station: 'ext:test-integration:station:B720000001' }, 'en');
  assert.equal(gone.components[0].text, 'This station is no longer followed.');
});

test('a status value never exceeds 40 characters', () => {
  const view = {
    lastReadingAt: Date.parse('2026-09-29T13:30:00Z'),
    fresh: false,
    height: null,
    trend: null,
  };
  for (const language of LANGUAGES) {
    assert.ok(stationValue(view, language).length <= 40, language);
  }
  assert.equal(stationValue({ ...view, lastReadingAt: null }, 'fr'), 'En attente');
});
