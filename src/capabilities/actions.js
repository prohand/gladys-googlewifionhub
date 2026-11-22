// -----------------------------------------------------------------------------
// Configuration screen actions (manifest `actions`): buttons under the form.
//
//   test_connection   read both channels now and say what answered
//   run_speed_test    measure the internet speed (cloud)
//   restart_wifi      restart the whole Wi-Fi system (cloud), behind a
//                     confirmation box: it cuts the network for minutes
//
// The resolved `{ en, fr, de, es }` message is shown under the button.
// -----------------------------------------------------------------------------

import { hasCloud, hasLocal } from '../config.js';
import { localize, pick } from '../i18n.js';
import {
  CLOUD_REQUIRED,
  RESTART_NOT_CONFIRMED,
  RESTART_REQUESTED,
  failureMessage,
  speedTestMessage,
} from './messages.js';

const T = {
  notConfigured: {
    en: 'not configured',
    fr: 'non configuré',
    de: 'nicht konfiguriert',
    es: 'no configurado',
  },
  local: { en: 'Local', fr: 'Local', de: 'Lokal', es: 'Local' },
  cloud: { en: 'Google cloud', fr: 'Cloud Google', de: 'Google-Cloud', es: 'Nube de Google' },
  ok: { en: 'OK', fr: 'OK', de: 'OK', es: 'OK' },
  internetOn: { en: 'internet up', fr: 'internet OK', de: 'Internet OK', es: 'internet OK' },
  internetOff: {
    en: 'internet DOWN',
    fr: 'internet COUPÉ',
    de: 'Internet GETRENNT',
    es: 'internet CAÍDO',
  },
  systems: { en: 'system(s)', fr: 'système(s)', de: 'System(e)', es: 'sistema(s)' },
  devices: {
    en: 'device(s) connected',
    fr: 'appareil(s) connecté(s)',
    de: 'Gerät(e) verbunden',
    es: 'dispositivo(s) conectado(s)',
  },
};

function localLine(language, snapshot, config) {
  const label = pick(language, T.local);
  if (!hasLocal(config)) {
    return `${label}: ${pick(language, T.notConfigured)}`;
  }
  if (!snapshot.local.ok) {
    return `${label}: ${snapshot.local.error}`;
  }
  const status = snapshot.local.status;
  const internet = pick(language, status.online ? T.internetOn : T.internetOff);
  return `${label}: ${pick(language, T.ok)} — ${status.model} ${status.currentVersion}, ${internet}`;
}

function cloudLine(language, snapshot, config) {
  const label = pick(language, T.cloud);
  if (!hasCloud(config)) {
    return `${label}: ${pick(language, T.notConfigured)}`;
  }
  if (!snapshot.cloud.ok) {
    return `${label}: ${snapshot.cloud.error}`;
  }
  const groups = snapshot.cloud.groups;
  const connected = groups.reduce(
    (sum, group) => sum + group.stations.filter((station) => station.connected).length,
    0,
  );
  return `${label}: ${pick(language, T.ok)} — ${groups.length} ${pick(language, T.systems)}, ${connected} ${pick(language, T.devices)}`;
}

export function createActions(app) {
  return {
    async test_connection() {
      const snapshot = await app.hub.refresh();
      await app.publishAfterRefresh(snapshot);
      await app.publishDiscovery({ force: true });
      return localize(
        (language) =>
          `${localLine(language, snapshot, app.config)}. ${cloudLine(language, snapshot, app.config)}.`,
      );
    },

    async run_speed_test() {
      if (!hasCloud(app.config)) {
        return localize((l) => pick(l, CLOUD_REQUIRED));
      }
      try {
        const result = await app.hub.runSpeedTest();
        await app.publishAfterRefresh(app.hub.snapshot);
        return speedTestMessage(result);
      } catch (err) {
        return failureMessage(err);
      }
    },

    async restart_wifi(fields = {}) {
      if (!hasCloud(app.config)) {
        return localize((l) => pick(l, CLOUD_REQUIRED));
      }
      if (fields.confirm !== true && fields.confirm !== 'true') {
        return localize((l) => pick(l, RESTART_NOT_CONFIRMED));
      }
      try {
        await app.hub.restart();
        return localize((l) => pick(l, RESTART_REQUESTED));
      } catch (err) {
        return failureMessage(err);
      }
    },
  };
}
