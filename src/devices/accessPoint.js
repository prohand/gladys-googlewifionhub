// -----------------------------------------------------------------------------
// Device: one Wi-Fi POINT (router or extension) of a system, cloud channel.
//
// Keyed on the Google id of the point. Its light ring brightness can be set
// from Gladys.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { modelName } from '../googlewifi/models.js';
import { binaryState, booleanState, brightness, numberState, platformId } from './features.js';

export const TYPE = 'access-point';

export const FEATURE = {
  ONLINE: 'online',
  LIGHT: 'light',
};

export function ids(gladys, ap) {
  return gladys.externalIds(TYPE, platformId(ap.id));
}

export function displayName(ap) {
  return ap.name ? `Wi-Fi point ${ap.name}` : 'Wi-Fi point';
}

export function build(gladys, ap) {
  const id = ids(gladys, ap);
  const device = {
    name: displayName(ap),
    external_id: id.device,
    features: [
      binaryState('Online', id.feature(FEATURE.ONLINE)),
      brightness('Light ring', id.feature(FEATURE.LIGHT)),
    ],
  };
  if (ap.hardwareType) {
    device.model = modelName(ap.hardwareType);
  }
  return device;
}

export function states(gladys, ap) {
  const id = ids(gladys, ap);
  return [
    ...booleanState(id.feature(FEATURE.ONLINE), ap.online),
    ...numberState(id.feature(FEATURE.LIGHT), ap.ledIntensity),
  ];
}

export async function setValue(hub, ap, featureKey, value) {
  if (featureKey !== FEATURE.LIGHT) {
    throw new Error(`The feature "${featureKey}" of a Wi-Fi point cannot be controlled`);
  }
  await hub.setLightIntensity(ap.id, Number(value));
  return Number(value);
}

export function transport(snapshot) {
  return { transport: snapshot.cloud.ok ? DEVICE_TRANSPORTS.CLOUD : DEVICE_TRANSPORTS.UNREACHABLE };
}
