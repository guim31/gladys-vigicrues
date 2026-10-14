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
//                   reading since…" once the station has been silent too long;
//   - forecast_*    only when Vigicrues publishes a forecast for the station
//                   (few do): for the height, and for the flow when it is
//                   forecast too, the peak expected over the horizon in its
//                   three scenarios (central, low and high bound of the 80 %
//                   range), and the value expected in 24 hours in the same
//                   three; the time of the height peak and the production date
//                   of the forecast as text. Numbers in the units of the
//                   readings, so a native "device value" scene trigger with
//                   "only when the threshold is crossed" alerts on a forecast:
//                   no trigger of the integration is needed for it.
//
// Why the peak and +24 h, and not +48 h: the horizon of Vigicrues is 1 to 3
// days, the peak already says how high the water goes within it, and +24 h how
// fast it comes; +48 h would add three more features per series for a value
// that lies between both most of the time.
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
  FORECAST_ISSUED: 'forecast_issued',
};

// Forecast features of a series, by the key of their value in a forecast
// summary (src/vigicrues.js summarizeForecast). The height has the time of
// its peak too.
const FORECAST_VALUES = [
  ['peak', 'peak', 'mid'],
  ['peak_low', 'peak', 'low'],
  ['peak_high', 'peak', 'high'],
  ['24h', 'in24h', 'mid'],
  ['24h_low', 'in24h', 'low'],
  ['24h_high', 'in24h', 'high'],
];
export const FORECAST_SERIES = { H: 'forecast_height', Q: 'forecast_flow' };
export const FORECAST_PEAK_TIME = 'forecast_height_peak_time';

/**
 * The numeric forecast features of a series: `{ key, part, field }`, the key
 * being the feature key (forecast_height_peak_high…) and `summary[part][field]`
 * its value.
 */
export const forecastFeatures = (series) =>
  FORECAST_VALUES.map(([suffix, part, field]) => ({
    key: `${FORECAST_SERIES[series]}_${suffix}`,
    part,
    field,
  }));

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
// The flow in m³/h shows its unit; in m³/s, without a unit, its name says it
// (the forecast flows too, see flowName).
export const NAMES = {
  en: {
    height: 'Water height',
    flow: 'Flow',
    flow_m3s: 'Flow (m³/s)',
    vigilance: 'Flood vigilance',
    vigilance_color: 'Vigilance colour',
    last_reading: 'Last reading',
    forecast_height_peak: 'Height: forecast peak (central)',
    forecast_height_peak_low: 'Height: forecast peak (low)',
    forecast_height_peak_high: 'Height: forecast peak (high)',
    forecast_height_peak_time: 'Height: time of the forecast peak',
    forecast_height_24h: 'Height in 24 h (central)',
    forecast_height_24h_low: 'Height in 24 h (low)',
    forecast_height_24h_high: 'Height in 24 h (high)',
    forecast_flow_peak: 'Flow: forecast peak (central)',
    forecast_flow_peak_low: 'Flow: forecast peak (low)',
    forecast_flow_peak_high: 'Flow: forecast peak (high)',
    forecast_flow_24h: 'Flow in 24 h (central)',
    forecast_flow_24h_low: 'Flow in 24 h (low)',
    forecast_flow_24h_high: 'Flow in 24 h (high)',
    forecast_issued: 'Forecast issued',
  },
  fr: {
    height: "Hauteur d'eau",
    flow: 'Débit',
    flow_m3s: 'Débit (m³/s)',
    vigilance: 'Vigilance crues',
    vigilance_color: 'Couleur de vigilance',
    last_reading: 'Dernière mesure',
    forecast_height_peak: 'Hauteur : pic prévu (central)',
    forecast_height_peak_low: 'Hauteur : pic prévu (bas)',
    forecast_height_peak_high: 'Hauteur : pic prévu (haut)',
    forecast_height_peak_time: 'Hauteur : heure du pic prévu',
    forecast_height_24h: 'Hauteur dans 24 h (centrale)',
    forecast_height_24h_low: 'Hauteur dans 24 h (basse)',
    forecast_height_24h_high: 'Hauteur dans 24 h (haute)',
    forecast_flow_peak: 'Débit : pic prévu (central)',
    forecast_flow_peak_low: 'Débit : pic prévu (bas)',
    forecast_flow_peak_high: 'Débit : pic prévu (haut)',
    forecast_flow_24h: 'Débit dans 24 h (central)',
    forecast_flow_24h_low: 'Débit dans 24 h (bas)',
    forecast_flow_24h_high: 'Débit dans 24 h (haut)',
    forecast_issued: 'Prévision produite le',
  },
  de: {
    height: 'Wasserstand',
    flow: 'Abfluss',
    flow_m3s: 'Abfluss (m³/s)',
    vigilance: 'Hochwasserwarnstufe',
    vigilance_color: 'Warnfarbe',
    last_reading: 'Letzte Messung',
    forecast_height_peak: 'Wasserstand: Prognosespitze (zentral)',
    forecast_height_peak_low: 'Wasserstand: Prognosespitze (niedrig)',
    forecast_height_peak_high: 'Wasserstand: Prognosespitze (hoch)',
    forecast_height_peak_time: 'Wasserstand: Zeit der Spitze',
    forecast_height_24h: 'Wasserstand in 24 h (zentral)',
    forecast_height_24h_low: 'Wasserstand in 24 h (niedrig)',
    forecast_height_24h_high: 'Wasserstand in 24 h (hoch)',
    forecast_flow_peak: 'Abfluss: Prognosespitze (zentral)',
    forecast_flow_peak_low: 'Abfluss: Prognosespitze (niedrig)',
    forecast_flow_peak_high: 'Abfluss: Prognosespitze (hoch)',
    forecast_flow_24h: 'Abfluss in 24 h (zentral)',
    forecast_flow_24h_low: 'Abfluss in 24 h (niedrig)',
    forecast_flow_24h_high: 'Abfluss in 24 h (hoch)',
    forecast_issued: 'Prognose erstellt am',
  },
  es: {
    height: 'Altura del agua',
    flow: 'Caudal',
    flow_m3s: 'Caudal (m³/s)',
    vigilance: 'Vigilancia de crecidas',
    vigilance_color: 'Color de vigilancia',
    last_reading: 'Última medición',
    forecast_height_peak: 'Altura: pico previsto (central)',
    forecast_height_peak_low: 'Altura: pico previsto (bajo)',
    forecast_height_peak_high: 'Altura: pico previsto (alto)',
    forecast_height_peak_time: 'Altura: hora del pico previsto',
    forecast_height_24h: 'Altura en 24 h (central)',
    forecast_height_24h_low: 'Altura en 24 h (baja)',
    forecast_height_24h_high: 'Altura en 24 h (alta)',
    forecast_flow_peak: 'Caudal: pico previsto (central)',
    forecast_flow_peak_low: 'Caudal: pico previsto (bajo)',
    forecast_flow_peak_high: 'Caudal: pico previsto (alto)',
    forecast_flow_24h: 'Caudal en 24 h (central)',
    forecast_flow_24h_low: 'Caudal en 24 h (bajo)',
    forecast_flow_24h_high: 'Caudal en 24 h (alto)',
    forecast_issued: 'Previsión emitida el',
  },
};

/** A forecast flow name in m³/s, without a Gladys unit, says it: "Flow in 24 h (low, m³/s)". */
const flowName = (name, flowUnit) => (flowUnit === 'm3s' ? name.replace(/\)$/, ', m³/s)') : name);

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
    forecastIssued: ids.feature(FEATURE_KEYS.FORECAST_ISSUED),
    feature: ids.feature,
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
 * @param {object} station see src/hubeau.js parseStation, plus `hasFlow`, `sections`,
 *   `hasForecast` and `hasFlowForecast`
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
  const text = (name, externalId) =>
    sensor(name, externalId, DEVICE_FEATURE_CATEGORIES.TEXT, TYPES.TEXT.TEXT, {
      keep_history: false,
      min: 0,
      max: 0,
    });
  features.push(text(names.last_reading, ids.lastReading));
  if (station.hasForecast) {
    for (const { key } of forecastFeatures('H')) {
      features.push(
        sensor(
          names[key],
          ids.feature(key),
          DEVICE_FEATURE_CATEGORIES.LEVEL_SENSOR,
          TYPES.LEVEL_SENSOR.LIQUID_DEPTH,
          {
            unit: DEVICE_FEATURE_UNITS.M,
            keep_history: true,
            min: -HEIGHT_BOUND_M,
            max: HEIGHT_BOUND_M,
          },
        ),
      );
    }
    features.push(text(names[FORECAST_PEAK_TIME], ids.feature(FORECAST_PEAK_TIME)));
    if (station.hasFlow && station.hasFlowForecast) {
      const flow = FLOW_FORMATS[flowUnit] ?? FLOW_FORMATS.m3h;
      for (const { key } of forecastFeatures('Q')) {
        features.push(
          sensor(
            flowName(names[key], flowUnit),
            ids.feature(key),
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
    }
    features.push(text(names.forecast_issued, ids.forecastIssued));
  }
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
