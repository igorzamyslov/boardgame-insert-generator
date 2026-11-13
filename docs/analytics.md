# Analytics (GoatCounter)

The app counts visits and a few events anonymously, with [GoatCounter](https://www.goatcounter.com).
It sets no cookie and keeps no IP address, so no consent banner is needed. Why and what exactly
leaves: [DESIGN.md](DESIGN.md), decision log 2026-11-13. The code is `src/app/analytics.ts`.

## Switching it on (owner steps)

1. Create a site at goatcounter.com (free for non-commercial use). Pick a site code, for example
   `insert-generator`; the dashboard is then `https://<code>.goatcounter.com`.
2. In the site's settings, allow the address the app is served from, `igorzamyslov.github.io`
   (Settings → Site → "Allowed domains"), so counts from other places are dropped.
3. In the GitHub repository: Settings → Secrets and variables → Actions → **Variables** →
   New repository variable `GOATCOUNTER_CODE` with the site code. It is not a secret.
4. Run the Deploy workflow (or merge to `main`). The build reads the variable as
   `VITE_GOATCOUNTER_CODE`.

Without the variable nothing is loaded or sent: local runs, tests, CI and forks stay silent. To try
it on your machine, build with the variable set and serve over a real host name; localhost is never
counted.

## What is counted

| Name                                                            | When                                                                        |
| --------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `/` (a page view)                                               | The app opens. Carries the referrer and the screen size (phone or desktop). |
| `start-example`                                                 | "Start from an example game" on the first visit                             |
| `add-cards`, `add-bulk`, `add-tiles`, `add-minis`, `add-custom` | A kind of item was added: which kinds people use                            |
| `plan`                                                          | A project gets its first plan (once per project)                            |
| `plan-nofit`                                                    | A search ended with no plan that fits: how often the engine fails           |
| `view-3d`                                                       | The 3D view was opened                                                      |
| `settings-open`                                                 | The settings were opened                                                    |
| `build-failed`                                                  | A print file could not be built                                             |
| `download-3mf`, `download-zip`, `download-stl`                  | A print file was built and handed to the browser, by its format             |
| `guide`                                                         | The packing guide opened                                                    |
| `file-save`                                                     | The project file was saved (or sent from a phone)                           |
| `file-open`, `file-open-failed`                                 | A project file was opened, or could not be read                             |

Events show in GoatCounter's dashboard under the page list, marked as events. Nothing else leaves:
no project, name, size or typed text. Do Not Track and Global Privacy Control send nothing.

To add an event: add its name to `COUNT_EVENTS`, call `count("name")` at the one place it happens,
test that it fires once, add it here and add it to the decision-log row.
