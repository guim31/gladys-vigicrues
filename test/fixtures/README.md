# Test fixtures

## `gladys-feature-table.json`

The category/type couples, units and poll frequencies the Gladys core (5.2.x) knows, extracted
from its code. Used by `test/gladys-rules.test.js`.

## `hubeau/` and `vigicrues/`: recorded answers of the real services

The Hub'Eau and Vigicrues hosts were not reachable from the development session (its network
policy denied them). These files are **real answers of the live services**, recorded by others
in September and October 2026 and published on GitHub, then trimmed as listed below. The data
is public, under the Licence Ouverte / Open Licence Etalab 2.0 (© VIGICRUES, Hub'Eau). JSON
files are re-indented; Prettier leaves both folders alone (`.prettierignore`).

| File                                                             | Request                                                                                  | Recorded             | Trimmed                                                                                                                            |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `hubeau/stations.json`                                           | `api/v2/hydrometrie/referentiel/stations?code_station=B*&format=json`                    | 2026-09-29 13:45 UTC | the stations of the Ardennes (08), plus Stenay (55); the keys the integration asks with `fields=`                                  |
| `hubeau/observations-2026-09-29.json`                            | `api/v2/hydrometrie/observations_tr?code_entite=A*,B*,D*,E1*,E2*,E3*&date_debut_obs=…`   | 2026-09-29 13:43 UTC | the rows of those stations and of their sites (`code_station: null`); `code_station`, `grandeur_hydro`, `date_obs`, `resultat_obs` |
| `hubeau/empty.json`                                              | `observations_tr`, a cursor past the last page                                           | 2026-09-30 12:03 UTC | verbatim                                                                                                                           |
| `vigicrues/station-B540001001.json` (and B720000001, B315002001) | `services/station.json/index.php?CdStationHydro=…`                                       | 2026-09-29/30        | verbatim                                                                                                                           |
| `vigicrues/territory-2.json`                                     | `services/TerEntVigiCru.json?CdEntVigiCru=2&TypEntVigiCru=5`                             | 2026-09-29 13:43 UTC | verbatim                                                                                                                           |
| `vigicrues/section-LO18.json`, `section-SA16.json`               | `services/TronEntVigiCru.json?CdEntVigiCru=…&TypEntVigiCru=8`                            | 2026-09-29, 10-02    | verbatim                                                                                                                           |
| `vigicrues/vigilance-2026-10-13.geojson`                         | `services/InfoVigiCru.geojson` (every section green that day)                            | 2026-10-13 16:39 UTC | `geometry` set to `null` (2.2 MB of river lines the integration drops)                                                             |
| `vigicrues/vigilance-2023-12-11.geojson`                         | `services/1/InfoVigiCru.geojson`, Wayback Machine capture of 2023-12-11 (yellow, orange) | 2026-10-03           | the 37 complete features of a capture cut at 1 MiB; `geometry` set to `null`; older property casing                                |

Sources of the recordings: the captures of
[mwijkhuisen/Waterheight](https://github.com/mwijkhuisen/Waterheight) (Hub'Eau, Vigicrues
referential, 2023 vigilance) and the mirror of the official vigilance file kept by
[PierreGuer1/bulletin-data](https://github.com/PierreGuer1/bulletin-data) (branch
`vigilance-data`). Only the recorded service answers are reused, not their code.

## Synthetic files

Built by hand, from the envelope of a real answer, where no recording exists:

- `vigicrues/section-LO17.synthetic.json`, `section-LO16.synthetic.json`: the sections of
  Charleville-Mézières (with Sedan and Aiglemont) and Stenay, envelope of `section-LO18.json`.
  The membership is an assumption, from the section names and the river.
- In `test/helpers/world.js`, the other sections of territory 2 are served as the LO18 envelope
  without stations, and the error envelope of an unknown station is the one Vigicrues serves for
  a station without forecasts (`{"error_msg": …, "code": 400}`, HTTP 200).
