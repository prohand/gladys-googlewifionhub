// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user in Gladys from the `config_schema` of
// `gladys-assistant-integration.json`. This module provides the defaults (they
// MUST mirror the manifest `default` values, see test/manifest.test.js) and
// normalizes the received object so the rest of the code never deals with
// `undefined` or with numbers typed as strings.
// -----------------------------------------------------------------------------

export const DEFAULT_CONFIG = {
  // Address of the main Google Wifi / Nest Wifi / OnHub point on the LAN. The
  // factory subnet of Google Wifi is 192.168.86.0/24, the router being .1.
  // Empty disables the local channel.
  router_host: '192.168.86.1',
  // Google refresh token (secret field, no default in the manifest). Empty
  // disables the cloud channel.
  refresh_token: '',
  // Publish the devices connected to the Wi-Fi (cloud channel) in Discovery.
  publish_clients: true,
  // Seconds between two refreshes of the router data.
  poll_frequency: 60,
  // Reserved key (NOT in config_schema): the manifest declares both 'local'
  // and 'cloud' in `transports`, so Gladys shows the standard "Prefer the
  // local connection" toggle and sends the user's choice here. Read-only.
  GLADYS_PREFER_LOCAL: true,
};

export const POLL_FREQUENCY_MIN = 30;
export const POLL_FREQUENCY_MAX = 3600;

/**
 * Clean a host typed by the user: no scheme, no path, no spaces.
 * "http://192.168.86.1/" -> "192.168.86.1"
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeHost(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .trim();
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const pollFrequency = Number(raw.poll_frequency ?? DEFAULT_CONFIG.poll_frequency);
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    // An explicitly emptied field means "local channel disabled": only an
    // absent key takes the default.
    router_host:
      raw.router_host === undefined || raw.router_host === null
        ? DEFAULT_CONFIG.router_host
        : normalizeHost(raw.router_host),
    refresh_token: typeof raw.refresh_token === 'string' ? raw.refresh_token.trim() : '',
    publish_clients: raw.publish_clients !== false,
    poll_frequency: Number.isFinite(pollFrequency)
      ? Math.min(POLL_FREQUENCY_MAX, Math.max(POLL_FREQUENCY_MIN, pollFrequency))
      : DEFAULT_CONFIG.poll_frequency,
    // Anything but an explicit false means true.
    GLADYS_PREFER_LOCAL: raw.GLADYS_PREFER_LOCAL !== false,
  };
}

/** The local channel is configured. */
export function hasLocal(config) {
  return config.router_host !== '';
}

/** The cloud channel is configured. */
export function hasCloud(config) {
  return config.refresh_token !== '';
}
