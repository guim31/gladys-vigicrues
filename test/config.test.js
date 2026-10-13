import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  departmentOf,
  normalizeConfig,
  parseCommuneCodes,
  parseStationCodes,
  stationCodeOf,
} from '../src/config.js';

test('the defaults: nothing followed, every 15 minutes, flow in m³/h, French names', () => {
  assert.deepEqual(normalizeConfig(), {
    stationCodes: [],
    communeCodes: [],
    invalid: [],
    houseSelector: null,
    homeRadiusKm: 0,
    refreshMinutes: 15,
    flowUnit: 'm3h',
    language: 'fr',
  });
  assert.deepEqual(normalizeConfig(null), normalizeConfig(DEFAULT_CONFIG));
});

test('station codes: plain, lower case, Vigicrues URLs, duplicates and mistakes', () => {
  assert.deepEqual(
    parseStationCodes(
      'O200004001, b540001001; https://www.vigicrues.gouv.fr/station/F700000103 O200004001 Toulouse',
    ),
    { codes: ['O200004001', 'B540001001', 'F700000103'], invalid: ['Toulouse'] },
  );
  assert.equal(stationCodeOf('https://www.vigicrues.gouv.fr/station/B720000001?x=1'), 'B720000001');
  assert.equal(stationCodeOf('12345'), null);
});

test('commune codes: INSEE, Corsica, overseas, and their department', () => {
  assert.deepEqual(parseCommuneCodes('31555 2a004, 97411 31555 Paris'), {
    codes: ['31555', '2A004', '97411'],
    invalid: ['Paris'],
  });
  assert.equal(departmentOf('31555'), '31');
  assert.equal(departmentOf('2A004'), '2A');
  assert.equal(departmentOf('97411'), '974');
});

test('selects outside their options fall back to the defaults', () => {
  const config = normalizeConfig({
    around_home: '7',
    refresh_interval: '1',
    flow_unit: 'l/s',
    language: 'it',
  });
  assert.equal(config.homeRadiusKm, 0);
  assert.equal(config.flowUnit, 'm3h');
  assert.equal(config.refreshMinutes, 15);
  assert.equal(config.language, 'fr');
  const set = normalizeConfig({
    around_home: '20',
    refresh_interval: '30',
    flow_unit: 'm3s',
    language: 'de',
  });
  assert.deepEqual(
    [set.homeRadiusKm, set.refreshMinutes, set.flowUnit, set.language],
    [20, 30, 'm3s', 'de'],
  );
});

test('the house: its selector, empty or missing means the first located house', () => {
  assert.equal(normalizeConfig({ house: ' maison-2 ' }).houseSelector, 'maison-2');
  assert.equal(normalizeConfig({ house: '' }).houseSelector, null);
  assert.equal(normalizeConfig({ house: null }).houseSelector, null);
  assert.equal(normalizeConfig({}).houseSelector, null);
});
