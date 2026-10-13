# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

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
