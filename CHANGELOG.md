# Changelog

All notable changes to this integration are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[semantic versioning](https://semver.org/), bumped by the Release workflow.

## [Unreleased]

## [1.0.1] - 2026-11-22

### Added

- First version of the Google Wifi / Nest Wifi / OnHub integration, built on the official
  Gladys JavaScript integration template.
- Local channel: the router status page (`/api/v1/status`), no account needed — internet
  state, WAN cable, uptime, firmware, available update and public address.
- Google cloud channel (optional, unofficial API, refresh token): Wi-Fi network (internet,
  live throughput, speed test, number of connected devices), Wi-Fi points (online, light
  ring brightness) and connected devices (presence, internet pause, throughput).
- Transport badges `local` / `cloud` / `unreachable`, with the standard "Prefer the local
  connection" switch and a degraded badge when the router only answers through the cloud.
- Scene triggers: internet lost, internet restored, device joined / left the Wi-Fi, Wi-Fi
  point offline, router update available.
- Scene actions: pause a device's internet, run a speed test, restart the Wi-Fi, check the
  internet.
- Dashboard widgets: "Wi-Fi status" (with a speed test button) and "Wi-Fi devices".
- Configuration actions: test the connection, run a speed test, restart the Wi-Fi (with a
  confirmation box).
- English, French, German and Spanish texts and user documentation; catalog countries,
  keywords and category.
- CI (Prettier, ESLint, tests on Node 22 and 24, store checks, Docker build), multi-arch
  image build, Release and GitHub releases workflows.

[Unreleased]: https://github.com/prohand/gladys-googlewifionhub/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/prohand/gladys-googlewifionhub/releases/tag/v1.0.1
