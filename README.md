# Google Wifi / OnHub — Gladys Assistant integration

External integration connecting [Gladys Assistant](https://gladysassistant.com) to a
**Google Wifi**, **Nest Wifi** (router) or **OnHub** (TP-Link, ASUS) Wi-Fi system: internet
state, connected devices, live throughput, speed test, internet pause and restart.

Built on the official
[JavaScript integration template](https://github.com/GladysAssistant/integration-template-js)
and the SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).
Requires **Gladys 5.3.0 or later**.

User documentation: [English](./docs/en.md) · [Français](./docs/fr.md) · [Deutsch](./docs/de.md) ·
[Español](./docs/es.md).

## What it does

| Gladys device    | Channel | Features                                                                       |
| ---------------- | ------- | ------------------------------------------------------------------------------ |
| Router           | local   | Internet, WAN cable, uptime, update available, firmware, public address        |
| Wi-Fi network    | cloud   | Internet, live download / upload, last speed test, connected devices count     |
| Wi-Fi point      | cloud   | Online, light ring brightness (settable)                                       |
| Connected device | cloud   | Connected (presence), internet access (switch = pause), live download / upload |

Gladys 5.1+ capabilities:

- **Scene triggers**: internet lost, internet restored, device joined / left the Wi-Fi, Wi-Fi
  point offline, router update available.
- **Scene actions**: pause a device's internet, run a speed test, restart the Wi-Fi, check the
  internet.
- **Widgets**: "Wi-Fi status" (with a speed test button) and "Wi-Fi devices".
- **Configuration buttons**: test the connection, run a speed test, restart the Wi-Fi.

## How it talks to the hardware

Two transports, declared in the manifest (`transports: ["local", "cloud"]`), usable together:

- **local** — `GET http://<router>/api/v1/status`, the status page every Google Wifi / Nest
  Wifi / OnHub serves on the LAN without authentication. Read-only.
- **cloud** — the API of the Google Home app (`googlehomefoyer-pa.googleapis.com`), with a
  Google refresh token pasted by the user. **Unofficial and undocumented**: parsers are tolerant
  and every call has a timeout.

The standard **Prefer the local connection** switch (reserved `GLADYS_PREFER_LOCAL` key) picks
which channel gives the internet state. Each device reports the channel it really uses
(`publishTransports`): `local`, `cloud`, or `unreachable`; the router turns `cloud` with a
degraded mark when it only answers through the cloud.

## Catalog

- Category: `network`.
- Countries (`countries`): the markets where Google Wifi / Nest Wifi were sold — US, CA, GB, IE,
  FR, BE, DE, AT, CH, ES, IT, NL, SE, DK, NO, FI, AU, NZ, JP, IN. The catalog of an instance
  elsewhere hides it from the browse views, never from the search.
- Keywords: google wifi, nest wifi, onhub, mesh, router…

## Development

```bash
npm install
npm test
npm run lint
npm run format:check
```

Tests never touch the network: `test/helpers/fakeFetch.js` stands in for the router and Google,
and the SDK's fake Gladys (`@gladysassistant/integration-sdk/testing`) for Gladys. See
[CLAUDE.md](./CLAUDE.md) for the architecture and the rules.

### Try a build in Gladys

Actions → **Build and publish image** → Run workflow on a branch: the run summary gives the
manifest pointing at that image, to paste in **Integrations → Install an integration →
Developer mode**.

## Releases

Actions → **Release** → patch / minor / major. The workflow bumps `package.json` and the
manifest (`version` + `docker_image`), moves `## [Unreleased]` of the [changelog](./CHANGELOG.md)
under the new version, tags, builds the multi-arch image (`linux/amd64`, `linux/arm64`) on
`ghcr.io/prohand/gladys-googlewifionhub`, publishes the GitHub Release and runs the store checks.

If `main` is protected, allow GitHub Actions to push to it (the release commit and tag).

## Security

See [SECURITY.md](./SECURITY.md). The refresh token never reaches a log; only Google hosts
receive it.

## License

Apache-2.0.
