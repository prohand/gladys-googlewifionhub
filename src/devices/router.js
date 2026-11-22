// -----------------------------------------------------------------------------
// Device: the ROUTER, read on the LAN (local channel).
//
// One per router address, keyed on the `system.deviceId` the status page
// reports (stable across reboots and firmware updates). Everything here is
// read-only: the local page observes, it never acts.
//
// The internet state follows the "Prefer the local connection" toggle: when
// the user prefers the cloud, or the router does not answer on the LAN, it is
// taken from the Google cloud (when configured) and the transport badge says so.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { internetState } from '../googlewifi/hub.js';
import { localize, pick } from '../i18n.js';
import {
  binaryState,
  booleanState,
  numberState,
  platformId,
  text,
  textState,
  uptime,
} from './features.js';

export const TYPE = 'router';

export const FEATURE = {
  INTERNET: 'internet',
  ETHERNET: 'ethernet-link',
  UPTIME: 'uptime',
  UPDATE: 'update-available',
  FIRMWARE: 'firmware',
  WAN_IP: 'wan-ip',
};

const SECONDS_PER_DAY = 86400;

export function ids(gladys, status) {
  return gladys.externalIds(TYPE, platformId(status.deviceId || 'main'));
}

export function build(gladys, status) {
  const id = ids(gladys, status);
  return {
    name: `${status.model} router`,
    external_id: id.device,
    model: status.model,
    features: [
      binaryState('Internet', id.feature(FEATURE.INTERNET)),
      binaryState('WAN cable connected', id.feature(FEATURE.ETHERNET)),
      uptime('Uptime', id.feature(FEATURE.UPTIME)),
      binaryState('Update available', id.feature(FEATURE.UPDATE)),
      text('Firmware', id.feature(FEATURE.FIRMWARE)),
      text('Public address (WAN)', id.feature(FEATURE.WAN_IP)),
    ],
  };
}

export function states(gladys, status, snapshot, config) {
  const id = ids(gladys, status);
  const internet = internetState(snapshot, config);
  const out = [...booleanState(id.feature(FEATURE.INTERNET), internet.online)];
  if (snapshot.local.ok) {
    const live = snapshot.local.status;
    out.push(
      ...booleanState(id.feature(FEATURE.ETHERNET), live.ethernetLink),
      ...numberState(
        id.feature(FEATURE.UPTIME),
        live.uptimeSeconds === null
          ? null
          : Math.round((live.uptimeSeconds / SECONDS_PER_DAY) * 100) / 100,
      ),
      ...booleanState(id.feature(FEATURE.UPDATE), live.updateAvailable),
      ...textState(id.feature(FEATURE.FIRMWARE), live.currentVersion),
      ...textState(id.feature(FEATURE.WAN_IP), live.wanIp),
    );
  }
  return out;
}

const CLOUD_FALLBACK = {
  en: 'Router unreachable on the LAN: internet state read from the Google cloud.',
  fr: 'Routeur injoignable sur le réseau local : état internet lu sur le cloud Google.',
  de: 'Router im LAN nicht erreichbar: Internetstatus aus der Google-Cloud gelesen.',
  es: 'Router inaccesible en la red local: estado de internet leído en la nube de Google.',
};

/** Effective transport of the router device. */
export function transport(snapshot, config) {
  const { source } = internetState(snapshot, config);
  if (snapshot.local.ok && source !== 'cloud') {
    return { transport: DEVICE_TRANSPORTS.LOCAL };
  }
  if (source === 'cloud') {
    return snapshot.local.ok
      ? { transport: DEVICE_TRANSPORTS.CLOUD }
      : {
          transport: DEVICE_TRANSPORTS.CLOUD,
          degraded: true,
          message: localize((language) => pick(language, CLOUD_FALLBACK)),
        };
  }
  return { transport: DEVICE_TRANSPORTS.UNREACHABLE };
}
