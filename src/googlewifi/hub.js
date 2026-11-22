// -----------------------------------------------------------------------------
// The hub: reads both channels and keeps the last picture of the Wi-Fi.
//
// One refresh = the local status page (when a router address is configured)
// and, when a refresh token is configured, for every Wi-Fi system of the
// account: its status, its devices and its live throughput. The result is an
// immutable snapshot; the previous one is kept so the triggers can compare.
//
// A channel that fails does not fail the refresh: its part of the snapshot
// says `ok: false` with the reason, and the other channel still reports.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { hasCloud, hasLocal } from '../config.js';
import { CloudClient } from './cloud.js';
import { fetchLocalStatus } from './local.js';

const logger = createLogger({ name: 'hub' });

// The list of systems and points changes rarely: re-read it every 10 minutes,
// the live data (status, devices, throughput) at every refresh.
export const GROUPS_TTL_MS = 10 * 60 * 1000;

/** An empty snapshot: nothing configured, nothing read yet. */
export function emptySnapshot() {
  return {
    at: null,
    local: { configured: false, ok: false, error: null, status: null },
    cloud: { configured: false, ok: false, error: null, authError: false, groups: [] },
  };
}

/**
 * The internet state Gladys should show, and where it comes from.
 * The user's "Prefer the local connection" toggle decides which channel wins
 * when both answer; either one alone is used when it is the only one.
 * @returns {{ online: boolean|null, source: 'local'|'cloud'|null }}
 */
export function internetState(snapshot, config) {
  const local = snapshot.local.ok ? snapshot.local.status.online : null;
  const cloudGroup = snapshot.cloud.ok
    ? snapshot.cloud.groups.find((group) => group.online !== null)
    : null;
  const cloud = cloudGroup ? cloudGroup.online : null;
  const order = config.GLADYS_PREFER_LOCAL === false ? ['cloud', 'local'] : ['local', 'cloud'];
  for (const source of order) {
    const online = source === 'local' ? local : cloud;
    if (online !== null) {
      return { online, source };
    }
  }
  return { online: null, source: null };
}

export class Hub {
  /**
   * @param {object} [options]
   * @param {typeof fetch} [options.fetch] injected by the tests
   * @param {() => number} [options.now]
   * @param {(ms: number) => Promise<void>} [options.sleep]
   */
  constructor({ fetch: doFetch = fetch, now = Date.now, sleep } = {}) {
    this.fetch = doFetch;
    this.now = now;
    this.sleep = sleep;
    this.config = null;
    this.cloud = null;
    this.cloudToken = null;
    this.groups = null;
    this.groupsReadAt = 0;
    this.snapshot = emptySnapshot();
    this.previous = null;
    // What was last seen on each channel, kept when a channel goes down: the
    // devices published in Discovery must not vanish during an outage.
    this.inventory = { local: null, groups: [] };
    // Last speed test of each system, kept across refreshes (it is only read
    // when one runs, or once at startup).
    this.speedTests = new Map();
    this.speedTestsLoaded = false;
    // One refresh at a time: a timer tick landing during a slow one joins it.
    this.inFlight = null;
  }

  /** Apply a (new) configuration. A changed token drops the cloud session. */
  configure(config) {
    this.config = config;
    if (!hasCloud(config)) {
      this.cloud = null;
      this.cloudToken = null;
    } else if (config.refresh_token !== this.cloudToken) {
      this.cloud = new CloudClient({
        refreshToken: config.refresh_token,
        fetch: this.fetch,
        now: this.now,
        sleep: this.sleep,
      });
      this.cloudToken = config.refresh_token;
      this.groups = null;
      this.groupsReadAt = 0;
      this.speedTests.clear();
      this.speedTestsLoaded = false;
    }
  }

  /** Refresh both channels; resolves the new snapshot. */
  refresh() {
    if (!this.inFlight) {
      this.inFlight = this.#refresh().finally(() => {
        this.inFlight = null;
      });
    }
    return this.inFlight;
  }

  async #refresh() {
    const config = this.config;
    const [local, cloud] = await Promise.all([this.#readLocal(config), this.#readCloud()]);
    this.previous = this.snapshot.at === null ? null : this.snapshot;
    this.snapshot = { at: new Date(this.now()).toISOString(), local, cloud };
    if (local.ok) {
      this.inventory.local = local.status;
    } else if (!local.configured) {
      this.inventory.local = null;
    }
    if (cloud.ok) {
      this.inventory.groups = cloud.groups;
    } else if (!cloud.configured) {
      this.inventory.groups = [];
    }
    return this.snapshot;
  }

  async #readLocal(config) {
    if (!hasLocal(config)) {
      return { configured: false, ok: false, error: null, status: null };
    }
    try {
      const status = await fetchLocalStatus(config.router_host, { fetch: this.fetch });
      return { configured: true, ok: true, error: null, status };
    } catch (err) {
      logger.warn(`Local channel: ${err.message}`);
      return { configured: true, ok: false, error: err.message, status: null };
    }
  }

  async #readCloud() {
    if (!this.cloud) {
      return { configured: false, ok: false, error: null, authError: false, groups: [] };
    }
    try {
      if (!this.groups || this.now() - this.groupsReadAt >= GROUPS_TTL_MS) {
        this.groups = await this.cloud.getGroups();
        this.groupsReadAt = this.now();
      }
      const groups = [];
      for (const group of this.groups) {
        groups.push(await this.#readGroup(group));
      }
      if (!this.speedTestsLoaded) {
        this.speedTestsLoaded = true;
        await this.#loadLastSpeedTests(groups);
      }
      for (const group of groups) {
        group.speedTest = this.speedTests.get(group.id) ?? null;
      }
      return { configured: true, ok: true, error: null, authError: false, groups };
    } catch (err) {
      logger.warn(`Cloud channel: ${err.message}`);
      // Keep the systems known so far: their devices stay addressable, they
      // only lose their live values until the cloud answers again.
      return {
        configured: true,
        ok: false,
        error: err.message,
        authError: err.auth === true,
        groups: [],
      };
    }
  }

  async #readGroup(group) {
    const [status, stations, metrics] = await Promise.all([
      this.cloud.getGroupStatus(group.id),
      this.cloud.getStations(group.id),
      // Throughput is a bonus: a system that does not report it still works.
      this.cloud.getRealtimeMetrics(group.id).catch((err) => {
        logger.debug(`Realtime metrics unavailable: ${err.message}`);
        return { downloadMbps: null, uploadMbps: null, stations: {} };
      }),
    ]);
    return {
      id: group.id,
      ssid: group.ssid,
      online: status.online,
      downloadMbps: metrics.downloadMbps,
      uploadMbps: metrics.uploadMbps,
      accessPoints: group.accessPoints.map((ap) => ({
        ...ap,
        online: status.accessPoints[ap.id] ?? null,
      })),
      stations: stations.map((station) => ({
        ...station,
        downloadMbps: metrics.stations[station.id]?.downloadMbps ?? (station.connected ? 0 : null),
        uploadMbps: metrics.stations[station.id]?.uploadMbps ?? (station.connected ? 0 : null),
      })),
      speedTest: null,
    };
  }

  async #loadLastSpeedTests(groups) {
    for (const group of groups) {
      try {
        const result = await this.cloud.getLastSpeedTest(group.id);
        if (result) {
          this.speedTests.set(group.id, result);
        }
      } catch (err) {
        logger.debug(`No previous speed test for a system: ${err.message}`);
      }
    }
  }

  // --- Commands (cloud only) -------------------------------------------------

  #requireCloud() {
    if (!this.cloud) {
      throw new Error(
        'This needs the Google cloud connection: add a refresh token in the configuration.',
      );
    }
    return this.cloud;
  }

  /** The system to act on: the one given, or the only/first one of the account. */
  async #groupId(groupId) {
    const cloud = this.#requireCloud();
    if (groupId) {
      return groupId;
    }
    if (!this.groups) {
      this.groups = await cloud.getGroups();
      this.groupsReadAt = this.now();
    }
    if (this.groups.length === 0) {
      throw new Error('No Google Wifi system found on this Google account.');
    }
    return this.groups[0].id;
  }

  /** The system a device (station or point) belongs to. */
  groupOfStation(stationId) {
    return this.snapshot.cloud.groups.find((group) =>
      group.stations.some((station) => station.id === stationId),
    )?.id;
  }

  groupOfAccessPoint(accessPointId) {
    return this.snapshot.cloud.groups.find((group) =>
      group.accessPoints.some((ap) => ap.id === accessPointId),
    )?.id;
  }

  async setStationPaused(stationId, paused) {
    const cloud = this.#requireCloud();
    const groupId = await this.#groupId(this.groupOfStation(stationId));
    await cloud.setStationBlocked(groupId, stationId, paused);
    // Reflect it right away: the next refresh confirms it.
    for (const group of this.snapshot.cloud.groups) {
      for (const station of group.stations) {
        if (station.id === stationId) {
          station.paused = paused;
        }
      }
    }
  }

  async setLightIntensity(accessPointId, intensity) {
    await this.#requireCloud().setLightIntensity(accessPointId, intensity);
    for (const group of this.snapshot.cloud.groups) {
      for (const ap of group.accessPoints) {
        if (ap.id === accessPointId) {
          ap.ledIntensity = intensity;
        }
      }
    }
    // The list of points carries the brightness: read it again next time.
    this.groupsReadAt = 0;
  }

  async restart(accessPointId) {
    const cloud = this.#requireCloud();
    if (accessPointId) {
      await cloud.rebootAccessPoint(accessPointId);
      return;
    }
    await cloud.rebootGroup(await this.#groupId());
  }

  async runSpeedTest(groupId) {
    const cloud = this.#requireCloud();
    const id = await this.#groupId(groupId);
    const result = await cloud.runSpeedTest(id);
    this.speedTests.set(id, result);
    for (const group of this.snapshot.cloud.groups) {
      if (group.id === id) {
        group.speedTest = result;
      }
    }
    return { groupId: id, ...result };
  }
}
