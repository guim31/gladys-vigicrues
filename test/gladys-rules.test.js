// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from realistic
// inputs: stations by code (with and without a flow, on a Vigicrues section or
// not), by commune and around the house, from the recorded Hub'Eau and
// Vigicrues answers, in every feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FLOW_UNITS, LANGUAGES } from '../src/config.js';
import { CHARLEVILLE, CHOOZ, STENAY, createWorld } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const CONFIG = {
  stations: `${CHOOZ}, https://www.vigicrues.gouv.fr/station/${CHARLEVILLE}, ${STENAY}`,
  communes: '08409',
  around_home: '20',
};

const cases = LANGUAGES.flatMap((language) =>
  FLOW_UNITS.map((flowUnit) => ({ language, flowUnit })),
);

for (const { language, flowUnit } of cases) {
  test(`every discovered device follows the Gladys rules (${language} names, flow in ${flowUnit})`, async (t) => {
    const world = await createWorld({ config: { ...CONFIG, language, flow_unit: flowUnit } });
    t.after(() => world.app.stop());
    const devices = world.fake.discoveredDevices;
    assert.ok(devices.length >= 6, `${devices.length} devices`);
    // The flow: the m³/h unit of the core, or no unit at all (Gladys has no m³/s).
    const flows = devices.flatMap((device) =>
      device.features.filter((feature) => feature.external_id.endsWith(':flow')),
    );
    assert.ok(flows.length > 0, 'a flow feature');
    for (const flow of flows) {
      assert.equal(flow.unit, flowUnit === 'm3h' ? 'cubic-meter-per-hour' : undefined);
    }
    const featureCounts = new Set(devices.map((device) => device.features.length));
    assert.ok(featureCounts.has(5), 'a station with flow and vigilance');
    assert.ok(featureCounts.has(4), 'a station without flow, with vigilance');
    assert.ok(featureCounts.has(2), 'a station without flow nor section');

    const deviceIds = new Set();
    for (const device of devices) {
      const where = device.name;
      assert.ok(!deviceIds.has(device.external_id), `${where}: duplicate device external_id`);
      deviceIds.add(device.external_id);

      // should_poll: true if and only if poll_frequency is provided, in ms.
      if (device.poll_frequency === undefined) {
        assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
      } else {
        assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
        assert.ok(
          table.poll_frequencies_ms.includes(device.poll_frequency),
          `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
        );
      }

      assert.ok(device.features.length > 0, `${where}: no feature`);
      const externalIds = new Set();
      const names = new Set();
      for (const feature of device.features) {
        const at = `${where} / ${feature.name}`;
        const pair = table.pairs[`${feature.category}/${feature.type}`];
        assert.ok(pair, `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`);
        assert.ok(
          pair.label_en && pair.label_fr && pair.icon,
          `${at}: couple without label or icon`,
        );

        assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
        assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
        assert.ok(
          Number.isFinite(feature.min) && Number.isFinite(feature.max),
          `${at}: finite min/max`,
        );
        assert.ok(feature.min <= feature.max, `${at}: min > max`);
        assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
        assert.equal(
          typeof feature.has_feedback,
          'boolean',
          `${at}: has_feedback must be a boolean`,
        );
        if (feature.unit !== undefined) {
          assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
        }
        if (feature.unit !== undefined && table.units_by_category?.[feature.category]) {
          assert.ok(
            table.units_by_category[feature.category].includes(feature.unit),
            `${at}: ${feature.unit} is not a unit of ${feature.category}`,
          );
        }

        assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
        externalIds.add(feature.external_id);
        assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
        names.add(feature.name);
      }
    }
  });
}
