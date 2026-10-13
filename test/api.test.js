// -----------------------------------------------------------------------------
// The Hub'Eau and Vigicrues clients on the recorded answers (see
// test/fixtures/README.md): units, casing, envelopes, pagination and the
// failures of the services.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxAround, distanceKm } from '../src/geo.js';
import { HttpError, USER_AGENT, getJson } from '../src/http.js';
import { HUBEAU_BASE, HubEau, groupObservations, parseStation } from '../src/hubeau.js';
import {
  Vigicrues,
  parseSectionStations,
  parseStationTerritory,
  parseTerritorySections,
  parseVigilance,
  stationPage,
} from '../src/vigicrues.js';
import { CHARLEVILLE, CHOOZ, HOUSE, fixture } from './helpers/world.js';

const answer = (status, body) => async () => ({
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

test("Hub'Eau observations: millimetres to metres, l/s to m³/s, newest first", () => {
  const { data } = fixture('hubeau/observations-2026-09-29.json');
  const grouped = groupObservations(data, [CHOOZ, CHARLEVILLE, 'B315002001']);
  const chooz = grouped.get(CHOOZ);
  assert.deepEqual(chooz.H[0], { t: Date.parse('2026-09-29T13:30:00Z'), v: 0.486 });
  assert.deepEqual(chooz.Q[0], { t: Date.parse('2026-09-29T13:30:00Z'), v: 17 });
  assert.ok(chooz.H.every((point, i) => i === 0 || point.t < chooz.H[i - 1].t));
  // Charleville has no real-time flow; Stenay sits below its gauge zero.
  assert.deepEqual(grouped.get(CHARLEVILLE).Q, []);
  assert.equal(grouped.get('B315002001').H[0].v, -0.067);
  // The site-level rows (code_station null) are not a station.
  assert.ok(data.some((row) => row.code_station === null));
  assert.ok(![...grouped.keys()].includes(null));
  assert.equal(grouped.size, 3, 'only the requested stations');
});

test("Hub'Eau stations: the referential shape, a closed station flagged", () => {
  const { data } = fixture('hubeau/stations.json');
  const stations = data.map(parseStation);
  assert.deepEqual(
    stations.find((s) => s.code === CHARLEVILLE),
    {
      code: CHARLEVILLE,
      name: 'La Meuse à Charleville-Mézières',
      communeCode: '08105',
      commune: 'CHARLEVILLE-MEZIERES',
      department: '08',
      river: 'La Meuse',
      latitude: 49.75966562,
      longitude: 4.715855889,
      active: true,
    },
  );
  assert.equal(stations.find((s) => s.code === 'B560001001').active, false);
  assert.equal(parseStation({}), null);
});

test("Hub'Eau: an unknown station is null, the query asks only the useful fields", async () => {
  const urls = [];
  const hubeau = new HubEau({
    fetch: async (url) => {
      urls.push(new URL(url));
      return answer(200, fixture('hubeau/empty.json'))();
    },
  });
  assert.equal(await hubeau.station('Z999999999'), null);
  assert.equal(urls[0].searchParams.get('code_station'), 'Z999999999');
  assert.match(urls[0].searchParams.get('fields'), /^code_station,libelle_station,/);
});

test("Hub'Eau: a 206 page is followed through its next link, on Hub'Eau only", async () => {
  const pages = {
    1: {
      next: `${HUBEAU_BASE}/observations_tr?cursor=2`,
      data: [
        {
          code_station: CHOOZ,
          grandeur_hydro: 'H',
          date_obs: '2026-09-29T13:30:00Z',
          resultat_obs: 486,
        },
      ],
    },
    2: {
      next: 'https://example.org/elsewhere',
      data: [
        {
          code_station: CHOOZ,
          grandeur_hydro: 'H',
          date_obs: '2026-09-29T13:25:00Z',
          resultat_obs: 485,
        },
      ],
    },
  };
  const calls = [];
  const hubeau = new HubEau({
    fetch: async (url) => {
      calls.push(url);
      return answer(206, url.includes('cursor=2') ? pages[2] : pages[1])();
    },
  });
  const grouped = await hubeau.observations([CHOOZ], Date.parse('2026-09-29T10:30:00Z'));
  assert.equal(calls.length, 2);
  assert.equal(grouped.get(CHOOZ).H.length, 2);
  const first = new URL(calls[0]);
  assert.equal(first.searchParams.get('date_debut_obs'), '2026-09-29T10:30:00Z');
  assert.equal(first.searchParams.get('grandeur_hydro'), 'H,Q');
});

test('HTTP failures become an HttpError: status, network, timeout, not JSON', async () => {
  await assert.rejects(getJson(answer(503, 'down'), `${HUBEAU_BASE}/x`), {
    name: 'HttpError',
    status: 503,
    message: 'hubeau.eaufrance.fr: HTTP 503',
  });
  await assert.rejects(
    getJson(async () => {
      throw new TypeError('fetch failed');
    }, `${HUBEAU_BASE}/x`),
    { message: 'hubeau.eaufrance.fr: fetch failed', status: null },
  );
  await assert.rejects(
    getJson(async () => {
      throw Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    }, `${HUBEAU_BASE}/x`),
    { message: 'hubeau.eaufrance.fr: no answer in 30 s' },
  );
  await assert.rejects(getJson(answer(200, '<html>'), `${HUBEAU_BASE}/x`), {
    message: 'hubeau.eaufrance.fr: the answer is not JSON',
  });
  await assert.rejects(new HubEau({ fetch: answer(200, { oops: 1 }) }).station(CHOOZ), HttpError);
});

test('every request names the integration and asks for JSON', async () => {
  let headers;
  await getJson(async (url, options) => {
    headers = options.headers;
    return answer(200, {})();
  }, `${HUBEAU_BASE}/x`);
  assert.deepEqual(headers, { Accept: 'application/json', 'User-Agent': USER_AGENT });
});

test('Vigicrues vigilance of 13/10/2026: every section of mainland France, green', () => {
  const vigilance = parseVigilance(fixture('vigicrues/vigilance-2026-10-13.geojson'));
  assert.equal(vigilance.reference, '13102026_16');
  assert.equal(vigilance.issuedAt, Date.parse('2026-10-13T13:56:27Z'));
  assert.equal(vigilance.sections.size, 337);
  assert.deepEqual(vigilance.sections.get('LO18'), {
    code: 'LO18',
    name: 'Meuse frontalière - Semoy',
    level: 1,
  });
});

test('Vigicrues vigilance of 11/12/2023: the older casing, yellow and orange sections', () => {
  const vigilance = parseVigilance(fixture('vigicrues/vigilance-2023-12-11.geojson'));
  assert.deepEqual(vigilance.sections.get('AN12'), {
    code: 'AN12',
    name: 'Isère grenobloise',
    level: 3,
  });
  assert.equal(vigilance.sections.get('AD5').level, 2);
  assert.equal(vigilance.issuedAt, null);
});

test('Vigicrues: the error envelope, an empty vigilance and a level out of range', () => {
  const refused = { error_msg: "Cette station n'est pas une station de prévisions", code: 400 };
  assert.throws(() => parseVigilance(refused), /refused \(code 400\)/);
  assert.throws(() => parseVigilance({ features: [] }), /no section/);
  assert.throws(() => parseVigilance([]), /unexpected answer/);
  const odd = parseVigilance({
    features: [
      { properties: { CdEntCru: 'X1', lbentcru: 'X', NivInfViCr: 7 } },
      { properties: { CdEntCru: 'X2', lbentcru: 'Y', NivInfViCr: 2 } },
      { properties: { CdEntCru: 'X2', lbentcru: 'Y', NivInfViCr: 3 } },
    ],
  });
  assert.deepEqual([...odd.sections.values()], [{ code: 'X2', name: 'Y', level: 3 }]);
  assert.equal(parseStationTerritory(refused), null);
  assert.equal(parseStationTerritory({ message: 'toutes prévisions', code: 204 }), null);
});

test('Vigicrues referential: territory of a station, sections, stations of a section', () => {
  assert.equal(parseStationTerritory(fixture('vigicrues/station-B540001001.json')), '2');
  const sections = parseTerritorySections(fixture('vigicrues/territory-2.json'));
  assert.equal(sections.length, 17);
  assert.ok(sections.includes('LO18'));
  const stations = parseSectionStations(fixture('vigicrues/section-LO18.json'));
  assert.ok(stations.includes(CHOOZ));
  assert.equal(stations.length, 15);
  assert.ok(parseSectionStations(fixture('vigicrues/section-SA16.json')).includes('A302009050'));
});

test('Vigicrues: the requests and the page of a station', async () => {
  const urls = [];
  const vigicrues = new Vigicrues({
    fetch: async (url) => {
      urls.push(url);
      return answer(200, fixture('vigicrues/section-LO18.json'))();
    },
  });
  await vigicrues.stationsOfSection('LO18');
  assert.deepEqual(urls, [
    'https://www.vigicrues.gouv.fr/services/TronEntVigiCru.json?CdEntVigiCru=LO18&TypEntVigiCru=8',
  ]);
  assert.equal(stationPage(CHOOZ), 'https://www.vigicrues.gouv.fr/station/B720000001');
});

test('the box around the house is rounded out to a 0.05° grid, and holds the circle', () => {
  const box = boxAround(HOUSE.latitude, HOUSE.longitude, 10);
  assert.deepEqual(box, [4.55, 49.65, 4.9, 49.9]);
  for (const value of box) {
    assert.ok(Math.abs(value * 20 - Math.round(value * 20)) < 1e-9, `${value} on the grid`);
  }
  // 10 km east and north of the house are inside.
  assert.ok(distanceKm(HOUSE.latitude, HOUSE.longitude, HOUSE.latitude, box[2]) >= 10);
  assert.ok(distanceKm(HOUSE.latitude, HOUSE.longitude, box[3], HOUSE.longitude) >= 10);
  assert.ok(Math.abs(distanceKm(48.8566, 2.3522, 43.6047, 1.4442) - 588) < 2, 'Paris-Toulouse');
});
