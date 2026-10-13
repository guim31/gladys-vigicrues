# Vigicrues

Brings the official French **flood vigilance** (Vigicrues) and the **height and flow of the
rivers** near your home into Gladys, from the public open data of Vigicrues and Hub'Eau. No
account, no key.

> **This is a complement, not a safety alert system.** Data can be late, missing or wrong, and
> the integration depends on your Gladys, your Internet access and two public services. In a
> flood, follow the official instructions (vigicrues.gouv.fr, the prefecture, your town hall,
> 112). This integration is not affiliated with the French government (Vigicrues, SCHAPI).

## What you get

- **One device per gauging station** you follow: water height in metres, flow in m³/s when
  the station measures one, the **flood vigilance** of its river section (green, yellow,
  orange, red) and the date of the last reading.
- A station that stops sending is shown as such ("No new reading since…"): an old value is
  never sent again as if it were fresh.
- Two **scene triggers**: "Flood vigilance raised" (yellow, orange or red) and "Flood
  vigilance lowered", filtered by station, section and colour.
- A **dashboard widget**: your stations, their height, its trend (rising, steady, falling) and
  the vigilance colour.
- A **"Find stations"** button that lists the stations around your house, in a commune or a
  department, with their river.

## Requirements

- Gladys Assistant **5.1.0** or later.
- Internet access from Gladys: the integration reads `hubeau.eaufrance.fr` and
  `www.vigicrues.gouv.fr`.
- For "around my house": the location of your house in Gladys (Settings, Houses). The
  integration asks for it at installation (the "location" permission); it is only used to
  find the nearest stations, never stored nor logged.
- Mainland France for the vigilance. Hub'Eau also covers the overseas departments: their
  stations get heights and flows, without vigilance.

## Configuration

### Settings

| Setting                       | What it does                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Station codes                 | Codes separated by commas (`O200004001, B540001001`), or the addresses of the station pages of vigicrues.gouv.fr.        |
| Communes (INSEE codes)        | Every station in service of these communes: `31555` for Toulouse, `75056` for Paris. The INSEE code is not the postcode. |
| Around my house               | Also follows the 3 nearest stations that send readings, within 5, 10 or 20 km of your house.                             |
| Refresh interval              | 15 (default), 20 or 30 minutes. The vigilance is read every 30 minutes.                                                  |
| Language of the feature names | Names of the features of new devices and language of their texts (colour, last reading). French by default.              |

At most 20 stations come from the configuration. Save, then open the **Discover** tab and
create the devices you want. A station whose device you created stays followed even if you
remove it from the settings: delete the device to stop.

### Finding your stations

The **Find stations** button of the configuration lists the stations in service, nearest
first, with their river, their distance and whether they sent a reading in the last hours.
Type, in the "Where" field:

- nothing: the stations around your house (10 km, or the chosen distance);
- an INSEE commune code: `31555`;
- a department and a name: `31 Toulouse`, `75 Seine`, `08 Meuse`;
- a station code: `O200004001`.

Copy the codes you want into **Station codes**, then save. The code of a station is also the
end of its page address on vigicrues.gouv.fr.

## Devices

One device per station, named like Hub'Eau names it ("La Meuse à Charleville-Mézières").
Its features are read-only:

| Feature          | Type (Gladys)            | Value                                                                                                                                 |
| ---------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Water height     | Liquid depth, in m       | Height at the gauge, above its zero: a negative value is normal at low water. Not an altitude.                                        |
| Flow (m³/s)      | Water flow, without unit | In cubic metres per second, like on vigicrues.gouv.fr (Gladys has no m³/s unit). Only when the station measures a flow.               |
| Flood vigilance  | Risk level               | The colour of the section of the station, as the Gladys risk badge: 0 green, 1 yellow, 2 orange, 3 red. Only for a Vigicrues station. |
| Vigilance colour | Text                     | Green, Yellow, Orange or Red.                                                                                                         |
| Last reading     | Text                     | Date of the last reading ("29/09 15:30"), or "No new reading since…" after 3 hours without one.                                       |

The height and the flow are only sent when they change, and once every 12 hours otherwise.
After 3 hours without a new reading they are no longer sent, so Gladys shows their real age.
A station that measures a flow later on gets the feature: the Discover tab then offers to
update the device.

## Dashboard widget

Add the **Vigicrues** widget to a dashboard.

- Without setting: one line per station (10 at most) with its height and trend, coloured by
  the vigilance of its section: green, yellow, red for orange and red (the widget palette
  has no orange, the heading gives the exact colour). Grey: no section, or no recent reading.
- With a station chosen: its height and flow tiles, live, then its vigilance with the name of
  the section, its trend and its last reading.

The widget ends with the source and its date, and a link to Vigicrues.

## Scene triggers

**Flood vigilance raised**: the section of a followed station goes to yellow, orange or red,
or to a higher colour. **Flood vigilance lowered**: it goes back to a lower colour.

Filters (all optional): the **station**, the **section** code (shown in the device
parameters, `VIGICRUES_SECTION`, e.g. `LO18`) and the **new colour**. Without a station
filter, a scene runs once per followed station of the section.

Variables for the actions: `station_name`, `river`, `section`, `section_name`, `color`
(`green`, `yellow`, `orange`, `red`), `color_name` (in the language of the settings),
`previous_color`, `previous_color_name`.

The triggers fire only for the stations whose device exists, never at the first reading, and
not after more than a day without vigilance (a restart, Vigicrues unreachable). A height
threshold is a scene condition on the "Water height" feature, not a trigger.

## Scene examples

- **Orange or red near home**: trigger "Flood vigilance raised", colour orange and red →
  send a message "Vigilance {{color_name}} on {{section_name}}: check vigicrues.gouv.fr" and
  turn a light red.
- **All clear**: trigger "Flood vigilance lowered", colour green → message "Back to green on
  {{section_name}}".
- **Height threshold**: trigger "Device state change" on "Water height" of your station,
  above 3.5 m → send a message to everyone at home.
- **Station silent**: none needed: the "Last reading" feature says it, shown on the dashboard.

## Data sources, licence and quotas

- **Vigicrues** (`www.vigicrues.gouv.fr/services`): the vigilance of every section
  (`InfoVigiCru.geojson`, about 2.2 MB, issued at least twice a day), read every 30 minutes,
  and the stations of each section (read once a week). © VIGICRUES.
- **Hub'Eau Hydrométrie** (`hubeau.eaufrance.fr/api/v2/hydrometrie`): the stations and their
  real-time readings, updated every 5 minutes from the national hydrometric platform, kept one
  month. One request per refresh for all your stations.
- Both are published under the **Licence Ouverte / Open Licence Etalab 2.0**: free reuse,
  citing the source and its date — the widget shows both.
- Neither service publishes a quota. The integration stays light: one Hub'Eau request per
  refresh (15 minutes at most), the vigilance every 30 minutes, the referential once a week,
  and it names itself in its requests. Hub'Eau may refuse abusive use: do not lower these
  delays.

## Troubleshooting

- **"Unknown station code"**: Hub'Eau does not know this code. Check it with "Find stations"
  or on vigicrues.gouv.fr (the end of the station page address).
- **No vigilance feature**: the station is not on a Vigicrues section (many small rivers are
  only measured), or Vigicrues did not answer when the device was published: the integration
  tries again every hour, then the Discover tab offers to update the device.
- **No flow feature**: the station measures only the height (Charleville-Mézières, for
  instance).
- **"No new reading since…"**: the station stopped sending (maintenance, failure, flood
  damage). Hub'Eau keeps one month: after that, "No reading for over a month".
- **"Hub'Eau does not answer"** or **"Vigicrues does not answer"** in the configuration: the
  service is down or Gladys has no Internet access. The values come back by themselves.
- **"Around my house"** does nothing: give your house a location in Gladys (Settings,
  Houses); the configuration screen says so.
- **Logs**: quiet by default (start, a station silent or back, a vigilance change, failures
  once). `LOG_LEVEL=debug` shows each refresh.

## Limits

- **Not a safety alert system**: a complement only, without any guarantee of delay or
  availability. The official instructions prevail.
- The vigilance covers mainland France only; the overseas services of Vigicrues are not read.
- The heights are stages above the gauge zero of each station: they cannot be compared from
  one station to another, nor with an altitude.
- Real-time readings are raw, not validated: outliers happen.
- Some stations send once an hour, up to about 75 minutes late.
- The forecasts of Vigicrues are not read.
- Tested against real answers of Hub'Eau and Vigicrues recorded in September and October
  2026, not yet on a live Gladys: feedback welcome.
- Not affiliated with the French government (Vigicrues, SCHAPI) nor with Hub'Eau.
