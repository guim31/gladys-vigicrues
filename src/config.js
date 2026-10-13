// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// Select values are strings in the manifest (stored by Gladys as typed); the
// normalized config holds numbers.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Kilometres around the house where the nearest stations are followed; '0' = off.
export const HOME_RADII = ['0', '5', '10', '20'];

// Minutes between two readings. Stations send a value every 5 to 60 minutes:
// faster would only ask Hub'Eau the same thing again.
export const REFRESH_INTERVALS = ['15', '20', '30'];

// Stations followed "around my house": the nearest ones that send real-time data.
export const HOME_STATIONS = 3;

// Upper bound of the stations taken from the configuration (codes, communes and
// house together): one Hub'Eau request covers them all, and the states stay far
// below the 300 per minute of the core.
export const MAX_STATIONS = 20;

export const DEFAULT_CONFIG = {
  stations: '',
  communes: '',
  around_home: '0',
  refresh_interval: '15',
  language: 'fr',
};

// Sandre code of a hydrometric station: a letter, then 9 letters or digits
// (O200004001, B540001001). The Vigicrues page of a station ends with it.
const STATION_CODE = /^[A-Z][0-9A-Z]{9}$/;
const STATION_URL = /\/station\/([A-Za-z][0-9A-Za-z]{9})(?:[/?#]|$)/;
// INSEE code of a commune: 5 digits, or 2A/2B and 3 digits in Corsica.
const COMMUNE_CODE = /^(?:\d{5}|2[AB]\d{3})$/;

const tokens = (text) =>
  String(text ?? '')
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);

/** A station code from a code or a Vigicrues URL, upper-cased; null otherwise. */
export function stationCodeOf(token) {
  const fromUrl = STATION_URL.exec(token);
  const code = (fromUrl ? fromUrl[1] : token).toUpperCase();
  return STATION_CODE.test(code) ? code : null;
}

export const isCommuneCode = (token) => COMMUNE_CODE.test(String(token).toUpperCase());

/** Department of a commune: the first 2 characters, 3 overseas (971 to 976). */
export const departmentOf = (commune) =>
  commune.startsWith('97') ? commune.slice(0, 3) : commune.slice(0, 2);

/** Station codes of a free text; `invalid` lists the tokens that are not one. */
export function parseStationCodes(text) {
  const codes = [];
  const invalid = [];
  for (const token of tokens(text)) {
    const code = stationCodeOf(token);
    if (code === null) {
      invalid.push(token);
    } else if (!codes.includes(code)) {
      codes.push(code);
    }
  }
  return { codes, invalid };
}

/** INSEE commune codes of a free text; `invalid` lists the other tokens. */
export function parseCommuneCodes(text) {
  const codes = [];
  const invalid = [];
  for (const token of tokens(text)) {
    const code = token.toUpperCase();
    if (!isCommuneCode(code)) {
      invalid.push(token);
    } else if (!codes.includes(code)) {
      codes.push(code);
    }
  }
  return { codes, invalid };
}

const pick = (value, allowed, fallback) =>
  allowed.includes(String(value)) ? Number(value) : Number(fallback);

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const stations = parseStationCodes(source.stations);
  const communes = parseCommuneCodes(source.communes);
  return {
    stationCodes: stations.codes,
    communeCodes: communes.codes,
    invalid: [...stations.invalid, ...communes.invalid],
    homeRadiusKm: pick(source.around_home, HOME_RADII, DEFAULT_CONFIG.around_home),
    refreshMinutes: pick(
      source.refresh_interval,
      REFRESH_INTERVALS,
      DEFAULT_CONFIG.refresh_interval,
    ),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
