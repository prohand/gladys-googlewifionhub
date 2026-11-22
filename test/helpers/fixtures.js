// -----------------------------------------------------------------------------
// Sample answers of the router and of the Google APIs, shaped like the real
// ones (trimmed), plus the routes that serve them to the fake fetch.
// -----------------------------------------------------------------------------

import { FOYER_BASE_URL, ISSUE_TOKEN_URL, OAUTH_TOKEN_URL } from '../../src/googlewifi/cloud.js';

export const ROUTER_HOST = '192.168.86.1';
export const GROUP_ID = 'grp-AAA111';
export const AP_MAIN = 'ap-main-01';
export const AP_POINT = 'ap-point-02';
export const STATION_PHONE = 'st-phone-1';
export const STATION_TV = 'st-tv-2';
export const STATION_OLD = 'st-old-3';

export function localStatus(overrides = {}) {
  return {
    dns: { mode: 'automatic', servers: ['8.8.8.8'] },
    setupState: 'GWIFI_OOBE_COMPLETE',
    software: {
      softwareVersion: '14150.376.32',
      updateChannel: 'stable-channel',
      updateNewVersion: '0.0.0.0',
      updateRequired: false,
      updateStatus: 'idle',
      ...overrides.software,
    },
    system: {
      countryCode: 'fr',
      deviceId: 'dev-0f3a-91',
      hardwareId: 'GALE C2E-A2A-A3A-A4A-E5Q',
      lan0Link: true,
      ledIntensity: 83,
      modelId: 'ACjYe',
      uptime: 3 * 86400 + 3600,
      ...overrides.system,
    },
    wan: {
      captivePortal: false,
      ethernetLink: true,
      gatewayIpAddress: '203.0.113.1',
      invalidCredentials: false,
      ipAddress: true,
      ipMethod: 'dhcp',
      localIpAddress: '203.0.113.42',
      online: true,
      ...overrides.wan,
    },
  };
}

export function groups() {
  return {
    groups: [
      {
        id: GROUP_ID,
        groupSettings: { wlanSettings: { ssid: 'Maison' } },
        accessPoints: [
          {
            id: AP_MAIN,
            accessPointSettings: {
              accessPointOtherSettings: { apName: 'Salon', roomData: { name: 'Salon' } },
              lightingSettings: { intensity: 80 },
            },
            accessPointProperties: { hardwareType: 'GALE' },
          },
          {
            id: AP_POINT,
            accessPointSettings: {
              accessPointOtherSettings: { roomData: { name: 'Bureau' } },
              lightingSettings: { intensity: 40 },
            },
          },
        ],
      },
    ],
  };
}

export function groupStatus({ online = true, point = 'AP_ONLINE' } = {}) {
  return {
    wanConnectionStatus: online ? 'ONLINE' : 'OFFLINE',
    apStatuses: [
      { apId: AP_MAIN, apState: 'AP_ONLINE' },
      { apId: AP_POINT, apState: point },
    ],
  };
}

export function stations({ phone = true, tvPaused = false } = {}) {
  return {
    stations: [
      {
        id: STATION_PHONE,
        friendlyName: 'Pixel de Sam',
        connected: phone,
        ipAddresses: ['192.168.86.23'],
        wirelessBand: 'WIRELESS_5GHZ',
        apId: AP_MAIN,
      },
      {
        id: STATION_TV,
        friendlyName: 'TV Salon',
        connected: true,
        ipAddresses: ['192.168.86.30'],
        wirelessBand: 'WIRELESS_2_4GHZ',
        apId: AP_POINT,
        blocked: tvPaused,
      },
      { id: STATION_OLD, friendlyName: 'Vieux portable', connected: false, ipAddresses: [] },
    ],
  };
}

export function metrics() {
  return {
    groupTraffic: { receiveSpeedBps: '52340000', transmitSpeedBps: '4100000' },
    stationMetrics: [
      {
        station: { id: STATION_TV },
        traffic: { receiveSpeedBps: '25000000', transmitSpeedBps: '100000' },
      },
    ],
  };
}

export function speedTestResults() {
  return {
    speedTestResults: [
      {
        timestamp: '2026-11-20T08:00:00Z',
        speedMbps: { receiveSpeedBps: '912400000', transmitSpeedBps: '41200000' },
      },
    ],
  };
}

const foyer = (path) => `${FOYER_BASE_URL}${path}`;

/** Routes of a healthy router and a healthy cloud account. */
export function healthyRoutes(overrides = {}) {
  return {
    [`GET http://${ROUTER_HOST}/api/v1/status`]: localStatus(),
    [`POST ${OAUTH_TOKEN_URL}`]: { access_token: 'oauth-access-token', expires_in: 3599 },
    [`POST ${ISSUE_TOKEN_URL}`]: { token: 'foyer-token', expiresIn: '3600' },
    [`GET ${foyer('/v2/groups')}`]: groups(),
    [`GET ${foyer(`/v2/groups/${GROUP_ID}/status`)}`]: groupStatus(),
    [`GET ${foyer(`/v2/groups/${GROUP_ID}/stations`)}`]: stations(),
    [`GET ${foyer(`/v2/groups/${GROUP_ID}/realtimeMetrics`)}`]: metrics(),
    [`GET ${foyer(`/v2/groups/${GROUP_ID}/speedTestResults`)}`]: speedTestResults(),
    ...overrides,
  };
}

export { foyer };

export const FULL_CONFIG = {
  router_host: ROUTER_HOST,
  refresh_token: '1//0refresh-token-secret',
  publish_clients: true,
  poll_frequency: 60,
};
