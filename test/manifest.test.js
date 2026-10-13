// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_CONFIG,
  FLOW_UNITS,
  HOME_RADII,
  LANGUAGES,
  REFRESH_INTERVALS,
} from '../src/config.js';
import { FLOW_FORMATS } from '../src/devices.js';
import { VIGILANCE_LEVELS } from '../src/messages.js';
import { TRIGGERS, WIDGET_KEY } from '../src/monitor.js';
import { SEARCH_RADII } from '../src/search.js';
import { WIDGETS } from '../src/widgets.js';
import { CHOOZ, create, createWorld, cycle } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// The handlers the integration actually registers on the SDK.
const { gladys: registered, app } = await createWorld({ connect: false });
await app.stop();
const handlerKeys = (prefix) =>
  Object.keys(registered.handlers)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const optionValues = (field) => field.options.map((option) => option.value);
const field = (list, key) => list.find((entry) => entry.key === key);

function minGladysVersion() {
  const match = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, 'gladys_version must declare a minimum version');
  return match.slice(1).map(Number);
}

test('identity: name, image, cover, cloud transport, environment category', () => {
  assert.equal(manifest.name, 'Vigicrues');
  assert.equal(manifest.type, 'device');
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-vigicrues:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-vigicrues/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.deepEqual(manifest.categories, ['environment']);
});

test('"around my house" reads the house location: the manifest declares it', () => {
  assert.equal(manifest.location, true);
});

test('Gladys 5.2.0 at least: widgets, scene triggers and the houses source', () => {
  // `source: "houses"` is only accepted from 5.2.0 (store schema, enforced by the indexer).
  const [major, minor] = minGladysVersion();
  assert.ok(major > 5 || (major === 5 && minor >= 2), manifest.gladys_version);
});

test('every manifest action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions).sort(), handlerKeys('action:').sort());
});

test('no scene action: the states and the triggers cover the use', () => {
  assert.equal(manifest.scene_actions, undefined);
  assert.deepEqual(handlerKeys('sceneAction:'), []);
});

test('the scene triggers the monitor fires are declared, with their filters and variables', async (t) => {
  assert.deepEqual(keysOf(manifest.scene_triggers), [TRIGGERS.RAISED, TRIGGERS.LOWERED]);
  const world = await createWorld({ config: { stations: CHOOZ } });
  t.after(() => world.app.stop());
  const device = await create(world, CHOOZ);
  world.api.setLevel('LO18', 3);
  await cycle(world, 30);
  world.api.setLevel('LO18', 1);
  await cycle(world, 30);
  assert.equal(world.fake.sceneEvents.length, 2);
  for (const event of world.fake.sceneEvents) {
    const trigger = field(manifest.scene_triggers, event.key);
    for (const key of [...keysOf(trigger.fields), ...keysOf(trigger.variables)]) {
      assert.ok(key in event.data, `${event.key}: "${key}" is in the event data`);
    }
    assert.deepEqual(
      Object.keys(event.data).sort(),
      [...new Set([...keysOf(trigger.fields), ...keysOf(trigger.variables)])].sort(),
      `${event.key}: no undeclared key`,
    );
    assert.equal(event.data.station, device.external_id, 'the station filter is the device');
    assert.ok(optionValues(field(trigger.fields, 'color')).includes(event.data.color));
  }
  const colors = Object.values(VIGILANCE_LEVELS).map((level) => level.key);
  assert.deepEqual(
    optionValues(field(field(manifest.scene_triggers, TRIGGERS.RAISED).fields, 'color')),
    colors.slice(1),
  );
  assert.deepEqual(
    optionValues(field(field(manifest.scene_triggers, TRIGGERS.LOWERED).fields, 'color')),
    colors.slice(0, 3),
  );
});

test('every widget has its handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets), [WIDGET_KEY]);
  assert.deepEqual(Object.keys(WIDGETS), [WIDGET_KEY]);
  assert.deepEqual(handlerKeys('widget:'), [WIDGET_KEY]);
});

test('config_schema defaults and options are the ones of the code', () => {
  for (const entry of manifest.config_schema) {
    if (entry.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[entry.key], entry.default, entry.key);
    }
  }
  assert.deepEqual(
    Object.keys(DEFAULT_CONFIG).sort(),
    manifest.config_schema
      .filter((entry) => entry.type !== 'section')
      .map((entry) => entry.key)
      .sort(),
  );
  assert.deepEqual(optionValues(field(manifest.config_schema, 'language')), LANGUAGES);
  assert.deepEqual(optionValues(field(manifest.config_schema, 'around_home')), HOME_RADII);
  assert.deepEqual(optionValues(field(manifest.config_schema, 'flow_unit')), FLOW_UNITS);
  assert.deepEqual(Object.keys(FLOW_FORMATS), FLOW_UNITS);
  assert.deepEqual(
    optionValues(field(manifest.config_schema, 'refresh_interval')),
    REFRESH_INTERVALS,
  );
  const searchFields = field(manifest.actions, 'search_stations').fields;
  assert.deepEqual(optionValues(field(searchFields, 'radius')), SEARCH_RADII);
});

test('section fields are purely presentational', () => {
  for (const section of manifest.config_schema.filter((entry) => entry.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('dynamic selects declare their source, no static options and no default', () => {
  const dynamic = allFields.filter((entry) => entry.source !== undefined);
  assert.deepEqual(
    dynamic.map((entry) => entry.source),
    ['houses', 'devices', 'devices', 'devices'],
  );
  for (const entry of dynamic) {
    assert.equal(entry.options, undefined, entry.key);
    assert.equal(entry.default, undefined, entry.key);
  }
});

test('the house is an optional select of the houses of Gladys, next to "around my house"', () => {
  const keys = keysOf(manifest.config_schema);
  const house = field(manifest.config_schema, 'house');
  assert.equal(house.type, 'select');
  assert.equal(house.source, 'houses');
  assert.notEqual(house.required, true);
  assert.equal(keys.indexOf('house') + 1, keys.indexOf('around_home'));
});

test('number fields have integer bounds (the form has no step)', () => {
  for (const entry of allFields.filter((f) => f.type === 'number')) {
    for (const key of ['min', 'max', 'default']) {
      if (entry[key] !== undefined) {
        assert.ok(Number.isInteger(entry[key]), `${entry.key}.${key}`);
      }
    }
  }
});

test('actions: no secret field, no default, no required field (the core applies no default)', () => {
  // GladysAssistant/Gladys#3154 and #3155.
  for (const action of manifest.actions) {
    for (const entry of action.fields ?? []) {
      assert.notEqual(entry.type, 'secret', `${action.key}.${entry.key}`);
      assert.equal(entry.default, undefined, `${action.key}.${entry.key}`);
      assert.notEqual(entry.required, true, `${action.key}.${entry.key}`);
    }
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});
