// -----------------------------------------------------------------------------
// Local channel: the status page every Google Wifi, Nest Wifi router and OnHub
// serves on the LAN, without any account.
//
//   GET http://<router>/api/v1/status
//
// It answers a JSON document such as (trimmed):
//
//   {
//     "software": { "softwareVersion": "14150.376.32", "updateNewVersion": "0.0.0.0",
//                   "updateStatus": "idle", "updateRequired": false },
//     "system":   { "deviceId": "…", "hardwareId": "GALE C2E-…", "modelId": "ACjYe",
//                   "uptime": 123456, "lan0Link": true, "ledIntensity": 83,
//                   "countryCode": "fr" },
//     "wan":      { "online": true, "ethernetLink": true, "localIpAddress": "…",
//                   "gatewayIpAddress": "…", "ipMethod": "dhcp", "captivePortal": false }
//   }
//
// The page is read-only: the local channel observes, it never acts. Nothing
// here needs a token, so nothing here can leak one.
// -----------------------------------------------------------------------------

import { modelName } from './models.js';

export const LOCAL_STATUS_PATH = '/api/v1/status';
export const LOCAL_TIMEOUT_MS = 5000;

// The firmware reports "0.0.0.0" as the pending version when it is up to date.
const NO_PENDING_VERSION = '0.0.0.0';

export class LocalApiError extends Error {
  constructor(message, { cause, status } = {}) {
    super(message, { cause });
    this.name = 'LocalApiError';
    this.status = status;
  }
}

const asBoolean = (value) => value === true || value === 'true' || value === 1;
const asString = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : '');
const asNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

/**
 * Turn the raw status document into the few values the integration uses.
 * Tolerant by design: a firmware that drops a field gives `null`, never a crash.
 * @param {any} raw parsed JSON of /api/v1/status
 */
export function parseLocalStatus(raw) {
  if (!raw || typeof raw !== 'object' || (!raw.system && !raw.wan && !raw.software)) {
    throw new LocalApiError('The answer is not a Google Wifi status page');
  }
  const software = raw.software ?? {};
  const system = raw.system ?? {};
  const wan = raw.wan ?? {};

  const currentVersion = asString(software.softwareVersion);
  const pendingVersion = asString(software.updateNewVersion);
  const newVersion = pendingVersion && pendingVersion !== NO_PENDING_VERSION ? pendingVersion : '';
  const online = asBoolean(wan.online);

  return {
    deviceId: asString(system.deviceId),
    hardwareId: asString(system.hardwareId),
    model: modelName(asString(system.hardwareId)),
    countryCode: asString(system.countryCode).toUpperCase(),
    uptimeSeconds: asNumber(system.uptime),
    lanLink: system.lan0Link === undefined ? null : asBoolean(system.lan0Link),
    ledIntensity: asNumber(system.ledIntensity),
    online,
    ethernetLink: wan.ethernetLink === undefined ? null : asBoolean(wan.ethernetLink),
    // The WAN address is only meaningful while online (it lingers otherwise).
    wanIp: online ? asString(wan.localIpAddress) : '',
    gatewayIp: asString(wan.gatewayIpAddress),
    ipMethod: asString(wan.ipMethod),
    captivePortal: asBoolean(wan.captivePortal),
    currentVersion,
    newVersion,
    updateAvailable: newVersion !== '' || asBoolean(software.updateRequired),
    updateStatus: asString(software.updateStatus),
  };
}

/**
 * Read the status page of the router.
 * @param {string} host IP or name of the router, without scheme
 * @param {{ fetch?: typeof fetch, timeoutMs?: number }} [options]
 */
export async function fetchLocalStatus(host, { fetch: doFetch = fetch, timeoutMs } = {}) {
  if (!host) {
    throw new LocalApiError('No router address configured');
  }
  const url = `http://${host}${LOCAL_STATUS_PATH}`;
  let response;
  try {
    response = await doFetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs ?? LOCAL_TIMEOUT_MS),
    });
  } catch (err) {
    throw new LocalApiError(`Router ${host} unreachable`, { cause: err });
  }
  if (!response.ok) {
    throw new LocalApiError(`Router ${host} answered HTTP ${response.status}`, {
      status: response.status,
    });
  }
  let body;
  try {
    body = await response.json();
  } catch (err) {
    throw new LocalApiError(`Router ${host} did not answer JSON`, { cause: err });
  }
  return parseLocalStatus(body);
}
