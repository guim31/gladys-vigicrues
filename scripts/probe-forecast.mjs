#!/usr/bin/env node
// -----------------------------------------------------------------------------
// Read-only probe of the Vigicrues forecast of one station, through the very
// client and summary the integration uses:
//
//   node scripts/probe-forecast.mjs M530001010          what would be published
//   node scripts/probe-forecast.mjs M530001010 --raw H  the raw answer (H or Q),
//                                                       to record as a fixture
//
// Two GET requests to www.vigicrues.gouv.fr (GrdSerie=H, then Q), nothing
// written anywhere.
// -----------------------------------------------------------------------------

import { stationCodeOf } from '../src/config.js';
import { getJson } from '../src/http.js';
import { formatDate } from '../src/messages.js';
import { VIGICRUES_BASE, Vigicrues, summarizeForecast } from '../src/vigicrues.js';

const [input, flag, rawSeries = 'H'] = process.argv.slice(2);
const code = input ? stationCodeOf(input) : null;
if (!code) {
  console.error('Usage: node scripts/probe-forecast.mjs <CdStationHydro> [--raw H|Q]');
  process.exit(2);
}

if (flag === '--raw') {
  const query = new URLSearchParams({
    CdStationHydro: code,
    GrdSerie: rawSeries,
    FormatSortie: 'json',
  });
  const body = await getJson(fetch, `${VIGICRUES_BASE}/previsions.json/index.php?${query}`);
  console.log(JSON.stringify(body, null, 2));
  process.exit(0);
}

const date = (time) => (time === null ? '-' : formatDate(time, 'fr'));
const scenarios = (point) =>
  point ? `${point.mid} (low ${point.low ?? '-'}, high ${point.high ?? '-'})` : '-';

const vigicrues = new Vigicrues();
const now = Date.now();
for (const series of ['H', 'Q']) {
  const forecast = await vigicrues.forecast(code, series);
  console.log(`\n${code} GrdSerie=${series}`);
  if (!forecast) {
    console.log('  no forecast (error envelope, "no content" or no point)');
    continue;
  }
  if (forecast.series !== series) {
    console.log(`  answered GrdSimul=${forecast.series}: no ${series} forecast for this station`);
    continue;
  }
  const first = forecast.points[0];
  const last = forecast.points.at(-1);
  console.log(`  issued        ${date(forecast.issuedAt)}`);
  console.log(`  points        ${forecast.points.length}, ${date(first.t)} to ${date(last.t)}`);
  const summary = summarizeForecast(forecast, now);
  if (!summary) {
    console.log('  every point is past: nothing would be published');
    continue;
  }
  const unit = series === 'H' ? 'm' : 'm³/s';
  console.log(`  peak (${unit})     ${scenarios(summary.peak)} at ${date(summary.peak.t)}`);
  console.log(`  in 24 h (${unit})  ${scenarios(summary.in24h)}`);
}
