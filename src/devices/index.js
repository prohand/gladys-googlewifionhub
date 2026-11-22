// -----------------------------------------------------------------------------
// Device registry: which Gladys devices the Wi-Fi gives, their states and
// their transport badges, and where a command goes.
//
//   router        local channel  one per router address       router.js
//   network       cloud channel  one per Google Wifi system   network.js
//   access-point  cloud channel  one per Wi-Fi point          accessPoint.js
//   client        cloud channel  one per device on the Wi-Fi  client.js
//
// Discovery is built from the hub INVENTORY (what each channel last saw, kept
// during an outage); states from the live SNAPSHOT (nothing is published for
// a channel that is down: Gladys keeps the last value).
// -----------------------------------------------------------------------------

import { hasLocal } from '../config.js';
import * as accessPoint from './accessPoint.js';
import * as client from './client.js';
import * as network from './network.js';
import * as router from './router.js';

export const DEVICE_MODULES = { router, network, accessPoint, client };

/** External ids of the devices the user created in Gladys. */
export function createdIds(gladys) {
  return new Set((gladys.devices ?? []).map((device) => device.external_id));
}

/**
 * Every device the Wi-Fi gives, with the module that drives it and the item
 * (local status, system, point or station) it is built from.
 * @param {'inventory'|'live'} from inventory for Discovery, live for states
 */
export function listEntries(gladys, hub, config, from = 'inventory') {
  const entries = [];
  const localStatus = from === 'inventory' ? hub.inventory.local : hub.snapshot.local.status;
  const routerItem = hub.inventory.local ?? localStatus;
  if (hasLocal(config) && routerItem) {
    entries.push({ module: router, item: routerItem });
  }

  const groups =
    from === 'inventory'
      ? hub.inventory.groups
      : hub.snapshot.cloud.ok
        ? hub.snapshot.cloud.groups
        : [];
  const created = createdIds(gladys);
  for (const group of groups) {
    entries.push({ module: network, item: group, group });
    for (const ap of group.accessPoints) {
      entries.push({ module: accessPoint, item: ap, group });
    }
    for (const station of group.stations) {
      // Google remembers every device ever seen: Discovery lists the ones on
      // the Wi-Fi now, plus the ones the user already added.
      // States only go to the added ones.
      const isCreated = created.has(client.ids(gladys, station).device);
      const listed =
        from === 'inventory'
          ? isCreated || (config.publish_clients && station.connected)
          : isCreated;
      if (listed) {
        entries.push({ module: client, item: station, group });
      }
    }
  }
  return entries.map((entry) => ({
    ...entry,
    externalId: entry.module.ids(gladys, entry.item).device,
  }));
}

/** The Discovery payload. */
export function buildDiscoveredDevices(gladys, hub, config) {
  return listEntries(gladys, hub, config, 'inventory').map((entry) =>
    entry.module.build(gladys, entry.item),
  );
}

/** The states of the created devices, from the live snapshot. */
export function buildStates(gladys, hub, config) {
  const created = createdIds(gladys);
  return listEntries(gladys, hub, config, 'live')
    .filter((entry) => created.has(entry.externalId))
    .flatMap((entry) =>
      entry.module === router
        ? router.states(gladys, entry.item, hub.snapshot, config)
        : entry.module.states(gladys, entry.item),
    );
}

/** The transport badge of every created device. */
export function buildTransportEntries(gladys, hub, config) {
  const created = createdIds(gladys);
  return listEntries(gladys, hub, config, 'inventory')
    .filter((entry) => created.has(entry.externalId))
    .map((entry) => ({
      external_id: entry.externalId,
      ...entry.module.transport(hub.snapshot, config),
    }));
}

/** The entry a device external id belongs to, undefined when unknown. */
export function findEntry(gladys, hub, config, externalId) {
  return listEntries(gladys, hub, config, 'inventory').find(
    (entry) => entry.externalId === externalId,
  );
}

/**
 * Run a command from Gladys (onSetValue).
 * @returns {Promise<number>} the value to publish back as the new state
 */
export async function setValue(gladys, hub, config, device, feature, value) {
  const entry = findEntry(gladys, hub, config, device.external_id);
  if (!entry || typeof entry.module.setValue !== 'function') {
    throw new Error(`No command for ${device.external_id}`);
  }
  const featureKey = feature.external_id.slice(device.external_id.length + 1);
  return entry.module.setValue(hub, entry.item, featureKey, value);
}
