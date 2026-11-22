// -----------------------------------------------------------------------------
// Cloud channel: the Google API the Google Home (formerly Google Wifi) app
// uses to manage a Wi-Fi system — "Foyer", googlehomefoyer-pa.googleapis.com.
//
// UNOFFICIAL: Google does not document it, and it may change without notice.
// Everything below is read defensively (a missing field gives a null, never a
// crash) and every call is bounded by a timeout.
//
// Authentication, in two steps, from the long-lived refresh token the user
// pasted in the configuration:
//   1. refresh token  -> Google OAuth access token  (oauth2/v4/token)
//   2. access token   -> Foyer token, scoped to the access points
//                        (oauthaccountmanager/v1/issuetoken)
// The Foyer token is kept in memory until shortly before it expires; a 401
// drops it and the call is retried once with a fresh one.
//
// SECURITY: the refresh token and both tokens are secrets. They never reach a
// log line nor an error message, and they are only ever sent to Google hosts.
// -----------------------------------------------------------------------------

export const OAUTH_TOKEN_URL = 'https://www.googleapis.com/oauth2/v4/token';
export const ISSUE_TOKEN_URL = 'https://oauthaccountmanager.googleapis.com/v1/issuetoken';
export const FOYER_BASE_URL = 'https://googlehomefoyer-pa.googleapis.com';

// OAuth clients of the Google Wifi app, the ones the refresh token is issued for.
const OAUTH_CLIENT_ID = '936475272427.apps.googleusercontent.com';
const ONHUB_CLIENT_ID = '586698244315-vc96jg3mn4nap78iir799fc2ll3rk18s.apps.googleusercontent.com';
const ONHUB_SCOPES = [
  'https://www.googleapis.com/auth/accesspoints',
  'https://www.googleapis.com/auth/clouddevices',
];

export const CLOUD_TIMEOUT_MS = 15000;
// Renew the Foyer token this long before Google says it expires.
const TOKEN_MARGIN_MS = 60 * 1000;
const DEFAULT_TOKEN_LIFETIME_S = 3600;

export const SPEED_TEST_POLL_MS = 5000;
// Under the 120 s ack delay Gladys grants an action at most (manifest).
export const SPEED_TEST_TIMEOUT_MS = 100 * 1000;

export class CloudApiError extends Error {
  /**
   * @param {string} message never carries a token
   * @param {{ status?: number, auth?: boolean, cause?: unknown }} [details]
   */
  constructor(message, { status, auth = false, cause } = {}) {
    super(message, { cause });
    this.name = 'CloudApiError';
    this.status = status;
    // True when the refresh token itself is refused: retrying will not help.
    this.auth = auth;
  }
}

const asString = (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : '');
const asNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const asArray = (value) => (Array.isArray(value) ? value : []);

/**
 * "ONLINE", "AP_ONLINE", "CONNECTED" -> true; "OFFLINE", "DISCONNECTED" -> false.
 * Anything else (unknown, empty) -> null.
 */
export function isOnlineState(value) {
  if (value === true || value === false) {
    return value;
  }
  const text = asString(value).toUpperCase();
  if (!text) {
    return null;
  }
  if (/OFFLINE|DISCONNECTED|DOWN|UNREACHABLE/.test(text)) {
    return false;
  }
  if (/ONLINE|CONNECTED|\bUP\b|OK/.test(text)) {
    return true;
  }
  return null;
}

// --- Parsers -----------------------------------------------------------------

/** GET /v2/groups -> the Wi-Fi systems of the account and their points. */
export function parseGroups(raw) {
  return asArray(raw?.groups)
    .filter((group) => asString(group?.id))
    .map((group) => ({
      id: asString(group.id),
      ssid: asString(group.groupSettings?.wlanSettings?.ssid),
      accessPoints: asArray(group.accessPoints)
        .filter((ap) => asString(ap?.id))
        .map((ap) => {
          const settings = ap.accessPointSettings ?? {};
          const other = settings.accessPointOtherSettings ?? {};
          return {
            id: asString(ap.id),
            name: asString(other.apName) || asString(other.roomData?.name),
            hardwareType: asString(ap.accessPointProperties?.hardwareType),
            ledIntensity: asNumber(settings.lightingSettings?.intensity),
          };
        }),
    }));
}

/** GET /v2/groups/{id}/status -> internet state and state of each point. */
export function parseGroupStatus(raw) {
  const accessPoints = {};
  for (const status of asArray(raw?.apStatuses)) {
    const id = asString(status?.apId ?? status?.id);
    if (id) {
      accessPoints[id] = isOnlineState(status.apState ?? status.state ?? status.status);
    }
  }
  return {
    online: isOnlineState(raw?.wanConnectionStatus ?? raw?.wanStatus ?? raw?.status),
    accessPoints,
  };
}

/** GET /v2/groups/{id}/stations -> the devices known to the Wi-Fi. */
export function parseStations(raw) {
  return asArray(raw?.stations)
    .filter((station) => asString(station?.id))
    .map((station) => ({
      id: asString(station.id),
      name: asString(station.friendlyName) || asString(station.dhcpHostname) || '',
      type: asString(station.friendlyType),
      connected: station.connected === true,
      ip: asString(asArray(station.ipAddresses)[0]),
      band: asString(station.wirelessBand),
      accessPointId: asString(station.apId),
      guest: station.guest === true,
      paused: station.blocked === true || station.paused === true,
      lastSeen: asString(station.lastSeenTime),
    }));
}

const bpsToMbps = (value) => {
  const number = asNumber(value);
  return number === null ? null : Math.round((number / 1e6) * 100) / 100;
};

/** GET /v2/groups/{id}/realtimeMetrics -> live throughput, in Mb/s. */
export function parseRealtimeMetrics(raw) {
  const stations = {};
  for (const metric of asArray(raw?.stationMetrics)) {
    const id = asString(metric?.station?.id ?? metric?.stationId);
    if (id) {
      stations[id] = {
        downloadMbps: bpsToMbps(metric.traffic?.receiveSpeedBps),
        uploadMbps: bpsToMbps(metric.traffic?.transmitSpeedBps),
      };
    }
  }
  return {
    downloadMbps: bpsToMbps(raw?.groupTraffic?.receiveSpeedBps),
    uploadMbps: bpsToMbps(raw?.groupTraffic?.transmitSpeedBps),
    stations,
  };
}

// Walk an object and collect its numeric leaves with their key path.
function numericLeaves(value, path = '', out = []) {
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      numericLeaves(child, `${path}.${key}`, out);
    }
  } else if (asNumber(value) !== null && typeof value !== 'boolean') {
    out.push({ path, value: asNumber(value) });
  }
  return out;
}

function speedFrom(leaves, pattern) {
  const leaf = leaves.find(({ path }) => pattern.test(path));
  if (!leaf) {
    return null;
  }
  // The unit is read from the leaf key: "…Mbps" is already in Mb/s, "…Bps" /
  // "…bps" in bits per second. No unit: a value above 100 000 can only be bits.
  const key = leaf.path.split('.').pop();
  const inBits = /mbps$/i.test(key) ? false : /bps$/i.test(key) || leaf.value > 100000;
  const mbps = inBits ? leaf.value / 1e6 : leaf.value;
  return Math.round(mbps * 100) / 100;
}

/**
 * GET /v2/groups/{id}/speedTestResults -> the last WAN speed test.
 * The field names have moved over the years: the speeds are found by meaning
 * (receive/download, transmit/upload) rather than by exact path.
 */
export function parseSpeedTestResults(raw) {
  const result = asArray(raw?.speedTestResults)[0];
  if (!result) {
    return null;
  }
  const leaves = numericLeaves(result);
  const downloadMbps = speedFrom(leaves, /receive|download/i);
  const uploadMbps = speedFrom(leaves, /transmit|upload/i);
  if (downloadMbps === null && uploadMbps === null) {
    return null;
  }
  return {
    downloadMbps,
    uploadMbps,
    timestamp: asString(result.timestamp),
  };
}

// --- Client ------------------------------------------------------------------

export class CloudClient {
  /**
   * @param {object} options
   * @param {string} options.refreshToken long-lived Google refresh token
   * @param {typeof fetch} [options.fetch] injected by the tests
   * @param {() => number} [options.now]
   * @param {(ms: number) => Promise<void>} [options.sleep]
   */
  constructor({ refreshToken, fetch: doFetch = fetch, now = Date.now, sleep } = {}) {
    if (!refreshToken) {
      throw new CloudApiError('No Google refresh token configured', { auth: true });
    }
    this.refreshToken = refreshToken;
    this.fetch = doFetch;
    this.now = now;
    this.sleep = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.token = null;
    this.tokenExpiresAt = 0;
  }

  async #send(url, init) {
    try {
      return await this.fetch(url, { ...init, signal: AbortSignal.timeout(CLOUD_TIMEOUT_MS) });
    } catch (err) {
      throw new CloudApiError(`Google cloud unreachable (${new URL(url).host})`, { cause: err });
    }
  }

  async #json(response, what) {
    try {
      return await response.json();
    } catch (err) {
      throw new CloudApiError(`${what}: the Google answer is not JSON`, {
        status: response.status,
        cause: err,
      });
    }
  }

  /** A Foyer token, renewed when missing or about to expire. */
  async getToken() {
    if (this.token && this.now() < this.tokenExpiresAt) {
      return this.token;
    }
    this.token = null;

    // Step 1: refresh token -> OAuth access token.
    const oauth = await this.#send(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: OAUTH_CLIENT_ID,
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken,
      }).toString(),
    });
    if (!oauth.ok) {
      // 400 invalid_grant / 401: the refresh token is revoked or mistyped.
      throw new CloudApiError(`Google refused the refresh token (HTTP ${oauth.status})`, {
        status: oauth.status,
        auth: oauth.status === 400 || oauth.status === 401,
      });
    }
    const { access_token: accessToken } = await this.#json(oauth, 'OAuth token');
    if (!asString(accessToken)) {
      throw new CloudApiError('Google returned no access token', { auth: true });
    }

    // Step 2: access token -> Foyer token for the access points.
    const issued = await this.#send(ISSUE_TOKEN_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        app_id: 'com.google.OnHub',
        client_id: ONHUB_CLIENT_ID,
        hl: 'en-US',
        lib_ver: '3.3',
        response_type: 'token',
        scope: ONHUB_SCOPES.join(' '),
      }).toString(),
    });
    if (!issued.ok) {
      throw new CloudApiError(`Google refused the Wi-Fi access token (HTTP ${issued.status})`, {
        status: issued.status,
        auth: issued.status === 401 || issued.status === 403,
      });
    }
    const body = await this.#json(issued, 'Wi-Fi token');
    if (!asString(body.token)) {
      throw new CloudApiError('Google returned no Wi-Fi access token', { auth: true });
    }
    const lifetimeS = asNumber(body.expiresIn) ?? DEFAULT_TOKEN_LIFETIME_S;
    this.token = body.token;
    this.tokenExpiresAt = this.now() + lifetimeS * 1000 - TOKEN_MARGIN_MS;
    return this.token;
  }

  /**
   * One Foyer API call. A 401 drops the token and retries once.
   * @param {'GET'|'POST'|'PUT'|'DELETE'} method
   * @param {string} path e.g. "/v2/groups"
   * @param {object} [body]
   */
  async request(method, path, body, { retried = false } = {}) {
    const token = await this.getToken();
    const separator = path.includes('?') ? '&' : '?';
    const response = await this.#send(`${FOYER_BASE_URL}${path}${separator}prettyPrint=false`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 401 && !retried) {
      this.token = null;
      return this.request(method, path, body, { retried: true });
    }
    if (!response.ok) {
      // Only the path goes in the message: it holds ids, never a token.
      throw new CloudApiError(
        `Google Wi-Fi API ${method} ${path.split('?')[0]}: HTTP ${response.status}`,
        {
          status: response.status,
          auth: response.status === 401,
        },
      );
    }
    if (response.status === 204) {
      return {};
    }
    const text = await response.text();
    if (!text) {
      return {};
    }
    try {
      return JSON.parse(text);
    } catch (err) {
      throw new CloudApiError(`Google Wi-Fi API ${method}: the answer is not JSON`, { cause: err });
    }
  }

  async getGroups() {
    return parseGroups(await this.request('GET', '/v2/groups'));
  }

  async getGroupStatus(groupId) {
    return parseGroupStatus(
      await this.request('GET', `/v2/groups/${encodeURIComponent(groupId)}/status`),
    );
  }

  async getStations(groupId) {
    return parseStations(
      await this.request('GET', `/v2/groups/${encodeURIComponent(groupId)}/stations`),
    );
  }

  async getRealtimeMetrics(groupId) {
    return parseRealtimeMetrics(
      await this.request('GET', `/v2/groups/${encodeURIComponent(groupId)}/realtimeMetrics`),
    );
  }

  /** Pause (blocked = true) or resume the internet access of one device. */
  async setStationBlocked(groupId, stationId, blocked) {
    await this.request('PUT', `/v2/groups/${encodeURIComponent(groupId)}/stationBlocking`, {
      blocked: blocked ? 'true' : 'false',
      stationId,
    });
  }

  /** Restart every point of the Wi-Fi system (a few minutes without network). */
  async rebootGroup(groupId) {
    await this.request('POST', `/v2/groups/${encodeURIComponent(groupId)}/reboot`, {});
  }

  /** Restart one point. */
  async rebootAccessPoint(accessPointId) {
    await this.request('POST', `/v2/accesspoints/${encodeURIComponent(accessPointId)}/reboot`, {});
  }

  /** Brightness of the light ring of one point, 0-100. */
  async setLightIntensity(accessPointId, intensity) {
    const value = Math.max(0, Math.min(100, Math.round(intensity)));
    await this.request(
      'PUT',
      `/v2/accesspoints/${encodeURIComponent(accessPointId)}/lighting?updateMask=intensity`,
      { intensity: value },
    );
  }

  async getLastSpeedTest(groupId) {
    return parseSpeedTestResults(
      await this.request(
        'GET',
        `/v2/groups/${encodeURIComponent(groupId)}/speedTestResults?maxResultCount=1`,
      ),
    );
  }

  /**
   * Start a WAN speed test, wait for it to finish (it takes 30 to 60 s) and
   * read its result.
   */
  async runSpeedTest(
    groupId,
    { pollMs = SPEED_TEST_POLL_MS, timeoutMs = SPEED_TEST_TIMEOUT_MS } = {},
  ) {
    const started = await this.request(
      'POST',
      `/v2/groups/${encodeURIComponent(groupId)}/wanSpeedTest`,
      {},
    );
    const operationId = asString(started?.operation?.operationId ?? started?.operationId);
    if (operationId) {
      const deadline = this.now() + timeoutMs;
      for (;;) {
        await this.sleep(pollMs);
        const operation = await this.request(
          'GET',
          `/v2/operations/${encodeURIComponent(operationId)}`,
        );
        const state = asString(operation?.operationState ?? operation?.operation?.operationState);
        if (state.toUpperCase() === 'DONE') {
          break;
        }
        if (this.now() >= deadline) {
          throw new CloudApiError('The speed test did not finish in time');
        }
      }
    }
    const result = await this.getLastSpeedTest(groupId);
    if (!result) {
      throw new CloudApiError('The speed test returned no result');
    }
    return result;
  }
}
