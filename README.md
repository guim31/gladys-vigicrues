# Vigicrues for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com) that brings the
official French **flood vigilance** ([Vigicrues](https://www.vigicrues.gouv.fr)) and the
**height and flow of the rivers** near your home ([Hub'Eau
Hydrométrie](https://hubeau.eaufrance.fr/page/api-hydrometrie)) into Gladys. Public open data,
no account, no key.

> **A complement, not a safety alert system.** Data can be late, missing or wrong. In a flood,
> follow the official instructions. Not affiliated with the French government (Vigicrues,
> SCHAPI) nor with Hub'Eau.

## Features

- **One device per gauging station**: water height (m), flow (m³/h, or m³/s by choice) when the station measures
  one, the flood vigilance of its river section (green, yellow, orange, red, shown as the Gladys
  risk badge) and the date of the last reading. A station that stops sending says so ("No new
  reading since…") instead of showing an old value as a fresh one.
- **Stations by code, by commune or around your house** (the 3 nearest ones that send readings,
  from the location of your house in Gladys).
- **"Find stations"** in the Configuration screen: the stations in service around your house, in
  a commune or a department ("31 Toulouse"), with their river, distance and whether they send.
- **Scene triggers**: _Flood vigilance raised_ (yellow, orange, red) and _Flood vigilance
  lowered_, filtered by station, section and colour, with the names of the station, river,
  section and colours as variables. A height threshold stays a scene condition on the state.
- **Dashboard widget**: the followed stations with their height, trend (rising, steady, falling)
  and vigilance colour, or the detail of one station with live tiles.
- Texts in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.2.0** or later (widgets, scene triggers, house selection in the configuration).
- Internet access from Gladys to `hubeau.eaufrance.fr` and `www.vigicrues.gouv.fr`.
- For "around my house": the location of your house in Gladys. The integration declares
  `location: true`, shown on the install screen.
- Vigilance: mainland France. Hub'Eau stations overseas get heights and flows only.

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-vigicrues` (or install it from the catalog once it is
   listed). The install screen shows the **location** access it asks for.
2. In **Configuration**, press **Find stations**, copy the codes you want into **Station
   codes** (or fill in **Communes**, or choose **Around my house**), then save.
3. Open the **Discover** tab and press **Add to Gladys** on the stations you want.

The user guide is in [`docs/en.md`](docs/en.md) ([français](docs/fr.md), [Deutsch](docs/de.md),
[español](docs/es.md)); Gladys links it from the Configuration screen.

## How it works

```
Integration container ──HTTPS──▶ hubeau.eaufrance.fr   referential + real-time readings
                      ──HTTPS──▶ www.vigicrues.gouv.fr  vigilance per section + sections' stations
      │ SDK (WebSocket + host API)
      ▼
Gladys core ── devices, states, scene events, widget
```

- Devices are published with `should_poll: false` (the core does not poll external devices
  reliably, GladysAssistant/Gladys#3198): the integration refreshes itself, every 15, 20 or 30
  minutes, with **one** Hub'Eau request for all the stations; the vigilance file (2.2 MB) is
  read every 30 minutes, the Vigicrues referential once a week.
- Forecasts (`previsions.json/index.php`, asked directly: the folder URL answers an HTML
  redirect): read every 30 minutes for the stations that have one, every 6 hours for the
  others. Published per station: the peak ahead (central, low and high bound of the 80 % range)
  and its time, the value in 24 hours in the same three scenarios, the production date; the
  flow only when Vigicrues forecasts it (`GrdSimul` is checked: a height-only station answers a
  flow request with its height). A threshold on them is the native "device state" trigger of
  Gladys with "only when crossed", so there is no forecast trigger of the integration.
  `node scripts/probe-forecast.mjs <code>` shows what a station would publish (read-only).
- Hub'Eau gives heights in mm and flows in l/s: they are converted to m and m³/s, the units of
  vigicrues.gouv.fr. Gladys has no m³/s unit: by default the flow is published in m³/h, the one
  flow unit of the core; with `flow_unit: m3s` the feature has no unit and its name says it.
  The states follow the unit of the feature as created in Gladys until the device is updated.
- The section of a station is found from Vigicrues: `station.json` gives its territory,
  `TerEntVigiCru` the sections of the territory, `TronEntVigiCru` their stations (the upward link
  of a station only holds a placeholder).
- Only the changes are published, plus a heartbeat every 12 hours. After 3 hours without a new
  reading the height and flow are no longer sent: Gladys shows their real age.
- `/data/vigicrues.json` keeps what was learnt about the stations, the last readings and the
  last vigilance levels (so a change during a restart still fires its trigger). Never the house
  coordinates.

## Limitations

- **Not a safety alert system.** No guarantee of delay or availability.
- Tested against **real recorded answers** of Hub'Eau and Vigicrues (September and October
  2026), not against the live services from the development environment, nor on a live Gladys:
  feedback welcome.
- Heights are stages above each gauge zero: not comparable between stations, not altitudes.
- Real-time readings are raw; some stations send once an hour, up to about 75 minutes late.
- The overseas vigilance is not read. Forecasts are those of Vigicrues (80 % range).
- 20 stations at most from the configuration (plus the ones whose device you created).

## Development

Node.js 22+, ESM, no build step. The only runtime dependency is
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

```bash
npm install
npm test              # node --test, against the SDK's fake Gladys and recorded API answers
npm run lint
npm run format:check
npx github:GladysAssistant/integration-store --skip-image-check .   # store validator
```

```
index.js              SDK wiring (src/app.js registers the handlers)
src/app.js            handlers → monitor, configuration action, widget
src/monitor.js        followed stations, refresh cycles, states, vigilance triggers
src/hubeau.js         Hub'Eau client (referential, observations), units
src/vigicrues.js      Vigicrues client (vigilance, territories, sections)
src/http.js           GET JSON with timeout and User-Agent
src/search.js         "Find stations" action
src/devices.js        Gladys device of a station (features, names)
src/widgets.js        dashboard widget
src/messages.js       texts sent from the container, four languages
src/geo.js            distances
src/store.js          /data persistence
src/config.js         configuration defaults and normalization
test/fixtures/        recorded Hub'Eau and Vigicrues answers (see its README)
```

Versions are bumped by the **Release** workflow (Actions → Release), never by hand.

## Credits

- Data: **© VIGICRUES** (Service central d'hydrométéorologie et d'appui à la prévision des
  inondations) and **Hub'Eau** (OFB, BRGM), under the
  [Licence Ouverte / Open Licence Etalab 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/).
- [julcollas/hass-vigicrues](https://github.com/julcollas/hass-vigicrues), the Home Assistant
  integration (no licence file: read for the endpoints only, nothing copied).
- [mwijkhuisen/Waterheight](https://github.com/mwijkhuisen/Waterheight) for its research notes
  on Hub'Eau v2 and Vigicrues and its recorded answers, and
  [PierreGuer1/bulletin-data](https://github.com/PierreGuer1/bulletin-data) for its mirror of the
  vigilance file: real service answers reused as test fixtures (see
  [`test/fixtures/README.md`](test/fixtures/README.md)).

Not affiliated with the French government (Vigicrues, SCHAPI) nor with Hub'Eau. The VIGICRUES
name and logo are registered trademarks; the logo is not used.

## License

Apache-2.0, see [LICENSE](LICENSE).
