// -----------------------------------------------------------------------------
// SDK wiring: every Gladys handler, registered on a GladysIntegration before
// connect(). Kept out of index.js so the tests run the very same wiring
// against the SDK's fake Gladys.
// -----------------------------------------------------------------------------

import { logger } from '@gladysassistant/integration-sdk';
import { createActions } from './capabilities/actions.js';
import { createSceneActions } from './capabilities/scenes.js';
import { createWidgets } from './capabilities/widgets.js';

/**
 * @param {import('@gladysassistant/integration-sdk').GladysIntegration} gladys
 * @param {import('./app.js').App} app
 */
export function registerHandlers(gladys, app) {
  // --- Discovery -------------------------------------------------------------
  gladys.onScanRequest(async () => {
    logger.info('onScanRequest -> refreshing, then publishing the devices');
    await app.hub.refresh();
    await app.publishDiscovery({ force: true });
  });

  // --- Commands (internet access of a device, light ring of a point) ---------
  gladys.onSetValue(async (device, feature, value) => {
    logger.info(`onSetValue <- ${feature.external_id} = ${value}`);
    await app.setValue(device, feature, value);
  });

  // --- A device was added: give it its values and badge right away -----------
  gladys.onDeviceCreated(async () => {
    await app.publishTransports({ force: true });
    await app.publishAfterRefresh(app.hub.snapshot);
  });

  // --- Configuration screen actions ------------------------------------------
  for (const [key, handler] of Object.entries(createActions(app))) {
    gladys.onAction(key, (fields) => handler(fields));
  }

  // --- Scene actions ---------------------------------------------------------
  for (const [key, handler] of Object.entries(createSceneActions(app))) {
    gladys.onSceneAction(key, (fields) => handler(fields));
  }

  // --- Dashboard widgets -----------------------------------------------------
  for (const [key, widget] of Object.entries(createWidgets(app))) {
    gladys.onWidgetGet(key, (request) => widget.get(request));
    if (typeof widget.action === 'function') {
      gladys.onWidgetAction(key, (actionKey, params) => widget.action({ actionKey, params }));
    }
  }

  // --- Configuration saved by the user ---------------------------------------
  gladys.onConfigUpdated(async (newConfig) => {
    logger.info('onConfigUpdated -> new configuration');
    app.applyConfig(newConfig);
    app.start();
    await app.refresh();
    await app.publishDiscovery({ force: true });
  });

  // --- Connection lifecycle --------------------------------------------------
  gladys.on('connected', async () => {
    try {
      app.applyConfig(await gladys.getConfig());
      await app.refresh();
      await app.publishDiscovery({ force: true });
      await app.publishTransports({ force: true });
      app.start();
    } catch (err) {
      logger.error('Post-connection initialization failed', err);
      await gladys
        .setConnectionStatus(false, {
          en: 'Initialization failed, check the integration logs.',
          fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
          de: 'Die Initialisierung ist fehlgeschlagen, sieh dir die Logs der Integration an.',
          es: 'La inicialización falló, consulte los registros de la integración.',
        })
        .catch(() => {});
    }
  });

  gladys.on('disconnected', () => {
    app.stop();
  });

  gladys.handleShutdown((signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    app.stop();
  });
}
