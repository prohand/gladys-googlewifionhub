// -----------------------------------------------------------------------------
// Device: the Wi-Fi NETWORK (one per Google Wifi system of the account), read
// through the Google cloud.
//
// Keyed on the Google id of the system ("group"). Carries what only the cloud
// knows: live throughput, last speed test and number of connected devices.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { binaryState, booleanState, counter, numberState, platformId, rate } from './features.js';

export const TYPE = 'network';

export const FEATURE = {
  INTERNET: 'internet',
  DOWNLOAD: 'download',
  UPLOAD: 'upload',
  SPEED_DOWNLOAD: 'speedtest-download',
  SPEED_UPLOAD: 'speedtest-upload',
  CLIENTS: 'clients',
};

export function ids(gladys, group) {
  return gladys.externalIds(TYPE, platformId(group.id));
}

export function displayName(group) {
  return group.ssid ? `Wi-Fi ${group.ssid}` : 'Google Wifi network';
}

export function build(gladys, group) {
  const id = ids(gladys, group);
  return {
    name: displayName(group),
    external_id: id.device,
    features: [
      binaryState('Internet', id.feature(FEATURE.INTERNET)),
      rate('Download (live)', id.feature(FEATURE.DOWNLOAD)),
      rate('Upload (live)', id.feature(FEATURE.UPLOAD)),
      rate('Speed test download', id.feature(FEATURE.SPEED_DOWNLOAD)),
      rate('Speed test upload', id.feature(FEATURE.SPEED_UPLOAD)),
      counter('Connected devices', id.feature(FEATURE.CLIENTS)),
    ],
  };
}

export function connectedCount(group) {
  return group.stations.filter((station) => station.connected).length;
}

/** States of a system, from its live entry of the snapshot. */
export function states(gladys, group) {
  const id = ids(gladys, group);
  return [
    ...booleanState(id.feature(FEATURE.INTERNET), group.online),
    ...numberState(id.feature(FEATURE.DOWNLOAD), round1(group.downloadMbps)),
    ...numberState(id.feature(FEATURE.UPLOAD), round1(group.uploadMbps)),
    ...numberState(id.feature(FEATURE.SPEED_DOWNLOAD), group.speedTest?.downloadMbps),
    ...numberState(id.feature(FEATURE.SPEED_UPLOAD), group.speedTest?.uploadMbps),
    ...numberState(id.feature(FEATURE.CLIENTS), connectedCount(group)),
  ];
}

// Live rates move all the time: one decimal is plenty and keeps the number of
// published states down (only changes are sent).
export function round1(value) {
  return value === null || value === undefined ? null : Math.round(value * 10) / 10;
}

export function transport(snapshot) {
  return { transport: snapshot.cloud.ok ? DEVICE_TRANSPORTS.CLOUD : DEVICE_TRANSPORTS.UNREACHABLE };
}
