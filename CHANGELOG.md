# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.2.0] - 2026-10-14

### Added

- Vigicrues forecasts, for the stations Vigicrues forecasts (Loire at Montjean-sur-Loire, for
  example): the peak expected over the horizon in its central, low and high scenarios (the 80 %
  range of Vigicrues) with its time, the height expected in 24 hours in the same three
  scenarios, and the production date of the forecast. The same for the flow when Vigicrues
  forecasts it too, in the flow unit of the settings. Read every 30 minutes.
- An alert on a forecast uses the native "Device state change" trigger of Gladys on a forecast
  feature, with "only when the threshold is crossed": the documentation gives the scene
  ("high forecast above 4.5 m → message").
- The station detail of the widget shows the forecast peak, its range and its time.

### Changed

- Existing devices of a forecast station gain the forecast features through "Update" in the
  Discover tab; their other features keep their identifiers and history. Stations without
  forecast do not change.

## [1.1.0] - 2026-10-13

### Added

- "House" setting: the house of Gladys whose location "Around my house" and "Find stations"
  use. Empty keeps the former behaviour (the first house that has a location); a chosen house
  without a location, or deleted since, is named in the Configuration screen.
- "Flow unit" setting: m³/h (default) or m³/s.

### Changed

- The flow is published in m³/h by default, with the Gladys unit, so every Gladys screen shows
  it ("10.1" alone before). Existing devices keep m³/s until "Update" in the Discover tab;
  choose m³/s in the settings to keep the Vigicrues unit.
- Requires Gladys 5.2.0 or later (house selection in the configuration).

## [1.0.1] - 2026-10-13

### Added

- One Gladys device per French gauging station: water height (m), flow (m³/s) when the station
  measures one, the flood vigilance of its Vigicrues section (Gladys risk badge, and the colour
  as text) and the date of the last reading. A station without a new reading for 3 hours says
  "No new reading since…" instead of showing an old value as fresh.
- Stations chosen by code (or Vigicrues page address), by INSEE commune code, or the 3 nearest
  ones around the house (5, 10 or 20 km).
- "Find stations" in the Configuration screen: stations in service around the house, in a
  commune or a department, with their river, distance and whether they send readings.
- Scene triggers "Flood vigilance raised" and "Flood vigilance lowered", filtered by station,
  section and colour.
- Dashboard widget "Vigicrues": followed stations with height, trend and vigilance colour, or
  the detail of one station.
- Refresh every 15, 20 or 30 minutes by the integration itself (one Hub'Eau request for all the
  stations, the vigilance every 30 minutes), without relying on Gladys polling.
- English, French, German and Spanish texts and documentation.

[Unreleased]: https://github.com/guim31/gladys-vigicrues/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/guim31/gladys-vigicrues/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/guim31/gladys-vigicrues/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/guim31/gladys-vigicrues/releases/tag/v1.0.1
