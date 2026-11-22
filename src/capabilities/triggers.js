// -----------------------------------------------------------------------------
// Scene triggers (Gladys 5.1+): "this just happened on the Wi-Fi".
//
// Each refresh compares the new snapshot with the previous one and fires one
// event per TRANSITION, never one per refresh: the core admits 300 events a
// minute per integration, and a scene must run once when the internet drops,
// not every minute while it is down. Nothing fires on the first snapshot
// (there is nothing to compare with), and an unknown value (a channel that did
// not answer) is never taken for a change.
//
// The keys are declared in the manifest `scene_triggers`; scenes store them,
// so a published key is never renamed (test/manifest.test.js ties both).
// -----------------------------------------------------------------------------

import { internetState } from '../googlewifi/hub.js';
import * as accessPoint from '../devices/accessPoint.js';
import * as client from '../devices/client.js';
import { displayName as apName } from '../devices/accessPoint.js';
import { displayName as clientName } from '../devices/client.js';

export const TRIGGERS = {
  INTERNET_LOST: 'internet_lost',
  INTERNET_RESTORED: 'internet_restored',
  CLIENT_CONNECTED: 'client_connected',
  CLIENT_DISCONNECTED: 'client_disconnected',
  ACCESS_POINT_OFFLINE: 'access_point_offline',
  UPDATE_AVAILABLE: 'update_available',
};

export const SCENE_TRIGGER_KEYS = Object.values(TRIGGERS);

const byId = (list) => new Map(list.map((item) => [item.id, item]));

/**
 * The scene events between two snapshots.
 * @param {object} gladys for the external ids
 * @param {object|null} previous previous snapshot (null on the first refresh)
 * @param {object} current new snapshot
 * @param {object} config
 * @param {{ offlineSince?: number|null }} memory kept by the caller across calls
 * @param {number} now ms
 * @returns {{ key: string, data: Record<string, string|number|boolean|null> }[]}
 */
export function detectSceneEvents(gladys, previous, current, config, memory, now = Date.now()) {
  if (!previous) {
    const { online } = internetState(current, config);
    memory.offlineSince = online === false ? now : null;
    return [];
  }
  const events = [];

  // Internet, from whichever channel the user prefers (see internetState).
  const before = internetState(previous, config).online;
  const after = internetState(current, config);
  if (before === true && after.online === false) {
    memory.offlineSince = now;
    events.push({ key: TRIGGERS.INTERNET_LOST, data: { source: after.source } });
  } else if (before === false && after.online === true) {
    const since = memory.offlineSince ?? now;
    memory.offlineSince = null;
    events.push({
      key: TRIGGERS.INTERNET_RESTORED,
      data: { source: after.source, offline_minutes: Math.round((now - since) / 60000) },
    });
  }

  // Firmware update, local channel.
  if (previous.local.ok && current.local.ok) {
    const was = previous.local.status;
    const is = current.local.status;
    if (!was.updateAvailable && is.updateAvailable) {
      events.push({
        key: TRIGGERS.UPDATE_AVAILABLE,
        data: { current_version: is.currentVersion, new_version: is.newVersion },
      });
    }
  }

  // Points and devices, cloud channel: only when both snapshots answered.
  if (previous.cloud.ok && current.cloud.ok) {
    const oldGroups = byId(previous.cloud.groups);
    for (const group of current.cloud.groups) {
      const oldGroup = oldGroups.get(group.id);
      if (!oldGroup) {
        continue;
      }
      const oldAps = byId(oldGroup.accessPoints);
      for (const ap of group.accessPoints) {
        if (oldAps.get(ap.id)?.online === true && ap.online === false) {
          events.push({
            key: TRIGGERS.ACCESS_POINT_OFFLINE,
            data: { device: accessPoint.ids(gladys, ap).device, name: apName(ap) },
          });
        }
      }
      const oldStations = byId(oldGroup.stations);
      for (const station of group.stations) {
        // A device Google never saw before that joins counts as connected.
        const wasConnected = oldStations.get(station.id)?.connected ?? false;
        if (wasConnected === station.connected) {
          continue;
        }
        events.push({
          key: station.connected ? TRIGGERS.CLIENT_CONNECTED : TRIGGERS.CLIENT_DISCONNECTED,
          data: {
            device: client.ids(gladys, station).device,
            name: clientName(station),
            ip: station.ip || null,
          },
        });
      }
    }
  }
  return events;
}
