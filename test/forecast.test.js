// -----------------------------------------------------------------------------
// Vigicrues forecasts: the parsing of previsions.json (recorded answer of
// Montjean-sur-Loire), what is published of it (peak and +24 h in three
// scenarios, peak time, production date), the features a station gains, the
// pace of the requests and the widget line.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from '../src/config.js';
import { WIDGET_KEY } from '../src/monitor.js';
import { Vigicrues, parseForecast, summarizeForecast } from '../src/vigicrues.js';
import { forecastValue } from '../src/widgets.js';
import {
  CHARLEVILLE,
  CHOOZ,
  START,
  STENAY,
  captureLogs,
  create,
  createApi,
  createWorld,
  cycle,
  discovered,
  featureId,
  fixture,
  forecastAnswer,
} from './helpers/world.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const MONTJEAN = 'M530001010';

// A flood coming at Chooz: issued an hour ago, hourly from START + 1 h for
// 48 hours, the central height rising 5 cm an hour to 2.90 m, the 80 % range
// widening with the lead time. The flow is forecast too (in m³/s).
const choozHeight = () =>
  forecastAnswer(CHOOZ, {
    issuedAt: START - HOUR,
    start: START + HOUR,
    hours: 48,
    value: (i) => 0.5 + 0.05 * i,
    spread: (i) => 0.1 + 0.005 * i,
  });
const choozFlow = () =>
  forecastAnswer(CHOOZ, {
    series: 'Q',
    issuedAt: START - HOUR,
    start: START + HOUR,
    hours: 48,
    value: (i) => 100 + 10 * i,
    spread: 20,
  });

function apiWithForecasts() {
  const api = createApi();
  api.forecasts[`${CHOOZ}:H`] = choozHeight();
  api.forecasts[`${CHOOZ}:Q`] = choozFlow();
  // Stenay forecasts its height only: GrdSerie=Q sends the height again.
  api.forecasts[STENAY] = forecastAnswer(STENAY, {
    issuedAt: START - HOUR,
    start: START + HOUR,
    hours: 24,
    value: () => 1.2,
    spread: 0.05,
  });
  return api;
}

async function worldWith(t, codes, { api = apiWithForecasts(), config = {}, ...options } = {}) {
  const world = await createWorld({
    config: { stations: codes.join(','), ...config },
    api,
    ...options,
  });
  t.after(() => world.app.stop());
  const devices = {};
  for (const code of codes) {
    devices[code] = await create(world, code);
  }
  return { world, devices };
}

const keysOf = (device) => device.features.map((feature) => feature.external_id.split(':').pop());
const last = (world, device, key) => world.fake.lastState(featureId(device, key));
const forecastRequests = (world, code) =>
  world.api.requests.filter(
    (url) =>
      url.pathname.endsWith('/previsions.json/index.php') &&
      url.searchParams.get('CdStationHydro') === code,
  );

const HEIGHT_KEYS = [
  'forecast_height_peak',
  'forecast_height_peak_low',
  'forecast_height_peak_high',
  'forecast_height_24h',
  'forecast_height_24h_low',
  'forecast_height_24h_high',
  'forecast_height_peak_time',
];
const FLOW_KEYS = [
  'forecast_flow_peak',
  'forecast_flow_peak_low',
  'forecast_flow_peak_high',
  'forecast_flow_24h',
  'forecast_flow_24h_low',
  'forecast_flow_24h_high',
];

// --- previsions.json -------------------------------------------------------------

test('the recorded forecast of Montjean-sur-Loire: 64 hourly points, low, central, high', () => {
  const forecast = parseForecast(fixture('vigicrues/previsions-M530001010.partial.json'));
  assert.equal(forecast.series, 'H');
  assert.equal(forecast.issuedAt, 1791976378000);
  assert.equal(forecast.points.length, 64);
  assert.deepEqual(forecast.points[0], { t: 1792008000000, low: -1.72, mid: -1.69, high: -1.65 });
  assert.deepEqual(forecast.points.at(-1), {
    t: Date.parse('2026-10-17T11:00:00Z'),
    low: -1.8,
    mid: -1.68,
    high: -1.56,
  });
});

test('no forecast: the error envelope, "no content", no point, an unknown series', () => {
  const body = fixture('vigicrues/previsions-M530001010.partial.json');
  assert.equal(
    parseForecast({ error_msg: "Cette station n'est pas une station de prévisions", code: 400 }),
    null,
  );
  assert.equal(parseForecast({ message: 'Aucune donnée', code: 204 }), null);
  assert.equal(parseForecast({ ...body, Simul: { ...body.Simul, Prevs: [] } }), null);
  assert.equal(parseForecast({ ...body, Simul: { ...body.Simul, GrdSimul: 'X' } }), null);
  assert.throws(() => parseForecast('<html>'), /unexpected answer/);
});

test('the request goes to previsions.json/index.php (the folder URL redirects in HTML)', async () => {
  const urls = [];
  const vigicrues = new Vigicrues({
    fetch: async (url) => {
      urls.push(url);
      return {
        status: 200,
        text: async () => JSON.stringify(fixture('vigicrues/previsions-M530001010.partial.json')),
      };
    },
  });
  assert.equal((await vigicrues.forecast(MONTJEAN, 'Q')).series, 'H');
  assert.deepEqual(urls, [
    'https://www.vigicrues.gouv.fr/services/previsions.json/index.php?CdStationHydro=M530001010&GrdSerie=Q&FormatSortie=json',
  ]);
});

test('the summary: highest value of each scenario ahead, the central peak time, +24 h', () => {
  const forecast = parseForecast(fixture('vigicrues/previsions-M530001010.partial.json'));
  const issued = forecast.issuedAt;
  const summary = summarizeForecast(forecast, issued);
  assert.equal(summary.peak.mid, -1.68);
  assert.equal(summary.peak.high, -1.56);
  // The low bound is highest at the first point.
  assert.equal(summary.peak.low, -1.72);
  // 14/10 13:12 + 24 h: the point of 15/10 13:00 (Paris).
  assert.equal(summary.in24h.t, Date.parse('2026-10-15T11:00:00Z'));
  // Near the end of the horizon, +24 h is beyond it.
  assert.equal(summarizeForecast(forecast, Date.parse('2026-10-17T00:00:00Z')).in24h, null);
  assert.equal(summarizeForecast(forecast, Date.parse('2026-10-17T11:00:01Z')), null);
  assert.equal(summarizeForecast(null, issued), null);
});

// --- Devices and states ------------------------------------------------------------

test('a station with a forecast gains its features and publishes the peak and +24 h', async (t) => {
  const { world, devices } = await worldWith(t, [CHOOZ]);
  const chooz = devices[CHOOZ];
  assert.deepEqual(keysOf(chooz), [
    'height',
    'flow',
    'vigilance',
    'vigilance_color',
    'last_reading',
    ...HEIGHT_KEYS,
    ...FLOW_KEYS,
    'forecast_issued',
  ]);
  const feature = (key) => chooz.features.find((f) => f.external_id.endsWith(`:${key}`));
  assert.equal(feature('forecast_height_peak_high').name, 'Hauteur : pic prévu (haut)');
  assert.equal(feature('forecast_height_peak_high').unit, 'm');
  assert.equal(feature('forecast_flow_24h').unit, 'cubic-meter-per-hour');
  // The peak: 2.90 m on 01/10 at 16:40 (Paris), 2.56 to 3.24 m.
  assert.equal(last(world, chooz, 'forecast_height_peak'), 2.9);
  assert.equal(last(world, chooz, 'forecast_height_peak_low'), 2.56);
  assert.equal(last(world, chooz, 'forecast_height_peak_high'), 3.24);
  assert.equal(last(world, chooz, 'forecast_height_peak_time'), '01/10 16:40');
  // +24 h: the point of 30/09 14:40 UTC.
  assert.equal(last(world, chooz, 'forecast_height_24h'), 1.65);
  assert.equal(last(world, chooz, 'forecast_height_24h_low'), 1.435);
  assert.equal(last(world, chooz, 'forecast_height_24h_high'), 1.865);
  // The flow in m³/h, as the readings: 580 m³/s at the peak.
  assert.equal(last(world, chooz, 'forecast_flow_peak'), 580 * 3600);
  assert.equal(last(world, chooz, 'forecast_flow_peak_high'), 600 * 3600);
  assert.equal(last(world, chooz, 'forecast_issued'), '29/09 14:40');
  // Without created_at: the core stores them with saveState, scenes see them.
  const forecastStates = world.fake.states.filter((s) =>
    s.device_feature_external_id.includes(':forecast_'),
  );
  assert.ok(forecastStates.length >= 14);
  assert.ok(forecastStates.every((s) => s.created_at === undefined));
});

test('a station forecasting only its height, and one without forecast', async (t) => {
  const { world, devices } = await worldWith(t, [STENAY, CHARLEVILLE]);
  assert.deepEqual(keysOf(devices[STENAY]), [
    'height',
    'flow',
    'vigilance',
    'vigilance_color',
    'last_reading',
    ...HEIGHT_KEYS,
    'forecast_issued',
  ]);
  assert.deepEqual(keysOf(devices[CHARLEVILLE]), [
    'height',
    'vigilance',
    'vigilance_color',
    'last_reading',
  ]);
  assert.equal(last(world, devices[STENAY], 'forecast_height_peak'), 1.2);
  assert.ok(
    world.fake.states.every(
      (s) =>
        !s.device_feature_external_id.startsWith(devices[CHARLEVILLE].external_id + ':forecast'),
    ),
  );
});

test('forecasts are read every 30 minutes, stations without one every 6 hours', async (t) => {
  const { world } = await worldWith(t, [CHOOZ, STENAY, CHARLEVILLE]);
  // Chooz: height and flow; Stenay: height, then its flow once (it answered H).
  const counts = () => [CHOOZ, STENAY, CHARLEVILLE].map((c) => forecastRequests(world, c).length);
  assert.deepEqual(counts(), [2, 2, 1]);
  await cycle(world, 15);
  assert.deepEqual(counts(), [2, 2, 1], 'not at every cycle');
  await cycle(world, 15);
  assert.deepEqual(counts(), [4, 3, 1], 'Stenay: its flow is not asked again');
  for (let i = 0; i < 11; i += 1) {
    await cycle(world, 30);
  }
  assert.deepEqual(counts(), [26, 15, 2], '6 hours later');
});

test('a new forecast is published once; a forecast past its horizon no longer', async (t) => {
  const { world, devices } = await worldWith(t, [CHOOZ]);
  const chooz = devices[CHOOZ];
  const sent = () =>
    world.fake.states.filter(
      (s) => s.device_feature_external_id === featureId(chooz, 'forecast_height_peak_high'),
    ).length;
  assert.equal(sent(), 1);
  // A higher forecast: a native trigger "above 3.5 m, when crossed" fires.
  world.api.forecasts[`${CHOOZ}:H`] = forecastAnswer(CHOOZ, {
    issuedAt: START + 20 * MINUTE,
    start: START + HOUR,
    hours: 48,
    value: (i) => 0.5 + 0.06 * i,
    spread: (i) => 0.1 + 0.005 * i,
  });
  await cycle(world, 30);
  assert.equal(last(world, chooz, 'forecast_height_peak_high'), 3.72);
  assert.equal(sent(), 2);
  await cycle(world, 30);
  assert.equal(sent(), 2, 'unchanged, not sent again');
  // Past the last point: no value is published as current any more.
  world.clock.advance(50 * HOUR);
  await cycle(world, 30);
  assert.equal(sent(), 2);
  assert.equal(last(world, chooz, 'forecast_issued'), 'Aucune prévision en cours');
});

test('an existing device gains the forecast through "Update" in the Discover tab', async (t) => {
  const api = createApi();
  const { world, devices } = await worldWith(t, [CHOOZ], { api });
  const before = devices[CHOOZ];
  assert.equal(before.features.length, 5);
  // Vigicrues starts forecasting Chooz: seen within 6 hours.
  api.forecasts[`${CHOOZ}:H`] = choozHeight();
  world.clock.advance(5 * HOUR);
  await cycle(world, 60);
  const after = discovered(world, CHOOZ);
  assert.equal(after.features.length, 5 + HEIGHT_KEYS.length + 1);
  // The device of Gladys has no forecast feature yet: nothing is sent for it.
  assert.ok(world.fake.states.every((s) => !s.device_feature_external_id.includes(':forecast_')));
  // The existing features keep their external ids.
  for (const feature of before.features) {
    assert.ok(after.features.some((f) => f.external_id === feature.external_id));
  }
  await world.fake.deviceUpdated(after);
  assert.equal(world.fake.lastState(featureId(after, 'forecast_height_peak_high')), 3.24);
});

test('the forecast flow in m³/s: without unit, the name says it', async (t) => {
  const { world, devices } = await worldWith(t, [CHOOZ], { config: { flow_unit: 'm3s' } });
  const chooz = devices[CHOOZ];
  const peak = chooz.features.find((f) => f.external_id.endsWith(':forecast_flow_peak_low'));
  assert.equal(peak.name, 'Débit : pic prévu (bas, m³/s)');
  assert.equal(peak.unit, undefined);
  assert.equal(last(world, chooz, 'forecast_flow_peak_low'), 560);
});

test('a failing forecast service is logged once, then its return', async (t) => {
  const { world } = await worldWith(t, [CHOOZ]);
  const lines = captureLogs(t, 'info');
  world.api.down.vigicrues = 503;
  await cycle(world, 30);
  await cycle(world, 30);
  world.api.down.vigicrues = false;
  await cycle(world, 30);
  const texts = lines.map((line) => line.text);
  assert.equal(texts.filter((text) => /forecasts unavailable/.test(text)).length, 1);
  assert.equal(texts.filter((text) => /forecasts can be read again/.test(text)).length, 1);
});

// --- Widget ---------------------------------------------------------------------------

test('the detail widget shows the forecast peak, its range and its time', async (t) => {
  const { world, devices } = await worldWith(t, [CHOOZ, CHARLEVILLE]);
  const get = async (device, language) =>
    (
      await world.fake.widgetGet(WIDGET_KEY, {
        settings: { station: device.external_id },
        language,
        units: 'metric',
      })
    ).data.content;
  for (const language of LANGUAGES) {
    const widget = await get(devices[CHOOZ], language);
    assert.deepEqual(validateWidgetContent(widget), [], language);
  }
  const items = (await get(devices[CHOOZ], 'fr')).components.find((c) => c.type === 'status').items;
  assert.deepEqual(items.at(-1), {
    label: 'Pic prévu',
    value: '2,9 m (2,56/3,24) · 01/10 16:40',
    color: 'neutral',
    icon: 'activity',
  });
  const without = (await get(devices[CHARLEVILLE], 'fr')).components.find(
    (c) => c.type === 'status',
  ).items;
  assert.ok(without.every((item) => item.label !== 'Pic prévu'));
});

test('the forecast line fits a status value', () => {
  const peak = { mid: -12.34, low: -12.56, high: -12.12, t: START };
  for (const language of LANGUAGES) {
    assert.ok(forecastValue({ peak }, language).length <= 40, language);
  }
  assert.equal(
    forecastValue({ peak: { ...peak, low: null, high: null } }, 'en'),
    '-12.34 m · 29/09, 15:40',
  );
});
