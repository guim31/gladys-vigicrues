// -----------------------------------------------------------------------------
// Hub'Eau Hydrométrie v2 (https://hubeau.eaufrance.fr/page/api-hydrometrie):
// the station referential and the real-time observations, keyless, under the
// Licence Ouverte Etalab 2.0.
//
// What the live API does (captures of September and October 2026, see
// test/fixtures/README.md):
//   - heights are in millimetres and flows in litres per second: converted here
//     to metres and cubic metres per second, the units Vigicrues shows;
//   - a page with a next one answers 206, with a `next` URL in the body;
//   - observations are sorted newest first and kept one month;
//   - a site-level flow comes with `code_station: null` next to the station's
//     own: only the rows of the requested stations are kept;
//   - `observations_tr` takes several station codes, comma-separated.
// -----------------------------------------------------------------------------

import { HttpError, getJson } from './http.js';

export const HUBEAU_BASE = 'https://hubeau.eaufrance.fr/api/v2/hydrometrie';

const STATION_FIELDS = [
  'code_station',
  'libelle_station',
  'code_commune_station',
  'libelle_commune',
  'code_departement',
  'libelle_cours_eau',
  'longitude_station',
  'latitude_station',
  'en_service',
].join(',');

const OBSERVATION_FIELDS = 'code_station,grandeur_hydro,date_obs,resultat_obs';

// A follow-up page is fetched only from the same API, a few pages at most.
const MAX_PAGES = 5;

const round = (value, digits = 3) => Number(value.toFixed(digits));
const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/** One station of the referential, in the shape the integration uses. */
export function parseStation(raw) {
  const code = text(raw?.code_station);
  if (!code) {
    return null;
  }
  return {
    code,
    name: text(raw.libelle_station) ?? code,
    communeCode: text(raw.code_commune_station),
    commune: text(raw.libelle_commune),
    department: text(raw.code_departement),
    river: text(raw.libelle_cours_eau),
    latitude: number(raw.latitude_station),
    longitude: number(raw.longitude_station),
    active: raw.en_service !== false,
  };
}

/**
 * Observations grouped by station, newest first, in metres and m³/s:
 * `Map(code => { H: [{ t, v }], Q: [{ t, v }] })` (`t` in ms).
 * @param {Array} rows the `data` of observations_tr
 * @param {string[]} [codes] keep only these stations
 */
export function groupObservations(rows, codes) {
  const wanted = codes ? new Set(codes) : null;
  const byStation = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const code = text(row?.code_station);
    const quantity = row?.grandeur_hydro;
    const value = number(row?.resultat_obs);
    const time = Date.parse(row?.date_obs);
    if (
      !code ||
      (wanted && !wanted.has(code)) ||
      (quantity !== 'H' && quantity !== 'Q') ||
      value === null ||
      Number.isNaN(time)
    ) {
      continue;
    }
    if (!byStation.has(code)) {
      byStation.set(code, { H: [], Q: [] });
    }
    byStation.get(code)[quantity].push({ t: time, v: round(value / 1000) });
  }
  for (const series of byStation.values()) {
    series.H.sort((a, b) => b.t - a.t);
    series.Q.sort((a, b) => b.t - a.t);
  }
  return byStation;
}

export class HubEau {
  /**
   * @param {object} [options]
   * @param {Function} [options.fetch]
   */
  constructor({ fetch: fetchImpl } = {}) {
    this.fetch = fetchImpl ?? globalThis.fetch;
  }

  /** Every row of a paginated query (206 + `next`), a few pages at most. */
  async rows(path, params, maxPages = MAX_PAGES) {
    let url = `${HUBEAU_BASE}/${path}?${new URLSearchParams(params)}`;
    const rows = [];
    for (let page = 0; page < maxPages && url; page += 1) {
      const body = await getJson(this.fetch, url);
      if (!body || typeof body !== 'object' || !Array.isArray(body.data)) {
        throw new HttpError("Hub'Eau: unexpected answer (no data list)");
      }
      rows.push(...body.data);
      url = typeof body.next === 'string' && body.next.startsWith(HUBEAU_BASE) ? body.next : null;
    }
    return rows;
  }

  async stations(params) {
    const rows = await this.rows('referentiel/stations', {
      ...params,
      fields: STATION_FIELDS,
      format: 'json',
      size: '1000',
    });
    return rows.map(parseStation).filter(Boolean);
  }

  /** One station by its code; null when Hub'Eau does not know it. */
  async station(code) {
    const found = await this.stations({ code_station: code });
    return found.find((station) => station.code === code) ?? null;
  }

  /** The stations in service of a department (the filter the API documents). */
  stationsOfDepartment(department) {
    return this.stations({ code_departement: department, en_service: 'true' });
  }

  /** The stations in service in a box `[minLon, minLat, maxLon, maxLat]`. */
  stationsInBox(box) {
    return this.stations({
      bbox: box.map((value) => round(value, 5)).join(','),
      en_service: 'true',
    });
  }

  /**
   * Observations of several stations since a date, grouped by station.
   * @param {string[]} codes
   * @param {number} since ms
   */
  async observations(codes, since) {
    if (codes.length === 0) {
      return new Map();
    }
    const rows = await this.rows('observations_tr', {
      code_entite: codes.join(','),
      grandeur_hydro: 'H,Q',
      date_debut_obs: new Date(since).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      fields: OBSERVATION_FIELDS,
      size: '20000',
    });
    return groupObservations(rows, codes);
  }

  /**
   * The latest observations of one station, whatever their age (Hub'Eau keeps
   * one month): H and Q of the same instant come together, newest first.
   */
  async latest(code) {
    const rows = await this.rows(
      'observations_tr',
      { code_entite: code, fields: OBSERVATION_FIELDS, size: '20' },
      1,
    );
    return groupObservations(rows, [code]).get(code) ?? { H: [], Q: [] };
  }
}
