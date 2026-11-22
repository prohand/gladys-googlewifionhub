// -----------------------------------------------------------------------------
// Scene actions (Gladys 5.1+): what a scene can ask the Wi-Fi to do.
//
//   pause_client      pause / resume the internet of one device     (cloud)
//   run_speed_test    measure the internet speed                    (cloud)
//   restart_wifi      restart one Wi-Fi point, or the whole system  (cloud)
//   check_internet    read the internet state now                   (local or cloud)
//
// `fields` arrive resolved by the core (a `"source": "devices"` field is the
// chosen device external_id). Each handler resolves the outputs declared in
// the manifest; throwing fails this action only, the scene goes on.
// Never fire a scene event from here: a scene bound to it would loop.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { internetState } from '../googlewifi/hub.js';
import { findEntry } from '../devices/index.js';
import * as accessPoint from '../devices/accessPoint.js';
import * as client from '../devices/client.js';
import * as network from '../devices/network.js';

const logger = createLogger({ name: 'scenes' });

function entryOf(app, externalId, module, what) {
  const entry = findEntry(app.gladys, app.hub, app.config, externalId);
  if (!entry || entry.module !== module) {
    throw new Error(`The chosen device is not ${what}`);
  }
  return entry;
}

export function createSceneActions(app) {
  return {
    async pause_client({ device, paused = true }) {
      logger.info(`Scene action pause_client <- ${device} (${paused})`);
      const entry = entryOf(app, device, client, 'a device of the Wi-Fi');
      const pause = paused === true || paused === 'true';
      await app.hub.setStationPaused(entry.item.id, pause);
      await app.publishAfterRefresh(app.hub.snapshot);
      return { paused: pause };
    },

    async run_speed_test() {
      logger.info('Scene action run_speed_test');
      const result = await app.hub.runSpeedTest();
      await app.publishAfterRefresh(app.hub.snapshot);
      return { download_mbps: result.downloadMbps, upload_mbps: result.uploadMbps };
    },

    async restart_wifi({ device } = {}) {
      logger.info(`Scene action restart_wifi <- ${device || 'whole system'}`);
      if (!device) {
        await app.hub.restart();
        return { restarted: true };
      }
      const entry = findEntry(app.gladys, app.hub, app.config, device);
      if (entry?.module === accessPoint) {
        await app.hub.restart(entry.item.id);
      } else if (entry?.module === network || entry?.module?.TYPE === 'router') {
        await app.hub.restart();
      } else {
        throw new Error('The chosen device is not a Wi-Fi point nor a Wi-Fi network');
      }
      return { restarted: true };
    },

    async check_internet() {
      logger.info('Scene action check_internet');
      const snapshot = await app.hub.refresh();
      await app.publishAfterRefresh(snapshot);
      const { online, source } = internetState(snapshot, app.config);
      const connected = snapshot.cloud.ok
        ? snapshot.cloud.groups.reduce((sum, group) => sum + network.connectedCount(group), 0)
        : null;
      return {
        online: online === true,
        source: source ?? 'none',
        connected_clients: connected,
      };
    },
  };
}
