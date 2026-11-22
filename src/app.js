// -----------------------------------------------------------------------------
// The application: one hub, one refresh timer, and what is published to
// Gladys after each refresh. index.js only wires the SDK handlers to it, so
// the tests drive the whole integration through the SDK's fake Gladys.
//
// After every refresh:
//   1. the states of the created devices (only the values that changed, plus
//      a heartbeat every 30 minutes so a stable value stays recently dated);
//   2. the transport badges, when one changed;
//   3. the scene events (transitions only, see capabilities/triggers.js);
//   4. the connection status shown in the Configuration screen;
//   5. Discovery again when a new device appeared on the Wi-Fi;
//   6. a nudge to the dashboard widgets when their content changed.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { hasCloud, hasLocal, normalizeConfig } from './config.js';
import { Hub } from './googlewifi/hub.js';
import {
  buildDiscoveredDevices,
  buildStates,
  buildTransportEntries,
  setValue as runSetValue,
} from './devices/index.js';
import { detectSceneEvents } from './capabilities/triggers.js';
import { refreshWidgets, widgetFingerprint } from './capabilities/widgets.js';
import { localize, pick } from './i18n.js';

const logger = createLogger({ name: 'app' });

export const STATE_HEARTBEAT_MS = 30 * 60 * 1000;

const MESSAGES = {
  nothingConfigured: {
    en: 'Enter the address of your router and/or a Google refresh token.',
    fr: 'Renseignez l’adresse de votre routeur et/ou un jeton Google (refresh token).',
    de: 'Gib die Adresse deines Routers und/oder ein Google-Refresh-Token ein.',
    es: 'Introduzca la dirección de su router y/o un token de Google (refresh token).',
  },
  localDown: {
    en: 'Router unreachable on the local network',
    fr: 'Routeur injoignable sur le réseau local',
    de: 'Router im lokalen Netzwerk nicht erreichbar',
    es: 'Router inaccesible en la red local',
  },
  cloudAuth: {
    en: 'Google refused the refresh token: generate a new one',
    fr: 'Google a refusé le jeton : générez-en un nouveau',
    de: 'Google hat das Token abgelehnt: erzeuge ein neues',
    es: 'Google rechazó el token: genere uno nuevo',
  },
  cloudDown: {
    en: 'Google cloud unreachable',
    fr: 'Cloud Google injoignable',
    de: 'Google-Cloud nicht erreichbar',
    es: 'Nube de Google inaccesible',
  },
};

/** The connection status for a snapshot: `{ connected, message? }`. */
export function connectionStatus(snapshot, config) {
  if (!hasLocal(config) && !hasCloud(config)) {
    return { connected: false, message: localize((l) => pick(l, MESSAGES.nothingConfigured)) };
  }
  const problems = [];
  if (snapshot.local.configured && !snapshot.local.ok) {
    problems.push(MESSAGES.localDown);
  }
  if (snapshot.cloud.configured && !snapshot.cloud.ok) {
    problems.push(snapshot.cloud.authError ? MESSAGES.cloudAuth : MESSAGES.cloudDown);
  }
  const connected = snapshot.local.ok || snapshot.cloud.ok;
  if (problems.length === 0) {
    return { connected };
  }
  return {
    connected,
    message: localize((l) => `${problems.map((problem) => pick(l, problem)).join('. ')}.`),
  };
}

export class App {
  /**
   * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
   * @param {object} [options] injected by the tests
   */
  constructor(gladys, { fetch: doFetch, now = Date.now, sleep } = {}) {
    this.gladys = gladys;
    this.now = now;
    this.hub = new Hub({ fetch: doFetch, now, sleep });
    this.config = normalizeConfig();
    this.hub.configure(this.config);
    this.timer = null;
    this.memory = { offlineSince: null };
    this.lastTransports = '';
    this.lastDiscovery = '';
    this.lastStatus = '';
    this.lastWidgets = '';
  }

  applyConfig(raw) {
    this.config = normalizeConfig(raw ?? {});
    this.hub.configure(this.config);
    // A new configuration can change every badge and the status message.
    this.lastTransports = '';
    this.lastStatus = '';
  }

  /** Publish Discovery from what the channels last saw. */
  async publishDiscovery({ force = false } = {}) {
    const devices = buildDiscoveredDevices(this.gladys, this.hub, this.config);
    const fingerprint = devices
      .map((device) => `${device.external_id}=${device.name}`)
      .sort()
      .join('|');
    if (!force && fingerprint === this.lastDiscovery) {
      return;
    }
    this.lastDiscovery = fingerprint;
    await this.gladys.publishDiscoveredDevices(devices);
  }

  /** One refresh, and everything it publishes. Never throws. */
  async refresh() {
    try {
      const snapshot = await this.hub.refresh();
      await this.publishAfterRefresh(snapshot);
    } catch (err) {
      logger.error('Refresh failed', err);
    }
  }

  async publishAfterRefresh(snapshot) {
    const { gladys, config } = this;

    await this.publishDiscovery();

    const states = buildStates(gladys, this.hub, config);
    if (states.length > 0) {
      await gladys.publishChangedStates(states, { heartbeat: STATE_HEARTBEAT_MS });
    }

    await this.publishTransports();

    for (const event of detectSceneEvents(
      gladys,
      this.hub.previous,
      snapshot,
      config,
      this.memory,
      this.now(),
    )) {
      logger.info(`Scene event ${event.key}`);
      await gladys.publishSceneEvent(event.key, event.data).catch((err) => {
        logger.warn(`Scene event ${event.key} refused: ${err.message}`);
      });
    }

    const status = connectionStatus(snapshot, config);
    const statusKey = JSON.stringify(status);
    if (statusKey !== this.lastStatus) {
      this.lastStatus = statusKey;
      await gladys.setConnectionStatus(status.connected, status.message);
    }

    const widgets = widgetFingerprint(this);
    if (widgets !== this.lastWidgets) {
      this.lastWidgets = widgets;
      refreshWidgets(gladys);
    }
  }

  async publishTransports({ force = false } = {}) {
    const entries = buildTransportEntries(this.gladys, this.hub, this.config);
    const key = JSON.stringify(entries);
    if (entries.length === 0 || (!force && key === this.lastTransports)) {
      return;
    }
    this.lastTransports = key;
    await this.gladys.publishTransports(entries);
  }

  /** Start (or restart) the refresh timer, at the configured interval. */
  start() {
    this.stop();
    this.timer = setInterval(() => {
      this.refresh();
    }, this.config.poll_frequency * 1000);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** A command from Gladys: run it, then publish the new state at once. */
  async setValue(device, feature, value) {
    const state = await runSetValue(this.gladys, this.hub, this.config, device, feature, value);
    await this.gladys.publishState(feature.external_id, state);
  }
}
