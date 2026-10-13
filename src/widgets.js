// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `stations`.
//
// Without setting, one status line per followed station (10 at most): the
// height and its trend, coloured by the vigilance of its section (the closed
// palette of the widgets: green success, yellow warning, orange and red
// danger; neutral without a section or without a recent reading). A heading
// appears when a section is yellow or worse.
//
// With a station chosen in the settings: its live height and flow tiles (bound
// to the device features), then its vigilance, trend and last reading.
//
// Both end with the source and its date (the Vigicrues licence asks for both)
// and a link to vigicrues.gouv.fr. Budget: 2 texts, 1 status, 2 tiles,
// 1 button.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { stationCodeOfId, stationIds } from './devices.js';
import {
  COLOR_NAMES,
  TREND_NAMES,
  VIGILANCE_LEVELS,
  formatDate,
  formatNumber,
} from './messages.js';
import { WIDGET_KEY } from './monitor.js';
import { VIGICRUES_SITE, stationPage } from './vigicrues.js';

export const MAX_STATUS_ITEMS = 10;
export const TTL_SECONDS = 300;
const MAX_STATUS_TEXT = 40;

export const TEXT = {
  empty: {
    en: 'No station yet: fill in the configuration of the Vigicrues integration, then create the devices in the Discover tab.',
    fr: "Aucune station pour l'instant : remplissez la configuration de l'intégration Vigicrues, puis créez les appareils dans l'onglet Découverte.",
    de: 'Noch keine Station: Fülle die Konfiguration der Integration Vigicrues aus und lege dann die Geräte im Tab „Entdecken“ an.',
    es: 'Aún no hay estaciones: rellene la configuración de la integración Vigicrues y, después, cree los dispositivos en la pestaña Descubrir.',
  },
  gone: {
    en: 'This station is no longer followed.',
    fr: "Cette station n'est plus suivie.",
    de: 'Diese Station wird nicht mehr verfolgt.',
    es: 'Esta estación ya no se sigue.',
  },
  alert: {
    en: 'Flood vigilance: ',
    fr: 'Vigilance crues : ',
    de: 'Hochwasserwarnung: ',
    es: 'Vigilancia de crecidas: ',
  },
  height: { en: 'Height', fr: 'Hauteur', de: 'Wasserstand', es: 'Altura' },
  flow: { en: 'Flow', fr: 'Débit', de: 'Abfluss', es: 'Caudal' },
  vigilance: { en: 'Vigilance', fr: 'Vigilance', de: 'Warnstufe', es: 'Vigilancia' },
  trend: { en: 'Trend', fr: 'Tendance', de: 'Tendenz', es: 'Tendencia' },
  lastReading: {
    en: 'Last reading',
    fr: 'Dernière mesure',
    de: 'Letzte Messung',
    es: 'Última medición',
  },
  silent: {
    en: 'Silent since ',
    fr: 'Muette depuis le ',
    de: 'Still seit ',
    es: 'Sin datos desde ',
  },
  waiting: { en: 'Waiting', fr: 'En attente', de: 'Wartet', es: 'En espera' },
  unknown: { en: 'Unknown', fr: 'Inconnue', de: 'Unbekannt', es: 'Desconocida' },
  noSection: {
    en: 'Not on a Vigicrues section',
    fr: 'Hors tronçon Vigicrues',
    de: 'Kein Vigicrues-Abschnitt',
    es: 'Fuera de tramo Vigicrues',
  },
  source: {
    en: "Source: © Vigicrues, Hub'Eau",
    fr: "Source : © Vigicrues, Hub'Eau",
    de: "Quelle: © Vigicrues, Hub'Eau",
    es: "Fuente: © Vigicrues, Hub'Eau",
  },
  site: { en: 'Vigicrues', fr: 'Vigicrues', de: 'Vigicrues', es: 'Vigicrues' },
};

const t = (text, language) => text[language] ?? text.en;
const clip = (text, max = MAX_STATUS_TEXT) =>
  text.length <= max ? text : `${text.slice(0, max - 1)}…`;

const TREND_ICONS = { rising: 'trending-up', falling: 'trending-down', steady: 'minus' };

/** Colour of a station line: the vigilance when the reading is recent. */
function colorOf(view) {
  if (!view.fresh || view.level === null) {
    return WIDGET_COLORS.NEUTRAL;
  }
  return VIGILANCE_LEVELS[view.level].widget;
}

/** The status value of a station, e.g. "2,59 m, monte" (40 characters at most). */
export function stationValue(view, language) {
  if (view.lastReadingAt === null) {
    return t(TEXT.waiting, language);
  }
  if (!view.fresh || view.height === null) {
    return clip(`${t(TEXT.silent, language)}${formatDate(view.lastReadingAt, language)}`);
  }
  const height = `${formatNumber(view.height, language)} m`;
  return clip(view.trend ? `${height}, ${TREND_NAMES[language][view.trend]}` : height);
}

function footer(monitor, codes, language, link) {
  const updated = monitor.updatedAt(codes);
  const source = t(TEXT.source, language);
  return [
    {
      type: 'text',
      variant: 'caption',
      text: updated === null ? source : `${source} · ${formatDate(updated, language)}`,
    },
    { type: 'button', label: t(TEXT.site, language), icon: 'external-link', link: { url: link } },
  ];
}

function overview(monitor, codes, language) {
  const views = codes.slice(0, MAX_STATUS_ITEMS).map((code) => monitor.view(code));
  const components = [];
  const worst = Math.max(0, ...views.filter((view) => view.level !== null).map((v) => v.level));
  if (worst >= 2) {
    const color = COLOR_NAMES[language][VIGILANCE_LEVELS[worst].key];
    components.push({
      type: 'text',
      variant: 'heading',
      text: `${t(TEXT.alert, language)}${color}`,
    });
  }
  components.push({
    type: 'status',
    items: views.map((view) => ({
      label: clip(view.name),
      value: stationValue(view, language),
      color: colorOf(view),
      icon: view.fresh && view.trend ? TREND_ICONS[view.trend] : 'clock',
    })),
  });
  return [...components, ...footer(monitor, codes, language, VIGICRUES_SITE)];
}

function detail(monitor, code, language) {
  const view = monitor.view(code);
  const ids = stationIds(monitor.gladys, code);
  const components = [
    { type: 'value', label: t(TEXT.height, language), device_feature: ids.height },
  ];
  if (view.hasFlow) {
    components.push({ type: 'value', label: t(TEXT.flow, language), device_feature: ids.flow });
  }
  const items = [];
  if (view.hasSection) {
    items.push({
      label: t(TEXT.vigilance, language),
      value:
        view.level === null
          ? t(TEXT.unknown, language)
          : clip(
              `${COLOR_NAMES[language][VIGILANCE_LEVELS[view.level].key]} · ${view.section.name}`,
            ),
      color: view.level === null ? WIDGET_COLORS.NEUTRAL : VIGILANCE_LEVELS[view.level].widget,
    });
  } else {
    items.push({
      label: t(TEXT.vigilance, language),
      value: t(TEXT.noSection, language),
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  items.push({
    label: t(TEXT.trend, language),
    value: view.trend ? TREND_NAMES[language][view.trend] : t(TEXT.unknown, language),
    icon: view.trend ? TREND_ICONS[view.trend] : 'minus',
    color: WIDGET_COLORS.NEUTRAL,
  });
  items.push({
    label: t(TEXT.lastReading, language),
    value:
      view.lastReadingAt === null
        ? t(TEXT.waiting, language)
        : formatDate(view.lastReadingAt, language),
    color: view.fresh ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.WARNING,
    icon: 'clock',
  });
  components.push({ type: 'status', items });
  return [...components, ...footer(monitor, [code], language, stationPage(code))];
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    async get(monitor, { settings, language = 'en' }) {
      const lang = COLOR_NAMES[language] ? language : 'en';
      const created = monitor.created();
      const chosen = typeof settings?.station === 'string' ? settings.station : null;
      if (chosen) {
        const code = stationCodeOfId(monitor.gladys, chosen);
        const components =
          code && created.includes(code)
            ? detail(monitor, code, lang)
            : [{ type: 'text', variant: 'body', text: t(TEXT.gone, lang) }];
        return { ttl_seconds: TTL_SECONDS, components };
      }
      if (created.length === 0) {
        return {
          ttl_seconds: TTL_SECONDS,
          components: [{ type: 'text', variant: 'body', text: t(TEXT.empty, lang) }],
        };
      }
      return { ttl_seconds: TTL_SECONDS, components: overview(monitor, created, lang) };
    },
  },
};
