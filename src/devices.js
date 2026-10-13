// -----------------------------------------------------------------------------
// One Gladys device per hydrometric station.
//
// Features (couples checked against the Gladys front, v5.2.1, see
// test/gladys-rules.test.js):
//   - height        level-sensor/liquid-depth in metres: the water height at
//                   the gauge, as Vigicrues shows it. It is a stage above the
//                   gauge zero, negative values are normal;
//   - flow          water-valve/flow, only when the station measures one, in
//                   the unit of the configuration (`flow_unit`). Gladys has no
//                   m³/s unit, only m³/h (the one unit the core accepts for
//                   water-valve/flow): 'm3h' converts and publishes that unit,
//                   which every Gladys screen shows; 'm3s' keeps the unit of
//                   vigicrues.gouv.fr, without a unit, and the name says it;
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

const SECONDS_PER_HOUR = 3600;

// How each `flow_unit` publishes the flow: the Gladys unit (none for m³/s),
// the bounds of the feature and the label the widget shows.
export const FLOW_FORMATS = {
  m3h: {
    unit: DEVICE_FEATURE_UNITS.CUBIC_METER_PER_HOUR,
    bound: FLOW_BOUND_M3S * SECONDS_PER_HOUR,
    label: 'm³/h',
  },
  m3s: { unit: undefined, bound: FLOW_BOUND_M3S, label: 'm³/s' },
};

/**
 * A flow in m³/s (as src/hubeau.js gives it) in the unit of `flowUnit`. Hub'Eau
 * sends whole litres per second: one decimal in m³/h (1 l/s = 3.6 m³/h) keeps
 * every digit of the measurement.
 */
export function flowIn(flowUnit, m3s) {
  return flowUnit === 'm3h' ? Math.round(m3s * SECONDS_PER_HOUR * 10) / 10 : m3s;
}

/** The `flow_unit` a flow feature of Gladys was created with ('m3s' without unit). */
export const flowUnitOfFeature = (feature) =>
  feature?.unit === FLOW_FORMATS.m3h.unit ? 'm3h' : 'm3s';

// Feature names, frozen at creation in Gladys (language of the configuration).
// The flow in m³/h shows its unit; in m³/s, without a unit, its name says it.
export const NAMES = {
  en: {
    height: 'Water height',
    flow: 'Flow',
    flow_m3s: 'Flow (m³/s)',
    vigilance: 'Flood vigilance',
    vigilance_color: 'Vigilance colour',
    last_reading: 'Last reading',
  },
  fr: {
    height: "Hauteur d'eau",
    flow: 'Débit',
    flow_m3s: 'Débit (m³/s)',
    vigilance: 'Vigilance crues',
    vigilance_color: 'Couleur de vigilance',
    last_reading: 'Dernière mesure',
  },
  de: {
    height: 'Wasserstand',
    flow: 'Abfluss',
    flow_m3s: 'Abfluss (m³/s)',
    vigilance: 'Hochwasserwarnstufe',
    vigilance_color: 'Warnfarbe',
    last_reading: 'Letzte Messung',
  },
  es: {
    height: 'Altura del agua',
    flow: 'Caudal',
    flow_m3s: 'Caudal (m³/s)',
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
 * @param {string} flowUnit 'm3h' or 'm3s', see FLOW_FORMATS
 */
export function buildDevice(gladys, station, language = 'fr', flowUnit = 'm3h') {
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
    const flow = FLOW_FORMATS[flowUnit] ?? FLOW_FORMATS.m3h;
    features.push(
      sensor(
        flowUnit === 'm3s' ? names.flow_m3s : names.flow,
        ids.flow,
        DEVICE_FEATURE_CATEGORIES.WATER_VALVE,
        TYPES.WATER_VALVE.FLOW,
        {
          ...(flow.unit ? { unit: flow.unit } : {}),
          keep_history: true,
          min: -flow.bound,
          max: flow.bound,
        },
      ),
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
