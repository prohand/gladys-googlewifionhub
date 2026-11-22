// -----------------------------------------------------------------------------
// Entry point of the Google Wifi / OnHub integration for Gladys Assistant.
//
// Nothing but the start: the handlers live in src/wiring.js (registered BEFORE
// connect()), the work in src/app.js and below.
//
// The Gladys supervisor gives the container GLADYS_HOST_API_URL,
// GLADYS_INTEGRATION_TOKEN and GLADYS_INTEGRATION_SELECTOR; the SDK reads them.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { App } from './src/app.js';
import { registerHandlers } from './src/wiring.js';

const gladys = new GladysIntegration();
const app = new App(gladys);
registerHandlers(gladys, app);

logger.info('Starting the Google Wifi / OnHub integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
