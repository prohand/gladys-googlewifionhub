// -----------------------------------------------------------------------------
// Device: a CLIENT of the Wi-Fi (phone, computer, TV…), cloud channel.
//
// Keyed on the Google id of the station (it follows the device across IP
// changes). Published in Discovery only when the "publish_clients" option is
// on; the user adds the ones worth following (presence, parental pause).
//
// "Internet access" is a switch: off pauses the internet of that device, the
// same as the pause button of the Google Home app.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { binarySwitch, booleanState, numberState, platformId, presence, rate } from './features.js';
import { round1 } from './network.js';

export const TYPE = 'client';

export const FEATURE = {
  CONNECTED: 'connected',
  INTERNET_ACCESS: 'internet-access',
  DOWNLOAD: 'download',
  UPLOAD: 'upload',
};

export function ids(gladys, station) {
  return gladys.externalIds(TYPE, platformId(station.id));
}

export function displayName(station) {
  return station.name || station.ip || 'Wi-Fi device';
}

export function build(gladys, station) {
  const id = ids(gladys, station);
  return {
    name: displayName(station),
    external_id: id.device,
    features: [
      presence('Connected', id.feature(FEATURE.CONNECTED)),
      binarySwitch('Internet access', id.feature(FEATURE.INTERNET_ACCESS)),
      rate('Download', id.feature(FEATURE.DOWNLOAD), { keepHistory: false }),
      rate('Upload', id.feature(FEATURE.UPLOAD), { keepHistory: false }),
    ],
  };
}

export function states(gladys, station) {
  const id = ids(gladys, station);
  return [
    ...booleanState(id.feature(FEATURE.CONNECTED), station.connected),
    ...booleanState(id.feature(FEATURE.INTERNET_ACCESS), !station.paused),
    ...numberState(id.feature(FEATURE.DOWNLOAD), round1(station.downloadMbps)),
    ...numberState(id.feature(FEATURE.UPLOAD), round1(station.uploadMbps)),
  ];
}

export async function setValue(hub, station, featureKey, value) {
  if (featureKey !== FEATURE.INTERNET_ACCESS) {
    throw new Error(`The feature "${featureKey}" of a Wi-Fi device cannot be controlled`);
  }
  const allowed = Number(value) === 1;
  await hub.setStationPaused(station.id, !allowed);
  return allowed ? 1 : 0;
}

export function transport(snapshot) {
  return { transport: snapshot.cloud.ok ? DEVICE_TRANSPORTS.CLOUD : DEVICE_TRANSPORTS.UNREACHABLE };
}
