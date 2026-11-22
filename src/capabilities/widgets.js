// -----------------------------------------------------------------------------
// Dashboard widgets (Gladys 5.1+).
//
//   wifi_status   internet, firmware, uptime, points, last speed test, live
//                 throughput tiles, and a "Run a speed test" button
//   wifi_clients  the devices on the Wi-Fi right now, busiest first
//
// The content is declarative (status rows, value tiles, card list, button):
// the core renders it with its own theme. The computed parts change with the
// refreshes: app.js nudges the widgets when `widgetFingerprint` changes, the
// TTL is only a safety net. Live tiles follow the published states by
// themselves.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS, createLogger } from '@gladysassistant/integration-sdk';
import { hasCloud } from '../config.js';
import { internetState } from '../googlewifi/hub.js';
import { createdIds } from '../devices/index.js';
import * as network from '../devices/network.js';
import { displayName as clientName } from '../devices/client.js';
import { localize, pick } from '../i18n.js';
import { CLOUD_REQUIRED, failureMessage, speedTestMessage } from './messages.js';

const logger = createLogger({ name: 'widgets' });

export const WIFI_STATUS_WIDGET = 'wifi_status';
export const WIFI_CLIENTS_WIDGET = 'wifi_clients';

const ACTIONS = { SPEED_TEST: 'speed_test' };

const MAX_LIST_ITEMS = 8;

const L = {
  internet: { en: 'Internet', fr: 'Internet', de: 'Internet', es: 'Internet' },
  online: { en: 'Online', fr: 'Connecté', de: 'Online', es: 'Conectado' },
  offline: { en: 'Offline', fr: 'Coupé', de: 'Offline', es: 'Sin conexión' },
  unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  firmware: { en: 'Firmware', fr: 'Firmware', de: 'Firmware', es: 'Firmware' },
  update: { en: 'Update', fr: 'Mise à jour', de: 'Update', es: 'Actualización' },
  upToDate: { en: 'Up to date', fr: 'À jour', de: 'Aktuell', es: 'Al día' },
  available: { en: 'Available', fr: 'Disponible', de: 'Verfügbar', es: 'Disponible' },
  uptime: { en: 'Uptime', fr: 'Allumé depuis', de: 'Laufzeit', es: 'Encendido desde' },
  days: { en: 'days', fr: 'jours', de: 'Tage', es: 'días' },
  clients: {
    en: 'Connected devices',
    fr: 'Appareils connectés',
    de: 'Verbundene Geräte',
    es: 'Dispositivos conectados',
  },
  points: { en: 'Wi-Fi points', fr: 'Points Wi-Fi', de: 'WLAN-Punkte', es: 'Puntos Wi-Fi' },
  speedTest: {
    en: 'Last speed test',
    fr: 'Dernier test de débit',
    de: 'Letzter Speedtest',
    es: 'Último test de velocidad',
  },
  download: { en: 'Download', fr: 'Descente', de: 'Download', es: 'Bajada' },
  upload: { en: 'Upload', fr: 'Montée', de: 'Upload', es: 'Subida' },
  runSpeedTest: {
    en: 'Run a speed test',
    fr: 'Lancer un test de débit',
    de: 'Speedtest starten',
    es: 'Test de velocidad',
  },
  noData: {
    en: 'No data yet: check the configuration of the integration.',
    fr: 'Pas encore de données : vérifiez la configuration de l’intégration.',
    de: 'Noch keine Daten: Prüfe die Konfiguration der Integration.',
    es: 'Aún no hay datos: revise la configuración de la integración.',
  },
  noClient: {
    en: 'No device on the Wi-Fi right now.',
    fr: 'Aucun appareil sur le Wi-Fi pour le moment.',
    de: 'Gerade ist kein Gerät im WLAN.',
    es: 'No hay ningún dispositivo en el Wi-Fi ahora mismo.',
  },
  paused: { en: 'Paused', fr: 'En pause', de: 'Pausiert', es: 'En pausa' },
  guest: { en: 'Guest', fr: 'Invité', de: 'Gast', es: 'Invitado' },
};

const t = (key) => localize((language) => pick(language, L[key]));

function internetRow(app) {
  const { online } = internetState(app.hub.snapshot, app.config);
  if (online === true) {
    return {
      label: t('internet'),
      icon: 'globe',
      value: t('online'),
      color: WIDGET_COLORS.SUCCESS,
    };
  }
  if (online === false) {
    return {
      label: t('internet'),
      icon: 'globe',
      value: t('offline'),
      color: WIDGET_COLORS.DANGER,
    };
  }
  return { label: t('internet'), icon: 'globe', value: t('unknown'), color: WIDGET_COLORS.NEUTRAL };
}

function statusItems(app) {
  const { snapshot } = app.hub;
  const items = [internetRow(app)];
  if (snapshot.local.ok) {
    const status = snapshot.local.status;
    if (status.currentVersion) {
      items.push({
        label: t('firmware'),
        icon: 'cpu',
        value: `${status.model} ${status.currentVersion}`.slice(0, 40),
        color: WIDGET_COLORS.NEUTRAL,
      });
    }
    items.push({
      label: t('update'),
      icon: 'download-cloud',
      value: status.updateAvailable
        ? localize((l) => `${pick(l, L.available)} ${status.newVersion}`.trim().slice(0, 40))
        : t('upToDate'),
      color: status.updateAvailable ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
    });
    if (status.uptimeSeconds !== null) {
      const days = Math.floor(status.uptimeSeconds / 86400);
      items.push({
        label: t('uptime'),
        icon: 'clock',
        value: localize((l) => `${days} ${pick(l, L.days)}`),
        color: WIDGET_COLORS.NEUTRAL,
      });
    }
  }
  if (snapshot.cloud.ok) {
    for (const group of snapshot.cloud.groups) {
      const prefix = snapshot.cloud.groups.length > 1 && group.ssid ? `${group.ssid} · ` : '';
      items.push({
        label: localize((l) => `${prefix}${pick(l, L.clients)}`.slice(0, 40)),
        icon: 'smartphone',
        value: network.connectedCount(group),
        color: WIDGET_COLORS.INFO,
      });
      const online = group.accessPoints.filter((ap) => ap.online === true).length;
      const total = group.accessPoints.length;
      if (total > 0) {
        items.push({
          label: localize((l) => `${prefix}${pick(l, L.points)}`.slice(0, 40)),
          icon: 'wifi',
          value: `${online}/${total}`,
          color: online === total ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.WARNING,
        });
      }
      if (group.speedTest) {
        items.push({
          label: localize((l) => `${prefix}${pick(l, L.speedTest)}`.slice(0, 40)),
          icon: 'activity',
          value: `↓${group.speedTest.downloadMbps ?? '?'} ↑${group.speedTest.uploadMbps ?? '?'} Mb/s`,
          color: WIDGET_COLORS.NEUTRAL,
        });
      }
    }
  }
  // The status component holds ten rows at most.
  return items.slice(0, 10);
}

function liveTiles(app) {
  const created = createdIds(app.gladys);
  const tiles = [];
  for (const group of app.hub.inventory.groups) {
    const id = network.ids(app.gladys, group);
    if (!created.has(id.device)) {
      continue;
    }
    tiles.push(
      {
        type: 'value',
        label: t('download'),
        icon: 'arrow-down',
        device_feature: id.feature(network.FEATURE.DOWNLOAD),
      },
      {
        type: 'value',
        label: t('upload'),
        icon: 'arrow-up',
        device_feature: id.feature(network.FEATURE.UPLOAD),
      },
    );
  }
  return tiles.slice(0, 4);
}

function connectedClients(app) {
  if (!app.hub.snapshot.cloud.ok) {
    return [];
  }
  return app.hub.snapshot.cloud.groups
    .flatMap((group) => group.stations)
    .filter((station) => station.connected)
    .sort((a, b) => (b.downloadMbps ?? 0) - (a.downloadMbps ?? 0));
}

function bandLabel(band) {
  if (/6/.test(band)) return '6 GHz';
  if (/5/.test(band)) return '5 GHz';
  if (/2/.test(band)) return '2.4 GHz';
  return '';
}

/** What the computed parts of the widgets depend on (changes -> nudge). */
export function widgetFingerprint(app) {
  const { snapshot } = app.hub;
  return JSON.stringify([
    internetState(snapshot, app.config).online,
    snapshot.local.ok
      ? [
          snapshot.local.status.currentVersion,
          snapshot.local.status.updateAvailable,
          Math.floor((snapshot.local.status.uptimeSeconds ?? 0) / 86400),
        ]
      : null,
    snapshot.cloud.ok
      ? snapshot.cloud.groups.map((group) => [
          group.accessPoints.map((ap) => ap.online),
          group.speedTest,
          group.stations
            .filter((station) => station.connected)
            .map((station) => [station.id, station.paused, station.name])
            .sort(),
        ])
      : null,
  ]);
}

export function createWidgets(app) {
  return {
    [WIFI_STATUS_WIDGET]: {
      async get() {
        logger.debug(`onWidgetGet <- ${WIFI_STATUS_WIDGET}`);
        const { snapshot } = app.hub;
        if (!snapshot.local.ok && !snapshot.cloud.ok) {
          return {
            ttl_seconds: 60,
            components: [
              { type: 'text', text: t('noData') },
              { type: 'status', items: [internetRow(app)] },
            ],
          };
        }
        const components = [...liveTiles(app), { type: 'status', items: statusItems(app) }];
        if (hasCloud(app.config) && snapshot.cloud.ok) {
          components.push({
            type: 'button',
            label: t('runSpeedTest'),
            icon: 'zap',
            style: 'secondary',
            action: { key: ACTIONS.SPEED_TEST, params: {} },
          });
        }
        return { ttl_seconds: 300, components };
      },

      async action({ actionKey }) {
        logger.info(`onWidgetAction <- ${WIFI_STATUS_WIDGET}.${actionKey}`);
        if (actionKey !== ACTIONS.SPEED_TEST) {
          throw new Error(`Unknown widget action: ${actionKey}`);
        }
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
    },

    [WIFI_CLIENTS_WIDGET]: {
      async get() {
        logger.debug(`onWidgetGet <- ${WIFI_CLIENTS_WIDGET}`);
        if (!hasCloud(app.config)) {
          return {
            ttl_seconds: 3600,
            components: [{ type: 'text', text: localize((l) => pick(l, CLOUD_REQUIRED)) }],
          };
        }
        const clients = connectedClients(app);
        if (clients.length === 0) {
          return { ttl_seconds: 120, components: [{ type: 'text', text: t('noClient') }] };
        }
        return {
          ttl_seconds: 300,
          components: [
            {
              type: 'card-list',
              display: 'list',
              items: clients.slice(0, MAX_LIST_ITEMS).map((station) => {
                const item = {
                  title: clientName(station).slice(0, 60),
                  subtitle: [station.ip, bandLabel(station.band)]
                    .filter(Boolean)
                    .join(' · ')
                    .slice(0, 60),
                };
                if (station.paused) {
                  item.badge = { text: t('paused'), color: WIDGET_COLORS.WARNING };
                } else if (station.guest) {
                  item.badge = { text: t('guest'), color: WIDGET_COLORS.INFO };
                }
                if (!item.subtitle) {
                  delete item.subtitle;
                }
                return item;
              }),
            },
          ],
        };
      },
    },
  };
}

/** Ask the core to re-pull every widget now (rate-limited core-side). */
export function refreshWidgets(gladys) {
  for (const key of [WIFI_STATUS_WIDGET, WIFI_CLIENTS_WIDGET]) {
    gladys.requestWidgetRefresh(key);
  }
}
