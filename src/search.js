// -----------------------------------------------------------------------------
// The "Find stations" configuration action: lists the stations in service near
// the house, in a commune, a department or by code, with their river and
// whether they sent a reading in the last hours, so the user can copy the codes
// into the configuration.
//
// What can be typed (several at once, separated by spaces or commas):
//   - nothing: the stations around the house (its location in Gladys);
//   - station codes (O200004001) or Vigicrues station URLs;
//   - INSEE commune codes (31555);
//   - a department number (31, 2A, 974), optionally followed by words of the
//     station, commune or river name ("31 Toulouse", "75 Seine");
//   - words alone: searched around the house, 30 km at least.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { departmentOf, isCommuneCode, stationCodeOf } from './config.js';
import { boxAround, distanceKm } from './geo.js';
import { SEARCH, formatNumber, render } from './messages.js';
import { Monitor } from './monitor.js';

const logger = createLogger({ name: 'vigicrues-search' });

export const SEARCH_RADII = ['5', '10', '20', '50'];
const DEFAULT_RADIUS_KM = 10;
const WORDS_RADIUS_KM = 30;
const MAX_RESULTS = 10;
const DEPARTMENT = /^(?:\d{2}|2[AB]|97[1-6])$/;
const HOUR = 60 * 60 * 1000;

/** What the user typed, sorted by kind. */
export function parseQuery(text) {
  const query = { stations: [], communes: [], department: null, words: [] };
  for (const token of String(text ?? '')
    .split(/[\s,;]+/)
    .filter(Boolean)) {
    const upper = token.toUpperCase();
    const code = stationCodeOf(token);
    if (code) {
      query.stations.push(code);
    } else if (isCommuneCode(upper)) {
      query.communes.push(upper);
    } else if (DEPARTMENT.test(upper) && query.department === null) {
      query.department = upper;
    } else {
      query.words.push(token);
    }
  }
  return query;
}

/** Candidates of a query, with the house as origin when the search is around it. */
async function candidates(monitor, query, radiusKm) {
  if (query.stations.length > 0) {
    const found = [];
    for (const code of query.stations) {
      const station = await monitor.hubeau.station(code);
      if (station) {
        found.push(station);
      }
    }
    return { stations: found, origin: await monitor.house() };
  }
  if (query.communes.length > 0) {
    const found = [];
    for (const commune of query.communes) {
      const stations = await monitor.departmentStations(departmentOf(commune));
      found.push(...stations.filter((station) => station.communeCode === commune));
    }
    return { stations: found, origin: await monitor.house() };
  }
  if (query.department) {
    const stations = await monitor.departmentStations(query.department);
    return {
      stations: stations.filter((station) => Monitor.matches(station, query.words)),
      origin: await monitor.house(),
    };
  }
  // The house of the configuration, as for "around my house".
  const { house, problem } = await monitor.findHouse();
  if (!house) {
    return query.words.length > 0
      ? { error: 'needDepartment' }
      : { error: problem.key, params: { name: problem.name } };
  }
  const radius = query.words.length > 0 ? Math.max(radiusKm, WORDS_RADIUS_KM) : radiusKm;
  const stations = (
    await monitor.hubeau.stationsInBox(boxAround(house.latitude, house.longitude, radius))
  ).filter(
    (station) =>
      Monitor.matches(station, query.words) &&
      station.latitude !== null &&
      distanceKm(house.latitude, house.longitude, station.latitude, station.longitude) <= radius,
  );
  return { stations, origin: house };
}

/**
 * Handler of the `search_stations` action.
 * @param {Monitor} monitor
 * @param {{ query?: string, radius?: string }} fields
 */
export async function searchStations(monitor, fields = {}) {
  const query = parseQuery(fields.query);
  const radiusKm = SEARCH_RADII.includes(String(fields.radius))
    ? Number(fields.radius)
    : DEFAULT_RADIUS_KM;
  try {
    const found = await candidates(monitor, query, radiusKm);
    if (found.error) {
      return render(SEARCH, found.error, found.params);
    }
    const { origin } = found;
    const unique = [...new Map(found.stations.map((station) => [station.code, station])).values()];
    const listed = unique
      .filter((station) => station.active || query.stations.includes(station.code))
      .map((station) => ({
        station,
        km:
          origin && station.latitude !== null
            ? distanceKm(origin.latitude, origin.longitude, station.latitude, station.longitude)
            : null,
      }))
      .sort((a, b) =>
        a.km !== null && b.km !== null ? a.km - b.km : a.station.name.localeCompare(b.station.name),
      )
      .slice(0, MAX_RESULTS);
    logger.info(`Station search: ${listed.length} station(s) found`);
    if (listed.length === 0) {
      return render(SEARCH, 'none');
    }
    const live = await monitor.hubeau
      .observations(
        listed.map(({ station }) => station.code),
        monitor.now() - 6 * HOUR,
      )
      .catch(() => null);
    return Object.fromEntries(
      Object.keys(SEARCH).map((language) => {
        const texts = SEARCH[language];
        const lines = listed.map(({ station, km }) => {
          const parts = [`${station.code} — ${station.name}`];
          if (station.river) {
            parts[0] += ` (${station.river})`;
          }
          if (km !== null) {
            parts.push(`${formatNumber(km, language, 1)} km`);
          }
          if (live) {
            parts.push(live.get(station.code)?.H.length > 0 ? texts.realtime : texts.noRealtime);
          }
          return parts.join(', ');
        });
        return [language, `${texts.found({ count: listed.length })}\n${lines.join('\n')}`];
      }),
    );
  } catch (err) {
    logger.warn(`Station search failed: ${err.message}`);
    return render(SEARCH, 'unavailable');
  }
}
