# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository. Human contributors follow the same rules.

## What this is

A Gladys Assistant **external integration** (Node 22+, ESM, no build step, one runtime
dependency: `@gladysassistant/integration-sdk`) for **Google Wifi, Nest Wifi (router) and OnHub**
Wi-Fi systems. Requires Gladys 5.3+ (manifest `keywords` and `countries`). It started from the
official [JavaScript template](https://github.com/GladysAssistant/integration-template-js); the
workflows mirror [prohand/gladys-devmel](https://github.com/prohand/gladys-devmel).

Two channels, declared as `transports: ["local", "cloud"]`:

- **local** — `GET http://<router>/api/v1/status`, unauthenticated, read-only (internet state,
  uptime, firmware, update, WAN address).
- **cloud** — the unofficial "Foyer" API of the Google Home app
  (`googlehomefoyer-pa.googleapis.com`), authenticated from a user-pasted Google refresh token
  (connected devices, throughput, speed test, pause, restart, light ring).

## Commands

```bash
npm install
npm test                                    # node --test (built-in runner)
node --test test/cloud.test.js              # one file
node --test --test-name-pattern "speed"     # tests whose name matches
npm run lint                                # eslint .
npm run format:check                        # prettier --check . (CI gate)
npm run format                              # prettier --write .
npx github:GladysAssistant/integration-store --skip-image-check .   # store admission checks
```

CI runs `format:check`, `lint`, `test` on Node 22 and 24, plus the store checks and a Docker
build on pull requests: run the three npm commands before pushing. Releases: **Actions → Release**
only (bumps `package.json`, manifest `version` + `docker_image`, rolls the changelog, tags,
builds, publishes the GitHub Release).

## Architecture

```
index.js                     start only: new GladysIntegration + App + registerHandlers + connect
src/wiring.js                every SDK handler (scan, setValue, actions, scenes, widgets, lifecycle)
src/app.js                   refresh timer; after each refresh publishes states, badges, events, status
src/config.js                DEFAULT_CONFIG (mirrors the manifest defaults) + normalization
src/i18n.js                  LANGUAGES = en, fr, de, es; pick / localize
src/googlewifi/local.js      local status page: fetch + tolerant parser
src/googlewifi/cloud.js      Foyer API client: 2-step token, parsers, commands, speed test
src/googlewifi/hub.js        reads both channels -> snapshot (+ previous) and inventory
src/googlewifi/models.js     hardwareId board -> commercial name (display only)
src/devices/                 router (local), network / accessPoint / client (cloud), features.js
src/capabilities/triggers.js scene events from snapshot transitions
src/capabilities/scenes.js   scene actions
src/capabilities/widgets.js  dashboard widgets (wifi_status, wifi_clients)
src/capabilities/actions.js  Configuration screen buttons
test/helpers/                fakeFetch (router + Google), fixtures, startApp (SDK fake Gladys)
.github/scripts/changelog-release.mjs   rolls [Unreleased] at release time (tested)
```

### Invariants worth knowing

- **External ids are forever**, built with `gladys.externalIds(type, platformId)` from Google's
  ids: `router:<system.deviceId>`, `network:<group id>`, `access-point:<ap id>`,
  `client:<station id>` (sanitized by `platformId()`). Never from a name, an SSID or an IP.
- **Snapshot vs inventory** (`hub.js`): Discovery is built from the inventory (what each channel
  last saw, kept during an outage, so devices never vanish); states from the live snapshot
  (nothing published for a channel that is down).
- **States only for created devices**, through `publishChangedStates` (changes + 30 min
  heartbeat): 300 states/min is the host API limit.
- **Scene events on transitions only**, never on the first snapshot, never from an unknown value:
  a router that stops answering is not an internet outage. Never fire an event from a scene
  action (loops).
- **`GLADYS_PREFER_LOCAL`** decides which channel gives the internet state (`internetState()`);
  the router badge turns `cloud` + degraded when only the cloud answers.
- **Secrets**: the refresh token, the OAuth access token and the Foyer token never reach a log,
  an error message, a state or Gladys. Only Google hosts receive them. Tests assert it.
- **The cloud API is unofficial**: parsers are tolerant (null instead of throwing), speed test
  fields are found by meaning, every call has a timeout. The speed test finishes under the 120 s
  ack limit.
- **Every feature declares `name`, `min`, `max`, `read_only`, `has_feedback`** (NOT NULL in
  Gladys), text features included (`0`/`0`). See `src/devices/features.js`.
- The container rootfs is read-only; only `/data` is writable (unused for now).

## Rules

- **Versions belong to the Release workflow.** Never edit `version` in `package.json` or the
  manifest, nor the `docker_image` tag, by hand. `test/manifest.test.js` checks they agree.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]` in `CHANGELOG.md`
  (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`). Never write a version heading.
- **Manifest.** Every text is `{ en, fr, de, es }` (tested). Keys stored by users (config, actions,
  scene triggers/actions, widgets, feature keys) are never renamed: `test/manifest.test.js` pins
  them. Catalog description 10–100 characters per language. `countries` ≤ 20 ISO codes,
  `keywords` ≤ 10, `categories` from the store vocabulary.
- **User-facing text** in four languages: action messages, connection status, badges, widgets,
  and `docs/en.md`, `docs/fr.md`, `docs/de.md`, `docs/es.md`, kept in sync.
- **Tests never touch the network**: use `test/helpers/fakeFetch.js` and the SDK fake Gladys.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why, in English.
