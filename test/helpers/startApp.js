// -----------------------------------------------------------------------------
// Start the whole integration (same wiring as index.js) against the SDK's
// fake Gladys and a fake fetch: no network, no Gladys.
// -----------------------------------------------------------------------------

import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { App } from '../../src/app.js';
import { registerHandlers } from '../../src/wiring.js';
import { createFakeFetch } from './fakeFetch.js';
import { FULL_CONFIG, healthyRoutes } from './fixtures.js';

export async function startApp(
  t,
  { routes = healthyRoutes(), config = FULL_CONFIG, devices = [], now } = {},
) {
  const fetch = createFakeFetch(routes);
  const gladys = createFakeGladys({ config, devices });
  const app = new App(gladys, { fetch, now, sleep: async () => {} });
  registerHandlers(gladys, app);
  await gladys.connect();
  t.after(async () => {
    app.stop();
    await gladys.disconnect();
  });
  return { gladys, app, fetch, fake: gladys.fake };
}

/** Add every discovered device whose name matches, like the user would. */
export async function addDevices(fake, predicate = () => true) {
  for (const device of fake.discoveredDevices.filter(predicate)) {
    await fake.deviceCreated(device);
  }
}
