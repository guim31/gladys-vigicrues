// -----------------------------------------------------------------------------
// Vigicrues services (https://www.vigicrues.gouv.fr/services/v1.1), keyless,
// "© VIGICRUES", Licence Ouverte Etalab 2.0.
//
//   - InfoVigiCru.geojson: the flood vigilance level of every river section
//     ("tronçon") of mainland France, `NivInfViCr` 1 green, 2 yellow, 3 orange,
//     4 red. About 2.2 MB with the geometry, issued at least twice a day: read
//     every 30 minutes, the geometry dropped right after parsing.
//   - station.json: the territory (`PereBoitEntVigiCru`) of a station.
//   - TerEntVigiCru.json: the sections of a territory.
//   - TronEntVigiCru.json: the stations of a section. The upward link of a
//     station (`StaEntVigiCru`) only holds the placeholder "A renseigner": the
//     section of a station is found by reading the sections of its territory.
//
// What the live services do (captures of September and October 2026, see
// test/fixtures/README.md):
//   - an error is an HTTP 200 whose body is `{ "error_msg": …, "code": 400 }`,
//     "nothing" a 200 `{ "message": …, "code": 204 }`;
//   - the vigilance properties changed casing over the years (`lbentcru` today,
//     `LbEntCru` in 2023): both are read.
// -----------------------------------------------------------------------------

import { HttpError, getJson } from './http.js';

export const VIGICRUES_BASE = 'https://www.vigicrues.gouv.fr/services';
export const VIGICRUES_SITE = 'https://www.vigicrues.gouv.fr';

/** The page of a station on vigicrues.gouv.fr. */
export const stationPage = (code) => `${VIGICRUES_SITE}/station/${encodeURIComponent(code)}`;

const SECTION_TYPE = '8';
const LEVELS = [1, 2, 3, 4];

const text = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null);
// "A renseigner obligatoirement": the placeholder of the services for an empty field.
const real = (value) => {
  const found = text(value);
  return found && !/^a renseigner/i.test(found) ? found : null;
};

/** Throws on the error envelope; resolves null on "no content". */
function envelope(body, what) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(`Vigicrues: unexpected answer for ${what}`);
  }
  if (Object.hasOwn(body, 'error_msg')) {
    throw new HttpError(`Vigicrues: ${what} refused (code ${body.code ?? '?'})`);
  }
  if (body.code === 204 && typeof body.message === 'string') {
    return null;
  }
  return body;
}

/**
 * The vigilance of every section.
 * @returns {{ reference: string|null, issuedAt: number|null, sections: Map<string, { code, name, level }> }}
 */
export function parseVigilance(body) {
  const document = envelope(body, 'the vigilance');
  if (!document || !Array.isArray(document.features)) {
    throw new HttpError('Vigicrues: the vigilance has no section');
  }
  const sections = new Map();
  for (const feature of document.features) {
    const p = feature?.properties ?? {};
    const code = text(p.CdEntCru);
    const level = Number(p.NivInfViCr);
    if (!code || !LEVELS.includes(level)) {
      continue;
    }
    const name = text(p.lbentcru) ?? text(p.LbEntCru) ?? code;
    const previous = sections.get(code);
    // A section drawn in several pieces keeps its highest level.
    if (!previous || previous.level < level) {
      sections.set(code, { code, name, level });
    }
  }
  if (sections.size === 0) {
    throw new HttpError('Vigicrues: the vigilance has no section');
  }
  const issued = Date.parse(document.DtHrInfoVigiCru);
  return {
    reference: text(document.RefInfoVigiCru),
    issuedAt: Number.isNaN(issued) ? null : issued,
    sections,
  };
}

/**
 * Territory of a station (station.json); null when Vigicrues has none. Asked
 * for a station outside its network, the service answers with its error
 * envelope: that is a "none", not a failure to retry.
 */
export function parseStationTerritory(body) {
  if (body && typeof body === 'object' && Object.hasOwn(body, 'error_msg')) {
    return null;
  }
  const document = envelope(body, 'the station');
  if (!document) {
    return null;
  }
  return real(document.VigilanceCrues?.PereBoitEntVigiCru?.CdEntVigiCru);
}

/** First entity of a referential document (TerEntVigiCru, TronEntVigiCru). */
function entity(body, what) {
  const document = envelope(body, what);
  const list = document?.ListEntVigiCru;
  return Array.isArray(list) && list.length > 0 ? list[0] : null;
}

/** Section codes of a territory (TerEntVigiCru). */
export function parseTerritorySections(body) {
  const children = entity(body, 'the territory')?.aNMoinsUn;
  return (Array.isArray(children) ? children : [])
    .filter((child) => String(child?.TypEntVigiCruInferieur) === SECTION_TYPE)
    .map((child) => real(child.CdEntVigiCruInferieur))
    .filter(Boolean);
}

/** Station codes of a section (TronEntVigiCru). */
export function parseSectionStations(body) {
  const children = entity(body, 'the section')?.aNMoinsUn;
  return (Array.isArray(children) ? children : [])
    .map((child) => real(child?.CdEntVigiCruInferieur))
    .filter(Boolean);
}

export class Vigicrues {
  /**
   * @param {object} [options]
   * @param {Function} [options.fetch]
   */
  constructor({ fetch: fetchImpl } = {}) {
    this.fetch = fetchImpl ?? globalThis.fetch;
  }

  async vigilance() {
    return parseVigilance(
      await getJson(this.fetch, `${VIGICRUES_BASE}/InfoVigiCru.geojson`, { timeoutMs: 60000 }),
    );
  }

  async territoryOfStation(code) {
    const query = new URLSearchParams({ CdStationHydro: code });
    try {
      return parseStationTerritory(
        await getJson(this.fetch, `${VIGICRUES_BASE}/station.json/index.php?${query}`),
      );
    } catch (err) {
      if (err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  async sectionsOfTerritory(territory) {
    const query = new URLSearchParams({ CdEntVigiCru: territory, TypEntVigiCru: '5' });
    return parseTerritorySections(
      await getJson(this.fetch, `${VIGICRUES_BASE}/TerEntVigiCru.json?${query}`),
    );
  }

  async stationsOfSection(section) {
    const query = new URLSearchParams({ CdEntVigiCru: section, TypEntVigiCru: SECTION_TYPE });
    return parseSectionStations(
      await getJson(this.fetch, `${VIGICRUES_BASE}/TronEntVigiCru.json?${query}`),
    );
  }
}
