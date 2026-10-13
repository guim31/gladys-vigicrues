// -----------------------------------------------------------------------------
// One Gladys device per hydrometric station.
//
// Features (couples checked against the Gladys front, v5.2.1, see
// test/gladys-rules.test.js):
//   - height        level-sensor/liquid-depth in metres: the water height at
//                   the gauge, as Vigicrues shows it. It is a stage above the
//                   gauge zero, negative values are normal;
//   - flow          water-valve/flow, in m³/s, only when the station measures
//                   one. Gladys has no m³/s unit (only m³/h): the feature has
//                   no unit and its name says it, so the value reads like on
//                   vigicrues.gouv.fr;
//   - vigilance     risk/integer, and the colour as text, only when the station
//                   belongs to a Vigicrues section. The Gladys front draws a
//                   risk badge for 0 (green, "no risk") to 3 (red, "high
//                   risk"): the Vigicrues level 1 to 4 is published minus one,
//                   so the badge has the colour of the vigilance;
//   - last_reading  text/text: the date of the last measurement, or "no new
//                   reading since…" once the station has been silent too long.
//
// Published with should_poll: false: the refresh runs in the container
// (src/monitor.js). The station code is the platform id: it is the Sandre code
// Hub'Eau and Vigicrues share, stable for the life of the station.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPE = 'station';
export const FEATURE_KEYS = {
  HEIGHT: 'height',
  FLOW: 'flow',
  VIGILANCE: 'vigilance',
  VIGILANCE_COLOR: 'vigilance_color',
  LAST_READING: 'last_reading',
};

// Display bounds of the history chart. Heights are stages above the gauge zero
// (negative below it), flows can be negative on canalised rivers: symmetric
// bounds, wide enough for the largest French rivers in flood.
export const HEIGHT_BOUND_M = 30;
export const FLOW_BOUND_M3S = 50000;

// Feature names, frozen at creation in Gladys (language of the configuration).
export const NAMES = {
  en: {
    height: 'Water height',
    flow: 'Flow (m³/s)',
    vigilance: 'Flood vigilance',
    vigilance_color: 'Vigilance colour',
    last_reading: 'Last reading',
  },
  fr: {
    height: "Hauteur d'eau",
    flow: 'Débit (m³/s)',
    vigilance: 'Vigilance crues',
    vigilance_color: 'Couleur de vigilance',
    last_reading: 'Dernière mesure',
  },
  de: {
    height: 'Wasserstand',
    flow: 'Abfluss (m³/s)',
    vigilance: 'Hochwasserwarnstufe',
    vigilance_color: 'Warnfarbe',
    last_reading: 'Letzte Messung',
  },
  es: {
    height: 'Altura del agua',
    flow: 'Caudal (m³/s)',
    vigilance: 'Vigilancia de crecidas',
    vigilance_color: 'Color de vigilancia',
    last_reading: 'Última medición',
  },
};

/** External ids of a station device and of its features. */
export function stationIds(gladys, code) {
  const ids = gladys.externalIds(DEVICE_TYPE, code);
  return {
    device: ids.device,
    height: ids.feature(FEATURE_KEYS.HEIGHT),
    flow: ids.feature(FEATURE_KEYS.FLOW),
    vigilance: ids.feature(FEATURE_KEYS.VIGILANCE),
    vigilanceColor: ids.feature(FEATURE_KEYS.VIGILANCE_COLOR),
    lastReading: ids.feature(FEATURE_KEYS.LAST_READING),
  };
}

/** The station code of a device or feature external id (null if not ours). */
export function stationCodeOfId(gladys, externalId) {
  const prefix = gladys.externalIds(DEVICE_TYPE, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  return externalId.slice(prefix.length).split(':')[0] || null;
}

const sensor = (name, externalId, category, type, extra) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: true,
  has_feedback: false,
  ...extra,
});

/**
 * The discovery payload of a station.
 * @param {object} gladys
 * @param {object} station see src/hubeau.js parseStation, plus `hasFlow` and `sections`
 * @param {string} language language of the feature names
 */
export function buildDevice(gladys, station, language = 'fr') {
  const ids = stationIds(gladys, station.code);
  const names = NAMES[language] ?? NAMES.fr;
  const features = [
    sensor(
      names.height,
      ids.height,
      DEVICE_FEATURE_CATEGORIES.LEVEL_SENSOR,
      TYPES.LEVEL_SENSOR.LIQUID_DEPTH,
      {
        unit: DEVICE_FEATURE_UNITS.M,
        keep_history: true,
        min: -HEIGHT_BOUND_M,
        max: HEIGHT_BOUND_M,
      },
    ),
  ];
  if (station.hasFlow) {
    features.push(
      sensor(names.flow, ids.flow, DEVICE_FEATURE_CATEGORIES.WATER_VALVE, TYPES.WATER_VALVE.FLOW, {
        keep_history: true,
        min: -FLOW_BOUND_M3S,
        max: FLOW_BOUND_M3S,
      }),
    );
  }
  if (station.sections?.length > 0) {
    features.push(
      sensor(names.vigilance, ids.vigilance, DEVICE_FEATURE_CATEGORIES.RISK, TYPES.RISK.INTEGER, {
        keep_history: true,
        min: 0,
        max: 3,
      }),
      sensor(
        names.vigilance_color,
        ids.vigilanceColor,
        DEVICE_FEATURE_CATEGORIES.TEXT,
        TYPES.TEXT.TEXT,
        {
          keep_history: false,
          min: 0,
          max: 0,
        },
      ),
    );
  }
  features.push(
    sensor(names.last_reading, ids.lastReading, DEVICE_FEATURE_CATEGORIES.TEXT, TYPES.TEXT.TEXT, {
      keep_history: false,
      min: 0,
      max: 0,
    }),
  );
  const params = [{ name: 'STATION_CODE', value: station.code }];
  if (station.river) {
    params.push({ name: 'RIVER', value: station.river });
  }
  if (station.sections?.length > 0) {
    params.push({ name: 'VIGICRUES_SECTION', value: station.sections.join(',') });
  }
  return {
    name: station.name,
    external_id: ids.device,
    model: station.river ? `Vigicrues · ${station.river}` : 'Vigicrues',
    should_poll: false,
    params,
    features,
  };
}
