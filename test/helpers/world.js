// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Hub'Eau and Vigicrues
// serving the recorded answers of test/fixtures (filtered the way the real APIs
// filter), a manual clock, a temporary /data, and the integration wired on top
// through registerHandlers. Nothing touches the network.
// -----------------------------------------------------------------------------

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';

process.env.LOG_LEVEL ??= 'silent';
process.env.TZ = 'Europe/Paris';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

// The recorded observations end at 13:30 UTC on 29/09/2026: the clock starts 10 minutes later.
export const START = Date.parse('2026-09-29T13:40:00Z');

// A house in Charleville-Mézières (town centre, public coordinates).
export const HOUSE = {
  id: 'house-1',
  name: 'Maison',
  selector: 'maison',
  latitude: 49.7621,
  longitude: 4.7254,
};

export const CHOOZ = 'B720000001'; // Meuse, height and flow, section LO18
export const CHARLEVILLE = 'B540001001'; // Meuse, height only, section LO17
export const STENAY = 'B315002001'; // Meuse, height and flow, section LO16

/**
 * Fake Hub'Eau and Vigicrues. `api.down.hubeau` / `api.down.vigicrues`:
 * 'network' (connection refused), a status (503) or false.
 */
export function createApi() {
  const stations = fixture('hubeau/stations.json');
  const observations = fixture('hubeau/observations-2026-09-29.json');
  const empty = fixture('hubeau/empty.json');
  const vigilance = fixture('vigicrues/vigilance-2026-10-13.geojson');
  const vigicruesFiles = {
    'station:B540001001': fixture('vigicrues/station-B540001001.json'),
    'station:B720000001': fixture('vigicrues/station-B720000001.json'),
    'station:B315002001': fixture('vigicrues/station-B315002001.json'),
    'territory:2': fixture('vigicrues/territory-2.json'),
    'section:LO18': fixture('vigicrues/section-LO18.json'),
    'section:LO17': fixture('vigicrues/section-LO17.synthetic.json'),
    'section:LO16': fixture('vigicrues/section-LO16.synthetic.json'),
  };
  // The LO18 envelope, without stations, for the other sections of territory 2.
  const emptySection = (code) => {
    const body = structuredClone(vigicruesFiles['section:LO18']);
    body.ListEntVigiCru[0].CdEntVigiCru = code;
    body.ListEntVigiCru[0].aNMoinsUn = [];
    return body;
  };
  // Error envelope of the Vigicrues services (HTTP 200).
  const refused = { error_msg: "Cette station n'est pas une station de prévisions", code: 400 };

  const api = {
    rows: [...observations.data],
    vigilance,
    down: { hubeau: false, vigicrues: false },
    requests: [],
    // previsions.json answers by station code; a station without forecasts
    // gets the error envelope. The answer does not depend on GrdSerie: a
    // station that only forecasts its height sends it for GrdSerie=Q too.
    forecasts: {},

    /** Add observation rows, in Hub'Eau units (mm, l/s). */
    addReading(code, time, height, flow) {
      const date = new Date(time).toISOString().replace(/\.\d{3}Z$/, 'Z');
      api.rows.push({
        code_station: code,
        grandeur_hydro: 'H',
        date_obs: date,
        resultat_obs: height,
      });
      if (flow !== undefined) {
        api.rows.push({
          code_station: code,
          grandeur_hydro: 'Q',
          date_obs: date,
          resultat_obs: flow,
        });
      }
    },

    /** Set the vigilance level (1 to 4) of a section. */
    setLevel(section, level) {
      for (const feature of api.vigilance.features) {
        if (feature.properties.CdEntCru === section) {
          feature.properties.NivInfViCr = level;
        }
      }
    },

    hubeau(url) {
      const params = url.searchParams;
      if (url.pathname.endsWith('/referentiel/stations')) {
        let data = stations.data;
        if (params.has('code_station')) {
          data = data.filter((s) => s.code_station === params.get('code_station'));
        }
        if (params.has('code_departement')) {
          data = data.filter((s) => s.code_departement === params.get('code_departement'));
        }
        if (params.has('bbox')) {
          const [minLon, minLat, maxLon, maxLat] = params.get('bbox').split(',').map(Number);
          data = data.filter(
            (s) =>
              s.longitude_station >= minLon &&
              s.longitude_station <= maxLon &&
              s.latitude_station >= minLat &&
              s.latitude_station <= maxLat,
          );
        }
        if (params.get('en_service') === 'true') {
          data = data.filter((s) => s.en_service);
        }
        return data.length === 0 ? { ...empty } : { ...stations, count: data.length, data };
      }
      if (url.pathname.endsWith('/observations_tr')) {
        const codes = params.get('code_entite').split(',');
        const since = params.has('date_debut_obs') ? Date.parse(params.get('date_debut_obs')) : 0;
        const size = Number(params.get('size') ?? 1000);
        const data = api.rows
          // A station code never brings the site-level rows (code_station null).
          .filter((row) => codes.includes(row.code_station) && Date.parse(row.date_obs) >= since)
          .sort((a, b) => Date.parse(b.date_obs) - Date.parse(a.date_obs))
          .slice(0, size);
        return { ...observations, count: data.length, data };
      }
      return null;
    },

    vigicrues(url) {
      const params = url.searchParams;
      if (url.pathname.endsWith('/InfoVigiCru.geojson')) {
        return api.vigilance;
      }
      if (url.pathname.includes('/previsions.json/index.php')) {
        const code = params.get('CdStationHydro');
        const series = params.get('GrdSerie') ?? 'H';
        return api.forecasts[`${code}:${series}`] ?? api.forecasts[code] ?? refused;
      }
      if (url.pathname.includes('/station.json')) {
        return vigicruesFiles[`station:${params.get('CdStationHydro')}`] ?? refused;
      }
      if (url.pathname.endsWith('/TerEntVigiCru.json')) {
        return vigicruesFiles[`territory:${params.get('CdEntVigiCru')}`] ?? refused;
      }
      if (url.pathname.endsWith('/TronEntVigiCru.json')) {
        const code = params.get('CdEntVigiCru');
        return vigicruesFiles[`section:${code}`] ?? emptySection(code);
      }
      return null;
    },

    async fetch(input) {
      const url = new URL(input);
      api.requests.push(url);
      const service = url.host === 'hubeau.eaufrance.fr' ? 'hubeau' : 'vigicrues';
      const down = api.down[service];
      if (down === 'network') {
        throw new TypeError('fetch failed');
      }
      if (down) {
        return { status: down, text: async () => 'Service Unavailable' };
      }
      const body = service === 'hubeau' ? api.hubeau(url) : api.vigicrues(url);
      if (body === null) {
        return { status: 404, text: async () => 'Not Found' };
      }
      // Hub'Eau answers 206 when a page has a next one; these never have one.
      return { status: 200, text: async () => JSON.stringify(body) };
    },
  };
  return api;
}

/**
 * A previsions.json answer, in the envelope of the recorded Montjean-sur-Loire
 * one: hourly points from `start` to `start` + `hours`, `value(i)` the central
 * one, the 80 % range `spread` (or `spread(i)`) on each side.
 */
export function forecastAnswer(code, { series = 'H', issuedAt, start, hours = 63, value, spread }) {
  const body = fixture('vigicrues/previsions-M530001010.partial.json');
  const width = typeof spread === 'function' ? spread : () => spread;
  const round = (number) => Math.round(number * 1000) / 1000;
  Object.assign(body.Simul, {
    CdStationHydro: code,
    GrdSimul: series,
    DtProdSimul: issuedAt,
    Prevs: Array.from({ length: hours + 1 }, (_, i) => ({
      DtPrev: start + i * 3600 * 1000,
      ResMinPrev: round(value(i) - width(i)),
      ResMoyPrev: round(value(i)),
      ResMaxPrev: round(value(i) + width(i)),
    })),
  });
  return body;
}

/** A manual clock; `sleep` moves it forward instead of waiting. */
export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
    async sleep(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {Array} [options.houses] houses of Gladys
 * @param {object} [options.api] from createApi
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers] true: the monitor's own timer runs (mock it)
 */
export async function createWorld({
  config = {},
  devices = [],
  houses = [HOUSE],
  api = createApi(),
  connect = true,
  timers = false,
  clock = createClock(),
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-vigicrues-')),
} = {}) {
  const gladys = createFakeGladys({ config, devices, houses });
  const store = new Store(dataDir);
  const app = registerHandlers(gladys, {
    store,
    fetch: api.fetch,
    timers,
    now: clock.now,
    sleep: clock.sleep,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
    await app.monitor.running;
  }
  return { gladys, fake: gladys.fake, app, monitor: app.monitor, api, clock, store, dataDir };
}

/** The device published for a station code, from the last discovery list. */
export const discovered = (world, code) =>
  world.fake.discoveredDevices.find((device) =>
    device.params.some((p) => p.name === 'STATION_CODE' && p.value === code),
  );

/** Create the device of a station in Gladys, as the user would. */
export async function create(world, code) {
  const device = discovered(world, code);
  if (!device) {
    throw new Error(`${code} is not in the discovered devices`);
  }
  await world.fake.deviceCreated(device);
  return device;
}

/** External id of one feature of a device. */
export const featureId = (device, key) =>
  device.features.find((feature) => feature.external_id.endsWith(`:${key}`))?.external_id;

/** Run one refresh cycle, `minutes` later. */
export async function cycle(world, minutes = 15) {
  world.clock.advance(minutes * 60 * 1000);
  await world.monitor.runCycle();
}

/**
 * Capture the integration's log lines at `level` and above (LOG_LEVEL is read
 * at every call). Returns the lines as `{ level, text }`.
 */
export function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => {
    const text = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
    const match = /^\[[^\]]+\] \[(\w+)\]/.exec(text);
    lines.push({ level: match ? match[1].toLowerCase() : 'raw', text });
  };
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}
