// -----------------------------------------------------------------------------
// The monitor: which stations are followed, their readings, the vigilance of
// their sections, the states published to Gladys and the scene triggers.
// Everything the SDK handlers, the action and the widget need goes through it
// (src/app.js wires it).
//
// Followed stations: the codes, communes and "around my house" of the
// configuration (MAX_STATIONS at most), plus every station whose device the
// user created (deleting the device stops following it).
//
// Scheduling: the devices are published with should_poll: false (the core does
// not poll external devices reliably, GladysAssistant/Gladys#3198). The monitor
// runs a cycle at the configured interval: one Hub'Eau request for the readings
// of every station, and the Vigicrues vigilance every 30 minutes.
//
// States: `publishChangedStates` sends only what changed, plus a heartbeat every
// 12 hours. A reading older than 3 hours is never sent again as if it were
// fresh: the height and flow stop, the "Last reading" feature says since when.
//
// Logs: at info, only the lifecycle (start, stations followed, a station going
// silent or coming back, a vigilance change). A failure that repeats at every
// cycle (Hub'Eau or Vigicrues unreachable) is logged once, then at debug until
// it recovers, with one line at recovery. LOG_LEVEL=debug shows every cycle.
// The coordinates of the house are never logged.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { HOME_STATIONS, MAX_STATIONS, departmentOf } from './config.js';
import { buildDevice, stationCodeOfId, stationIds } from './devices.js';
import { boxAround, distanceKm } from './geo.js';
import { HubEau } from './hubeau.js';
import {
  COLOR_NAMES,
  READINGS,
  STATUS,
  VIGILANCE_LEVELS,
  formatDate,
  join,
  render,
} from './messages.js';
import { Vigicrues } from './vigicrues.js';

const logger = createLogger({ name: 'vigicrues' });

export const WIDGET_KEY = 'stations';
export const TRIGGERS = { RAISED: 'vigilance_raised', LOWERED: 'vigilance_lowered' };

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const DEFAULT_TIMINGS = {
  // The vigilance is issued at least twice a day; the file weighs 2.2 MB.
  vigilanceEveryMs: 30 * MINUTE,
  // Readings asked at every cycle: some stations send theirs once an hour, late.
  windowMs: 3 * HOUR,
  // Without a newer reading, a value is not published again as a fresh one.
  staleAfterMs: 3 * HOUR,
  // A silent station is asked for its last reading (one month back) this often.
  latestRetryMs: 6 * HOUR,
  // Name, flow and Vigicrues section of a station: asked again once a week.
  metadataMaxAgeMs: 7 * DAY,
  // A failed lookup of the Vigicrues section is tried again after this delay.
  lookupRetryMs: HOUR,
  // The stations around the house are chosen again once a day.
  homeMaxAgeMs: DAY,
  // A vigilance older than this is no longer published (Vigicrues unreachable).
  vigilanceMaxAgeMs: DAY,
  // A level remembered for longer fires no trigger when it changes (restart).
  levelMemoryMs: DAY,
  heartbeatMs: 12 * HOUR,
  // Between two requests of the Vigicrues referential, to stay polite.
  requestSpacingMs: 250,
  // requestWidgetRefresh is rate-limited to one call every 10 s by the core.
  widgetRefreshMs: 10000,
};

// A height moving by less than this per hour is steady.
const STEADY_M_PER_HOUR = 0.01;

export class GladysError extends Error {
  /** An error whose message is a multi-language object (shown in Gladys). */
  constructor(message, language = 'en') {
    super(message[language] ?? message.en);
    this.messages = message;
  }
}

/** Rising, steady or falling, from heights newest first; null if too short. */
export function trendOf(heights) {
  const [latest] = heights;
  if (!latest) {
    return null;
  }
  const earlier = heights.find((point) => latest.t - point.t >= 45 * MINUTE);
  if (!earlier || latest.t - earlier.t > 2 * HOUR) {
    return null;
  }
  const perHour = (latest.v - earlier.v) / ((latest.t - earlier.t) / HOUR);
  if (perHour >= STEADY_M_PER_HOUR) {
    return 'rising';
  }
  return perHour <= -STEADY_M_PER_HOUR ? 'falling' : 'steady';
}

const normalize = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();

export class Monitor {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK fake)
   * @param {object} options.store see src/store.js
   * @param {Function} [options.fetch] fetch, for Hub'Eau and Vigicrues
   * @param {boolean} [options.timers] false: no background timer (tests drive the cycles)
   * @param {Function} [options.now] clock in ms
   * @param {Function} [options.sleep] `(ms) => Promise`
   * @param {object} [options.timings] overrides of DEFAULT_TIMINGS
   */
  constructor({ gladys, store, fetch: fetchImpl, timers = true, now, sleep, timings }) {
    this.gladys = gladys;
    this.store = store;
    this.hubeau = new HubEau({ fetch: fetchImpl });
    this.vigicrues = new Vigicrues({ fetch: fetchImpl });
    this.timers = timers;
    this.now = now ?? (() => Date.now());
    this.sleep = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.config = null;
    this.data = emptyData();
    // Stations of the configuration, in order (codes, communes, house).
    this.configured = [];
    this.problems = { unknown: [], noHouse: false, tooMany: false };
    this.resolved = false;
    this.vigilance = null;
    this.lastVigilanceTry = -Infinity;
    this.lastCycleAt = -Infinity;
    this.statusMessage = undefined;
    this.cycleTimer = null;
    this.running = null;
    this.lastRefreshAt = -Infinity;
    this.refreshTimer = null;
    this.stopped = false;
    // Keys of the failures already logged, so a repeated one is not logged again.
    this.failing = new Set();
  }

  /** Log a failure once (warn or error), then at debug until `recovered(key)`. */
  failed(key, level, message, err) {
    const details = err ? [message, err] : [message];
    if (this.failing.has(key)) {
      logger.debug(...details);
      return;
    }
    this.failing.add(key);
    logger[level](...details);
  }

  /** One line when a failure logged by `failed(key)` is over. */
  recovered(key, message) {
    if (this.failing.delete(key)) {
      logger.info(message);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    this.config = config;
    const saved = await this.store.load();
    if (saved?.version === 1) {
      this.data = { ...emptyData(), ...saved };
    }
    await this.resolve();
    await this.publishDiscovered();
    await this.updateConnectionStatus();
    logger.info(
      `Started: ${this.followed().length} station(s) followed, refreshed every ${config.refreshMinutes} min`,
    );
    this.schedule();
    this.runCycle();
  }

  /** Reconnection: Gladys may have restarted, publish everything again. */
  async resync(config) {
    this.config = config;
    await this.publishDiscovered();
    this.statusMessage = undefined;
    await this.updateConnectionStatus();
    this.gladys.forgetPublishedStates?.();
    await this.publishStates(this.created());
    this.requestRefresh();
  }

  async reconfigure(config) {
    const before = this.followed().join(',');
    this.config = config;
    this.data.home = null;
    this.resolved = false;
    await this.resolve();
    await this.publishDiscovered();
    await this.updateConnectionStatus();
    const after = this.followed();
    if (after.join(',') !== before) {
      logger.info(`Configuration saved: ${after.length} station(s) followed`);
    }
    this.schedule();
    this.lastVigilanceTry = -Infinity;
    await this.runCycle();
    this.requestRefresh();
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.cycleTimer);
    clearTimeout(this.refreshTimer);
    this.cycleTimer = null;
    await this.running?.catch(() => {});
    await this.store.flush();
  }

  schedule() {
    if (!this.timers || this.stopped) {
      return;
    }
    clearInterval(this.cycleTimer);
    this.cycleTimer = setInterval(() => this.runCycle(), this.config.refreshMinutes * MINUTE);
    this.cycleTimer.unref?.();
  }

  save() {
    return this.store.save(this.data);
  }

  // --- Which stations ----------------------------------------------------------

  /** Station codes whose device exists in Gladys. */
  created() {
    return [
      ...new Set(
        (this.gladys.devices ?? [])
          .map((device) => stationCodeOfId(this.gladys, device.external_id))
          .filter(Boolean),
      ),
    ];
  }

  isCreated(code) {
    const id = stationIds(this.gladys, code).device;
    return (this.gladys.devices ?? []).some((device) => device.external_id === id);
  }

  /** Every followed station: the configured ones, then the created ones. */
  followed() {
    return [...new Set([...this.configured, ...this.created()])];
  }

  /** What the integration knows of a station, a created device filling the gaps. */
  station(code) {
    const known = this.data.stations[code];
    if (known) {
      return { ...known, sections: this.data.sections[code]?.sections ?? [] };
    }
    const device = (this.gladys.devices ?? []).find(
      (item) => stationCodeOfId(this.gladys, item.external_id) === code,
    );
    const param = (name) => device?.params?.find((p) => p.name === name)?.value;
    const featureKeys = (device?.features ?? []).map((f) => f.external_id.split(':').pop());
    return {
      code,
      name: device?.name ?? code,
      river: param('RIVER') ?? null,
      hasFlow: featureKeys.includes('flow'),
      sections: this.data.sections[code]?.sections ?? [],
    };
  }

  /**
   * Resolve the configuration into station codes, with their name, flow and
   * Vigicrues section. A Hub'Eau or Vigicrues failure keeps what is cached and
   * is tried again at the next cycle.
   */
  async resolve() {
    const problems = { unknown: [], noHouse: false, tooMany: false };
    const codes = [];
    let complete = true;
    const add = (code) => {
      if (!codes.includes(code)) {
        codes.push(code);
      }
    };
    try {
      for (const code of this.config.stationCodes) {
        if (await this.knownStation(code)) {
          add(code);
        } else {
          problems.unknown.push(code);
        }
      }
      for (const commune of this.config.communeCodes) {
        const stations = (await this.departmentStations(departmentOf(commune))).filter(
          (station) => station.communeCode === commune,
        );
        if (stations.length === 0) {
          problems.unknown.push(commune);
        }
        for (const station of stations) {
          if (await this.knownStation(station.code, station)) {
            add(station.code);
          }
        }
      }
      if (this.config.homeRadiusKm > 0) {
        const home = await this.homeStations();
        if (home === null) {
          problems.noHouse = true;
        } else {
          home.forEach(add);
        }
      }
      // Stations only followed through their device: their name and flow too.
      for (const code of this.created()) {
        if (!this.data.stations[code]) {
          await this.knownStation(code);
        }
      }
      this.recovered('resolve', "Hub'Eau answers again: stations resolved");
    } catch (err) {
      complete = false;
      this.failed('resolve', 'warn', `Cannot resolve the stations yet: ${err.message}`);
    }
    if (codes.length > MAX_STATIONS) {
      problems.tooMany = true;
      codes.length = MAX_STATIONS;
    }
    // A failed resolution keeps the stations found before it.
    this.configured = complete ? codes : [...new Set([...this.configured, ...codes])];
    this.problems = complete ? problems : { ...this.problems, ...problems };
    this.resolved = complete;
    for (const code of problems.unknown) {
      this.failed(`unknown:${code}`, 'warn', `Unknown station or commune code: ${code}`);
    }
    await this.lookupSections(this.followed());
    await this.save();
  }

  /**
   * Metadata of a station, from the cache or Hub'Eau; false when Hub'Eau does
   * not know it. `listed`: the station as a referential list already gave it.
   */
  async knownStation(code, listed = null) {
    const now = this.now();
    const cached = this.data.stations[code];
    if (cached && now - cached.fetchedAt < this.timings.metadataMaxAgeMs) {
      return true;
    }
    const unknownAt = this.data.unknown[code];
    if (!cached && unknownAt && now - unknownAt < this.timings.lookupRetryMs) {
      return false;
    }
    const station = listed ?? (await this.hubeau.station(code));
    if (!station) {
      this.data.unknown[code] = now;
      return false;
    }
    delete this.data.unknown[code];
    // The last readings say whether the station measures a flow.
    const latest = await this.hubeau.latest(code);
    this.data.stations[code] = {
      ...station,
      hasFlow: latest.Q.length > 0 || Boolean(cached?.hasFlow),
      fetchedAt: now,
    };
    this.foldSeries(code, latest, { trend: false });
    logger.debug(`Station ${code}: ${station.name}`);
    return true;
  }

  /** Stations in service of a department, cached a week (communes, search). */
  async departmentStations(department) {
    const cached = this.data.departments[department];
    if (cached && this.now() - cached.fetchedAt < this.timings.metadataMaxAgeMs) {
      return cached.stations;
    }
    const stations = await this.hubeau.stationsOfDepartment(department);
    this.data.departments[department] = { stations, fetchedAt: this.now() };
    return stations;
  }

  /** The first house of Gladys that has a location, or null. */
  async house() {
    try {
      const houses = await this.gladys.getHouses();
      return (
        houses.find(
          (house) => Number.isFinite(house.latitude) && Number.isFinite(house.longitude),
        ) ?? null
      );
    } catch (err) {
      this.failed('houses', 'warn', `Cannot read the houses of Gladys: ${err.message}`);
      return null;
    }
  }

  /**
   * The nearest stations around the house that sent a reading lately
   * (HOME_STATIONS at most), chosen again once a day; null without a located house.
   */
  async homeStations() {
    const radius = this.config.homeRadiusKm;
    const cached = this.data.home;
    if (
      cached &&
      cached.radiusKm === radius &&
      this.now() - cached.at < this.timings.homeMaxAgeMs
    ) {
      return cached.codes;
    }
    const house = await this.house();
    if (!house) {
      return null;
    }
    const candidates = (
      await this.hubeau.stationsInBox(boxAround(house.latitude, house.longitude, radius))
    )
      .filter((station) => station.latitude !== null && station.longitude !== null)
      .map((station) => ({
        station,
        km: distanceKm(house.latitude, house.longitude, station.latitude, station.longitude),
      }))
      .filter(({ km }) => km <= radius)
      .sort((a, b) => a.km - b.km)
      .slice(0, 30);
    const live = await this.hubeau.observations(
      candidates.map(({ station }) => station.code),
      this.now() - 6 * HOUR,
    );
    const codes = candidates
      .filter(({ station }) => live.get(station.code)?.H.length > 0)
      .slice(0, HOME_STATIONS)
      .map(({ station }) => {
        const series = live.get(station.code);
        this.data.stations[station.code] ??= {
          ...station,
          hasFlow: series.Q.length > 0,
          fetchedAt: this.now(),
        };
        return station.code;
      });
    // The house coordinates are not stored: only the radius and the stations.
    this.data.home = { radiusKm: radius, codes, at: this.now() };
    return codes;
  }

  /**
   * The Vigicrues sections of the stations, cached a week: station.json gives
   * the territory, TerEntVigiCru its sections, TronEntVigiCru their stations.
   */
  async lookupSections(codes) {
    const now = this.now();
    for (const code of codes) {
      const cached = this.data.sections[code];
      const age = cached ? now - cached.checkedAt : Infinity;
      if (cached?.sections && age < this.timings.metadataMaxAgeMs) {
        continue;
      }
      if (cached?.failedAt && now - cached.failedAt < this.timings.lookupRetryMs) {
        continue;
      }
      try {
        const sections = await this.findSections(code);
        this.data.sections[code] = { sections, checkedAt: now };
        this.recovered('sections', 'Vigicrues answers again: sections found');
        logger.debug(`Station ${code}: Vigicrues section(s) ${sections.join(', ') || 'none'}`);
      } catch (err) {
        this.data.sections[code] = { ...cached, failedAt: now };
        this.failed('sections', 'warn', `Cannot find the Vigicrues sections yet: ${err.message}`);
      }
    }
  }

  async findSections(code) {
    const territory = await this.vigicrues.territoryOfStation(code);
    if (!territory) {
      return [];
    }
    const now = this.now();
    let known = this.data.territories[territory];
    if (!known || now - known.fetchedAt >= this.timings.metadataMaxAgeMs) {
      known = { sections: await this.vigicrues.sectionsOfTerritory(territory), fetchedAt: now };
      this.data.territories[territory] = known;
    }
    const found = [];
    for (const section of known.sections) {
      let members = this.data.sectionStations[section];
      if (!members || now - members.fetchedAt >= this.timings.metadataMaxAgeMs) {
        await this.sleep(this.timings.requestSpacingMs);
        members = { stations: await this.vigicrues.stationsOfSection(section), fetchedAt: now };
        this.data.sectionStations[section] = members;
      }
      if (members.stations.includes(code)) {
        found.push(section);
      }
    }
    return found;
  }

  // --- Discovery and connection status -----------------------------------------

  discoveredDevices() {
    return this.followed().map((code) =>
      buildDevice(this.gladys, this.station(code), this.config.language),
    );
  }

  async publishDiscovered() {
    await this.gladys.publishDiscoveredDevices(this.discoveredDevices());
  }

  async updateConnectionStatus() {
    const { unknown, noHouse, tooMany } = this.problems;
    const parts = [];
    if (this.failing.has('readings') || (!this.resolved && this.failing.has('resolve'))) {
      parts.push(render(STATUS, 'hubeauDown'));
    }
    if (this.failing.has('vigilance')) {
      parts.push(render(STATUS, 'vigicruesDown'));
    }
    if (unknown.length > 0) {
      parts.push(render(STATUS, 'unknown', { codes: unknown.join(', ') }));
    }
    if (this.config.invalid.length > 0) {
      parts.push(render(STATUS, 'invalid', { values: this.config.invalid.join(', ') }));
    }
    if (noHouse) {
      parts.push(render(STATUS, 'noHouse'));
    }
    if (tooMany) {
      parts.push(render(STATUS, 'tooMany', { max: MAX_STATIONS }));
    }
    if (this.resolved && this.followed().length === 0 && unknown.length === 0 && !noHouse) {
      parts.push(render(STATUS, 'none'));
    }
    const message = parts.length > 0 ? join(...parts) : undefined;
    const connected = !this.failing.has('readings') && this.resolved;
    const key = JSON.stringify([connected, message]);
    if (key === this.statusMessage) {
      return;
    }
    this.statusMessage = key;
    await this.gladys.setConnectionStatus(connected, message).catch(() => {});
  }

  // --- Gladys events -----------------------------------------------------------

  async onDeviceCreated(device) {
    const code = stationCodeOfId(this.gladys, device.external_id);
    if (!code) {
      return;
    }
    if (!this.data.readings[code]) {
      await this.runCycle();
    }
    // The SDK forgot the states of the device: everything is published again.
    await this.publishStates([code]);
    this.requestRefresh();
  }

  async onDeviceDeleted() {
    // A station only followed through its device is no longer followed.
    await this.publishDiscovered();
    this.requestRefresh();
  }

  /** onPoll fallback: should_poll is false, but a Gladys polling anyway gets an answer. */
  async poll(device) {
    const code = stationCodeOfId(this.gladys, device.external_id);
    if (!code) {
      return;
    }
    // Read again only if the last cycle is older than half the interval.
    if (this.now() - this.lastCycleAt >= (this.config.refreshMinutes * MINUTE) / 2) {
      await this.runCycle();
    } else {
      await this.publishStates([code]);
    }
  }

  // --- Cycles ------------------------------------------------------------------

  runCycle() {
    if (this.running || this.stopped) {
      return this.running;
    }
    this.running = this.cycle()
      .then(() => this.recovered('cycle', 'Refresh cycles work again'))
      .catch((err) => this.failed('cycle', 'error', 'Refresh cycle failed', err))
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  async cycle() {
    this.lastCycleAt = this.now();
    // Cheap when the caches are fresh: the house stations are chosen again once
    // a day, the metadata once a week, a failed resolution at the next cycle.
    const before = this.discoveredKey();
    await this.resolve();
    if (this.discoveredKey() !== before) {
      await this.publishDiscovered();
    }
    const codes = this.followed();
    let changed = await this.refreshReadings(codes);
    const withSection = codes.some((code) => this.station(code).sections.length > 0);
    if (
      withSection &&
      this.now() - this.lastVigilanceTry >= this.timings.vigilanceEveryMs - MINUTE
    ) {
      changed = (await this.refreshVigilance()) || changed;
    }
    await this.publishStates(this.created());
    await this.updateConnectionStatus();
    await this.save();
    logger.debug(`Refresh cycle: ${codes.length} station(s)`);
    if (changed) {
      this.requestRefresh();
    }
  }

  discoveredKey() {
    return JSON.stringify(this.discoveredDevices());
  }

  readingOf(code) {
    this.data.readings[code] ??= { H: null, Q: null, trend: null, latestAskedAt: null };
    return this.data.readings[code];
  }

  /** Fold Hub'Eau series (newest first) into the last reading of a station. */
  foldSeries(code, series, { trend = true } = {}) {
    const reading = this.readingOf(code);
    let changed = false;
    if (series.H.length > 0 && series.H[0].t >= (reading.H?.t ?? -Infinity)) {
      changed ||= reading.H?.t !== series.H[0].t || reading.H?.v !== series.H[0].v;
      reading.H = series.H[0];
      if (trend) {
        const next = trendOf(series.H);
        changed ||= next !== reading.trend;
        reading.trend = next;
      }
    }
    if (series.Q.length > 0 && series.Q[0].t >= (reading.Q?.t ?? -Infinity)) {
      changed ||= reading.Q?.t !== series.Q[0].t || reading.Q?.v !== series.Q[0].v;
      reading.Q = series.Q[0];
    }
    return changed;
  }

  /** Last reading time of a station (ms), or null. */
  lastReadingAt(code) {
    const reading = this.data.readings[code];
    const times = [reading?.H?.t, reading?.Q?.t].filter((t) => typeof t === 'number');
    return times.length > 0 ? Math.max(...times) : null;
  }

  isFresh(time) {
    return typeof time === 'number' && this.now() - time <= this.timings.staleAfterMs;
  }

  /** Read the stations from Hub'Eau; resolves true when a reading changed. */
  async refreshReadings(codes) {
    if (codes.length === 0) {
      return false;
    }
    let observations;
    try {
      observations = await this.hubeau.observations(codes, this.now() - this.timings.windowMs);
      this.recovered('readings', "Hub'Eau answers again");
    } catch (err) {
      this.failed('readings', 'warn', `Hub'Eau unreachable: ${err.message}`);
      return false;
    }
    let changed = false;
    let structure = false;
    for (const code of codes) {
      const series = observations.get(code) ?? { H: [], Q: [] };
      changed = this.foldSeries(code, series) || changed;
      if (series.Q.length > 0 && this.data.stations[code] && !this.data.stations[code].hasFlow) {
        // A flow appeared: the device gains its feature ("Update" in Discovery).
        this.data.stations[code].hasFlow = true;
        structure = true;
      }
    }
    // Stations without a recent reading: their last one, a month back at most.
    for (const code of codes) {
      const reading = this.readingOf(code);
      if (this.isFresh(this.lastReadingAt(code))) {
        continue;
      }
      if (
        reading.latestAskedAt !== null &&
        this.now() - reading.latestAskedAt < this.timings.latestRetryMs
      ) {
        continue;
      }
      reading.latestAskedAt = this.now();
      try {
        changed =
          this.foldSeries(code, await this.hubeau.latest(code), { trend: false }) || changed;
      } catch (err) {
        logger.debug(`Last reading of ${code} unavailable: ${err.message}`);
      }
    }
    for (const code of codes) {
      changed = this.noteSilence(code) || changed;
    }
    if (structure) {
      await this.publishDiscovered();
    }
    return changed;
  }

  /** One info line when a station goes silent, one when it comes back. */
  noteSilence(code) {
    const reading = this.readingOf(code);
    const silent = !this.isFresh(this.lastReadingAt(code));
    if (silent === reading.silent) {
      return false;
    }
    const wasKnown = reading.silent !== undefined;
    reading.silent = silent;
    if (silent) {
      reading.trend = null;
    }
    const name = this.station(code).name;
    if (!wasKnown) {
      logger.debug(`${name}: ${silent ? 'no recent reading' : 'readings are fresh'}`);
    } else if (silent) {
      logger.info(`${name}: no new reading for ${this.timings.staleAfterMs / HOUR} hours`);
    } else {
      logger.info(`${name}: readings are back`);
    }
    return true;
  }

  /** Read the vigilance; fire the triggers of the levels that changed. */
  async refreshVigilance() {
    this.lastVigilanceTry = this.now();
    let vigilance;
    try {
      vigilance = await this.vigicrues.vigilance();
      this.recovered('vigilance', 'Vigicrues answers again');
    } catch (err) {
      this.failed('vigilance', 'warn', `Vigicrues vigilance unavailable: ${err.message}`);
      return false;
    }
    this.vigilance = { ...vigilance, fetchedAt: this.now() };
    logger.debug(`Vigilance ${vigilance.reference ?? '?'}: ${vigilance.sections.size} section(s)`);
    let changed = false;
    for (const code of this.followed()) {
      const current = this.levelOf(code);
      if (!current) {
        continue;
      }
      const previous = this.data.levels[code];
      this.data.levels[code] = {
        level: current.level,
        section: current.section.code,
        at: this.now(),
      };
      if (
        !previous ||
        previous.level === current.level ||
        this.now() - previous.at > this.timings.levelMemoryMs
      ) {
        continue;
      }
      changed = true;
      await this.levelChanged(code, previous.level, current);
    }
    return changed;
  }

  /** The vigilance of a station: its highest section, or null if unknown. */
  levelOf(code) {
    if (!this.vigilance) {
      return null;
    }
    let best = null;
    for (const sectionCode of this.station(code).sections) {
      const section = this.vigilance.sections.get(sectionCode);
      if (section && (!best || section.level > best.level)) {
        best = { level: section.level, section };
      }
    }
    return best;
  }

  async levelChanged(code, previousLevel, current) {
    const station = this.station(code);
    const from = VIGILANCE_LEVELS[previousLevel].key;
    const to = VIGILANCE_LEVELS[current.level].key;
    logger.info(
      `${station.name}: flood vigilance ${from} -> ${to} (${current.section.code} ${current.section.name})`,
    );
    const key =
      current.level > previousLevel
        ? current.level >= 2
          ? TRIGGERS.RAISED
          : null
        : TRIGGERS.LOWERED;
    if (!key || !this.isCreated(code)) {
      return;
    }
    const names = COLOR_NAMES[this.config.language];
    await this.gladys
      .publishSceneEvent(key, {
        station: stationIds(this.gladys, code).device,
        station_name: station.name,
        river: station.river ?? null,
        section: current.section.code,
        section_name: current.section.name,
        color: to,
        color_name: names[to],
        previous_color: from,
        previous_color_name: names[from],
      })
      .catch((err) => logger.warn(`${key} event refused: ${err.message}`));
  }

  // --- States ------------------------------------------------------------------

  /** The states of the given stations whose device exists. */
  statesOf(codes) {
    const states = [];
    const language = this.config.language;
    for (const code of codes) {
      if (!this.isCreated(code)) {
        continue;
      }
      const ids = stationIds(this.gladys, code);
      const station = this.station(code);
      const reading = this.data.readings[code];
      if (reading?.H && this.isFresh(reading.H.t)) {
        states.push({ device_feature_external_id: ids.height, state: reading.H.v });
      }
      if (station.hasFlow && reading?.Q && this.isFresh(reading.Q.t)) {
        states.push({ device_feature_external_id: ids.flow, state: reading.Q.v });
      }
      const last = this.lastReadingAt(code);
      if (last !== null) {
        const date = formatDate(last, language);
        states.push({
          device_feature_external_id: ids.lastReading,
          text: this.isFresh(last) ? date : READINGS[language].staleSince({ date }),
        });
      } else if (reading?.latestAskedAt) {
        states.push({ device_feature_external_id: ids.lastReading, text: READINGS[language].none });
      }
      const level = this.vigilanceFresh() ? this.levelOf(code) : null;
      if (level && station.sections.length > 0) {
        const { gladys: value, key } = VIGILANCE_LEVELS[level.level];
        states.push(
          { device_feature_external_id: ids.vigilance, state: value },
          { device_feature_external_id: ids.vigilanceColor, text: COLOR_NAMES[language][key] },
        );
      }
    }
    return states;
  }

  vigilanceFresh() {
    return Boolean(
      this.vigilance && this.now() - this.vigilance.fetchedAt <= this.timings.vigilanceMaxAgeMs,
    );
  }

  async publishStates(codes) {
    const states = this.statesOf(codes);
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.recovered('publish', 'Publishing the states works again');
    } catch (err) {
      // Sent again at the next cycle (the SDK forgets what Gladys refused).
      this.failed('publish', 'warn', `Publishing the states failed: ${err.message}`);
    }
  }

  // --- Widget -------------------------------------------------------------------

  requestRefresh() {
    if (this.stopped) {
      return;
    }
    const now = this.now();
    const wait = this.lastRefreshAt + this.timings.widgetRefreshMs - now;
    if (wait <= 0) {
      this.lastRefreshAt = now;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } else if (this.timers && !this.refreshTimer) {
      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = null;
        this.requestRefresh();
      }, wait);
      this.refreshTimer.unref?.();
    }
  }

  /** What the widget shows of one station. */
  view(code) {
    const station = this.station(code);
    const reading = this.data.readings[code];
    const last = this.lastReadingAt(code);
    const fresh = this.isFresh(last);
    const level = this.vigilanceFresh() ? this.levelOf(code) : null;
    return {
      code,
      name: station.name,
      river: station.river ?? null,
      hasFlow: Boolean(station.hasFlow),
      height: fresh && reading?.H && this.isFresh(reading.H.t) ? reading.H.v : null,
      flow: fresh && reading?.Q && this.isFresh(reading.Q.t) ? reading.Q.v : null,
      trend: fresh ? (reading?.trend ?? null) : null,
      lastReadingAt: last,
      fresh,
      level: level?.level ?? null,
      section: level?.section ?? null,
      hasSection: station.sections.length > 0,
    };
  }

  /** The time of the newest data shown (reading or vigilance), for the attribution. */
  updatedAt(codes) {
    const times = codes.map((code) => this.lastReadingAt(code)).filter((t) => t !== null);
    if (this.vigilance?.issuedAt) {
      times.push(this.vigilance.issuedAt);
    }
    return times.length > 0 ? Math.max(...times) : null;
  }

  // --- Search -------------------------------------------------------------------

  /** Stations matching the words (accents and case ignored). */
  static matches(station, words) {
    const haystack = normalize(`${station.name} ${station.commune ?? ''} ${station.river ?? ''}`);
    return words.every((word) => haystack.includes(normalize(word)));
  }
}

function emptyData() {
  return {
    version: 1,
    stations: {},
    unknown: {},
    departments: {},
    sections: {},
    territories: {},
    sectionStations: {},
    home: null,
    readings: {},
    levels: {},
  };
}
