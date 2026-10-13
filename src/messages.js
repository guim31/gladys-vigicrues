// -----------------------------------------------------------------------------
// Texts sent from the container (feature values, connection status, action
// messages), in the four languages of the Gladys interface. Entries are strings
// or functions of one parameter object. German says "du", Spanish "usted".
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { LANGUAGES } from './config.js';

/**
 * The four Vigicrues levels. `gladys` is the value of the risk feature (the
 * front's badge: 0 no risk … 3 high), `key` the stable English word scene
 * triggers carry, `widget` the colour of the closed widget palette (it has no
 * orange: orange and red are both "danger", the text tells them apart).
 */
export const VIGILANCE_LEVELS = {
  1: { key: 'green', gladys: 0, widget: WIDGET_COLORS.SUCCESS },
  2: { key: 'yellow', gladys: 1, widget: WIDGET_COLORS.WARNING },
  3: { key: 'orange', gladys: 2, widget: WIDGET_COLORS.DANGER },
  4: { key: 'red', gladys: 3, widget: WIDGET_COLORS.DANGER },
};

export const COLOR_NAMES = {
  en: { green: 'Green', yellow: 'Yellow', orange: 'Orange', red: 'Red' },
  fr: { green: 'Vert', yellow: 'Jaune', orange: 'Orange', red: 'Rouge' },
  de: { green: 'Grün', yellow: 'Gelb', orange: 'Orange', red: 'Rot' },
  es: { green: 'Verde', yellow: 'Amarillo', orange: 'Naranja', red: 'Rojo' },
};

export const TREND_NAMES = {
  en: { rising: 'rising', steady: 'steady', falling: 'falling' },
  fr: { rising: 'monte', steady: 'stable', falling: 'baisse' },
  de: { rising: 'steigt', steady: 'stabil', falling: 'fällt' },
  es: { rising: 'sube', steady: 'estable', falling: 'baja' },
};

// Values of the "Last reading" feature.
export const READINGS = {
  en: {
    staleSince: ({ date }) => `No new reading since ${date}`,
    none: 'No reading for over a month',
  },
  fr: {
    staleSince: ({ date }) => `Pas de nouvelle mesure depuis le ${date}`,
    none: "Aucune mesure depuis plus d'un mois",
  },
  de: {
    staleSince: ({ date }) => `Keine neue Messung seit ${date}`,
    none: 'Seit über einem Monat keine Messung',
  },
  es: {
    staleSince: ({ date }) => `Sin nueva medición desde el ${date}`,
    none: 'Sin mediciones desde hace más de un mes',
  },
};

// Connection status of the Configuration screen.
export const STATUS = {
  en: {
    initFailed: 'Initialization failed, check the integration logs.',
    hubeauDown: "Hub'Eau does not answer: the readings will come back with it.",
    vigicruesDown: 'Vigicrues does not answer: the vigilance levels are not updated.',
    unknown: ({ codes }) => `Unknown station code: ${codes}.`,
    invalid: ({ values }) => `Ignored (neither a station code nor an INSEE code): ${values}.`,
    noHouse: 'Around my house: give your house a location in Gladys (Settings, Houses).',
    houseUnlocated: ({ name }) =>
      `Around my house: the house "${name}" has no location in Gladys (Settings, Houses).`,
    houseGone: ({ name }) =>
      `Around my house: the house "${name}" no longer exists in Gladys, choose another one in the configuration.`,
    tooMany: ({ max }) => `Only the first ${max} stations are followed.`,
    none: 'No station yet: fill in the configuration, or use "Find stations".',
  },
  fr: {
    initFailed: "L'initialisation a échoué, consultez les logs de l'intégration.",
    hubeauDown: "Hub'Eau ne répond pas : les mesures reviendront avec lui.",
    vigicruesDown: 'Vigicrues ne répond pas : les niveaux de vigilance ne sont pas mis à jour.',
    unknown: ({ codes }) => `Code de station inconnu : ${codes}.`,
    invalid: ({ values }) => `Ignoré (ni code de station ni code INSEE) : ${values}.`,
    noHouse:
      'Autour de ma maison : indiquez la position de votre maison dans Gladys (Paramètres, Maisons).',
    houseUnlocated: ({ name }) =>
      `Autour de ma maison : la maison « ${name} » n'a pas de position dans Gladys (Paramètres, Maisons).`,
    houseGone: ({ name }) =>
      `Autour de ma maison : la maison « ${name} » n'existe plus dans Gladys, choisissez-en une autre dans la configuration.`,
    tooMany: ({ max }) => `Seules les ${max} premières stations sont suivies.`,
    none: 'Aucune station : remplissez la configuration, ou utilisez « Chercher des stations ».',
  },
  de: {
    initFailed: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
    hubeauDown: "Hub'Eau antwortet nicht: Die Messwerte kommen mit ihm zurück.",
    vigicruesDown: 'Vigicrues antwortet nicht: Die Warnstufen werden nicht aktualisiert.',
    unknown: ({ codes }) => `Unbekannter Stationscode: ${codes}.`,
    invalid: ({ values }) => `Ignoriert (weder Stationscode noch INSEE-Code): ${values}.`,
    noHouse: 'Rund um mein Haus: Gib deinem Haus in Gladys einen Standort (Einstellungen, Häuser).',
    houseUnlocated: ({ name }) =>
      `Rund um mein Haus: Das Haus „${name}“ hat in Gladys keinen Standort (Einstellungen, Häuser).`,
    houseGone: ({ name }) =>
      `Rund um mein Haus: Das Haus „${name}“ gibt es in Gladys nicht mehr, wähle in der Konfiguration ein anderes.`,
    tooMany: ({ max }) => `Nur die ersten ${max} Stationen werden verfolgt.`,
    none: 'Noch keine Station: Fülle die Konfiguration aus oder nutze „Stationen suchen“.',
  },
  es: {
    initFailed: 'La inicialización ha fallado, consulte los registros de la integración.',
    hubeauDown: "Hub'Eau no responde: las mediciones volverán con él.",
    vigicruesDown: 'Vigicrues no responde: los niveles de vigilancia no se actualizan.',
    unknown: ({ codes }) => `Código de estación desconocido: ${codes}.`,
    invalid: ({ values }) => `Ignorado (ni código de estación ni código INSEE): ${values}.`,
    noHouse: 'Alrededor de mi casa: indique la ubicación de su casa en Gladys (Ajustes, Casas).',
    houseUnlocated: ({ name }) =>
      `Alrededor de mi casa: la casa «${name}» no tiene ubicación en Gladys (Ajustes, Casas).`,
    houseGone: ({ name }) =>
      `Alrededor de mi casa: la casa «${name}» ya no existe en Gladys, elija otra en la configuración.`,
    tooMany: ({ max }) => `Solo se siguen las ${max} primeras estaciones.`,
    none: 'Aún no hay estaciones: rellene la configuración o use «Buscar estaciones».',
  },
};

// Messages of the "Find stations" action.
export const SEARCH = {
  en: {
    noHouse:
      'Your house has no location in Gladys: type a commune code (31555), a department and a name (31 Toulouse) or a station code.',
    houseUnlocated: ({ name }) =>
      `The house "${name}" has no location in Gladys: type a commune code (31555), a department and a name (31 Toulouse) or a station code.`,
    houseGone: ({ name }) =>
      `The house "${name}" of the configuration no longer exists in Gladys: choose another one, or type a commune code (31555).`,
    needDepartment:
      'Add the department number to the name, e.g. "31 Toulouse", or give your house a location in Gladys.',
    none: 'No station in service found.',
    found: ({ count }) =>
      `${count} station(s), nearest first. Copy the codes into "Station codes", then save:`,
    unavailable: "Hub'Eau does not answer, try again in a few minutes.",
    realtime: 'real-time',
    noRealtime: 'no recent reading',
  },
  fr: {
    noHouse:
      "Votre maison n'a pas de position dans Gladys : tapez un code de commune (31555), un département et un nom (31 Toulouse) ou un code de station.",
    houseUnlocated: ({ name }) =>
      `La maison « ${name} » n'a pas de position dans Gladys : tapez un code de commune (31555), un département et un nom (31 Toulouse) ou un code de station.`,
    houseGone: ({ name }) =>
      `La maison « ${name} » de la configuration n'existe plus dans Gladys : choisissez-en une autre, ou tapez un code de commune (31555).`,
    needDepartment:
      'Ajoutez le numéro du département au nom, par exemple « 31 Toulouse », ou donnez une position à votre maison dans Gladys.',
    none: 'Aucune station en service trouvée.',
    found: ({ count }) =>
      `${count} station(s), les plus proches d'abord. Copiez les codes dans « Codes des stations », puis enregistrez :`,
    unavailable: "Hub'Eau ne répond pas, réessayez dans quelques minutes.",
    realtime: 'temps réel',
    noRealtime: 'pas de mesure récente',
  },
  de: {
    noHouse:
      'Dein Haus hat in Gladys keinen Standort: Gib einen Gemeindecode (31555), ein Département und einen Namen (31 Toulouse) oder einen Stationscode ein.',
    houseUnlocated: ({ name }) =>
      `Das Haus „${name}“ hat in Gladys keinen Standort: Gib einen Gemeindecode (31555), ein Département und einen Namen (31 Toulouse) oder einen Stationscode ein.`,
    houseGone: ({ name }) =>
      `Das Haus „${name}“ der Konfiguration gibt es in Gladys nicht mehr: Wähle ein anderes oder gib einen Gemeindecode (31555) ein.`,
    needDepartment:
      'Ergänze den Namen um die Nummer des Départements, z. B. „31 Toulouse“, oder gib deinem Haus in Gladys einen Standort.',
    none: 'Keine Station in Betrieb gefunden.',
    found: ({ count }) =>
      `${count} Station(en), die nächsten zuerst. Kopiere die Codes in „Stationscodes“ und speichere:`,
    unavailable: "Hub'Eau antwortet nicht, versuche es in ein paar Minuten erneut.",
    realtime: 'Echtzeit',
    noRealtime: 'keine aktuelle Messung',
  },
  es: {
    noHouse:
      'Su casa no tiene ubicación en Gladys: escriba un código de municipio (31555), un departamento y un nombre (31 Toulouse) o un código de estación.',
    houseUnlocated: ({ name }) =>
      `La casa «${name}» no tiene ubicación en Gladys: escriba un código de municipio (31555), un departamento y un nombre (31 Toulouse) o un código de estación.`,
    houseGone: ({ name }) =>
      `La casa «${name}» de la configuración ya no existe en Gladys: elija otra o escriba un código de municipio (31555).`,
    needDepartment:
      'Añada el número del departamento al nombre, por ejemplo «31 Toulouse», o indique la ubicación de su casa en Gladys.',
    none: 'No se ha encontrado ninguna estación en servicio.',
    found: ({ count }) =>
      `${count} estación(es), las más cercanas primero. Copie los códigos en «Códigos de estación» y guarde:`,
    unavailable: "Hub'Eau no responde, inténtelo de nuevo en unos minutos.",
    realtime: 'tiempo real',
    noRealtime: 'sin medición reciente',
  },
};

/** One entry of a message table, in every language: `{ en, fr, de, es }`. */
export function render(table, key, params = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => {
      const entry = table[language][key];
      return [language, typeof entry === 'function' ? entry(params) : entry];
    }),
  );
}

/** Several multi-language texts joined, language by language. */
export function join(...messages) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      messages
        .filter(Boolean)
        .map((message) => message[language])
        .join(' '),
    ]),
  );
}

/** A date in the user's time zone (TZ, set by the Gladys supervisor), e.g. "13/10 18:35". */
export function formatDate(time, language) {
  return new Intl.DateTimeFormat(language === 'en' ? 'en-GB' : language, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));
}

/** A number in the user's language, e.g. "2,59" in French. */
export function formatNumber(value, language, digits = 2) {
  return new Intl.NumberFormat(language === 'en' ? 'en-GB' : language, {
    maximumFractionDigits: digits,
  }).format(value);
}
