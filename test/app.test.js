import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDevices, startApp } from './helpers/startApp.js';
import { reply } from './helpers/fakeFetch.js';
import {
  GROUP_ID,
  ROUTER_HOST,
  STATION_OLD,
  STATION_TV,
  foyer,
  groupStatus,
  healthyRoutes,
  localStatus,
  stations,
} from './helpers/fixtures.js';

const byName = (fake, name) => fake.discoveredDevices.find((device) => device.name === name);

test('on connection: router, network, points and connected devices are discovered', async (t) => {
  const { fake } = await startApp(t);
  const names = fake.discoveredDevices.map((device) => device.name).sort();
  assert.deepEqual(names, [
    'Google Wifi router',
    'Pixel de Sam',
    'TV Salon',
    'Wi-Fi Maison',
    'Wi-Fi point Bureau',
    'Wi-Fi point Salon',
  ]);
  // A device Google remembers but that is not on the Wi-Fi is not listed.
  assert.ok(!fake.discoveredDevices.some((d) => d.external_id.includes(STATION_OLD)));
  assert.deepEqual(fake.connectionStatus, { connected: true });
});

test('every published feature carries the columns Gladys stores NOT NULL', async (t) => {
  const { fake } = await startApp(t);
  for (const device of fake.discoveredDevices) {
    for (const feature of device.features) {
      for (const column of ['name', 'min', 'max', 'read_only', 'has_feedback']) {
        assert.notEqual(feature[column], undefined, `${feature.external_id} lacks ${column}`);
      }
    }
  }
});

test('external ids are built from the platform ids, never from labels', async (t) => {
  const { fake } = await startApp(t);
  const ids = fake.discoveredDevices.map((device) => device.external_id).sort();
  assert.deepEqual(ids, [
    'ext:test-integration:access-point:ap-main-01',
    'ext:test-integration:access-point:ap-point-02',
    'ext:test-integration:client:st-phone-1',
    'ext:test-integration:client:st-tv-2',
    'ext:test-integration:network:grp-AAA111',
    'ext:test-integration:router:dev-0f3a-91',
  ]);
});

test('states are published for the created devices only', async (t) => {
  const { app, fake } = await startApp(t);
  assert.equal(fake.states.length, 0, 'nothing created yet, nothing published');
  await addDevices(fake, (d) => d.name === 'Google Wifi router' || d.name === 'Wi-Fi Maison');
  await app.refresh();
  const router = 'ext:test-integration:router:dev-0f3a-91';
  const network = 'ext:test-integration:network:grp-AAA111';
  assert.equal(fake.lastState(`${router}:internet`), 1);
  assert.equal(fake.lastState(`${router}:uptime`), 3.04);
  assert.equal(fake.lastState(`${router}:firmware`), '14150.376.32');
  assert.equal(fake.lastState(`${router}:wan-ip`), '203.0.113.42');
  assert.equal(fake.lastState(`${router}:update-available`), 0);
  assert.equal(fake.lastState(`${network}:download`), 52.3);
  assert.equal(fake.lastState(`${network}:clients`), 2);
  assert.equal(fake.lastState(`${network}:speedtest-download`), 912.4);
  assert.ok(!fake.states.some((s) => s.device_feature_external_id.includes(':client:')));
});

test('unchanged values are not published again', async (t) => {
  const { app, fake } = await startApp(t);
  await addDevices(fake, (d) => d.name === 'Google Wifi router');
  await app.refresh();
  const count = fake.states.length;
  await app.refresh();
  assert.equal(fake.states.length, count);
});

test('transport badges: router local, cloud devices cloud', async (t) => {
  const { app, fake } = await startApp(t);
  await addDevices(fake);
  await app.publishTransports({ force: true });
  const last = new Map(fake.transports.map((entry) => [entry.device_external_id, entry]));
  assert.equal(last.get('ext:test-integration:router:dev-0f3a-91').transport, 'local');
  assert.equal(last.get('ext:test-integration:network:grp-AAA111').transport, 'cloud');
  assert.equal(last.get('ext:test-integration:client:st-tv-2').transport, 'cloud');
});

test('router down on the LAN: internet read from the cloud, badge degraded', async (t) => {
  const routes = healthyRoutes();
  const { app, fake, fetch } = await startApp(t, { routes });
  await addDevices(fake);
  fetch.routes[`GET http://${ROUTER_HOST}/api/v1/status`] = new TypeError('fetch failed');
  await app.refresh();
  const router = fake.transports.filter(
    (entry) => entry.device_external_id === 'ext:test-integration:router:dev-0f3a-91',
  );
  const last = router.at(-1);
  assert.equal(last.transport, 'cloud');
  assert.equal(last.degraded, true);
  assert.ok(last.message.fr && last.message.de && last.message.es);
  // The device stays in Discovery during the outage.
  assert.ok(byName(fake, 'Google Wifi router'));
  // The status says what is wrong, in every language.
  assert.equal(fake.connectionStatus.connected, true);
  assert.match(fake.connectionStatus.message.fr, /Routeur injoignable/);
});

test('"prefer local" off: the router internet state comes from the cloud', async (t) => {
  const routes = healthyRoutes({
    [`GET http://${ROUTER_HOST}/api/v1/status`]: localStatus({ wan: { online: true } }),
    [`GET ${foyer(`/v2/groups/${GROUP_ID}/status`)}`]: groupStatus({ online: false }),
  });
  const { app, fake } = await startApp(t, { routes });
  await addDevices(fake, (d) => d.name === 'Google Wifi router');
  await app.refresh();
  assert.equal(fake.lastState('ext:test-integration:router:dev-0f3a-91:internet'), 1);
  await fake.configUpdated({ ...fake.config, GLADYS_PREFER_LOCAL: false });
  assert.equal(fake.lastState('ext:test-integration:router:dev-0f3a-91:internet'), 0);
});

test('nothing configured: disconnected with a message', async (t) => {
  const { fake } = await startApp(t, { config: { router_host: '' } });
  assert.equal(fake.connectionStatus.connected, false);
  assert.ok(fake.connectionStatus.message.en.includes('router'));
  assert.equal(fake.discoveredDevices.length, 0);
});

test('local only: the router is published, the cloud devices are not', async (t) => {
  const { fake } = await startApp(t, { config: { router_host: ROUTER_HOST } });
  assert.deepEqual(
    fake.discoveredDevices.map((d) => d.name),
    ['Google Wifi router'],
  );
  assert.deepEqual(fake.connectionStatus, { connected: true });
});

test('a revoked token says so in the connection status', async (t) => {
  const routes = healthyRoutes({
    'POST https://www.googleapis.com/oauth2/v4/token': reply(400, { error: 'invalid_grant' }),
  });
  const { fake } = await startApp(t, { routes });
  assert.match(fake.connectionStatus.message.en, /refresh token/);
  assert.match(fake.connectionStatus.message.de, /Token/);
});

test('switching off a device internet access pauses it through the cloud', async (t) => {
  const routes = healthyRoutes({
    [`PUT ${foyer(`/v2/groups/${GROUP_ID}/stationBlocking`)}`]: {},
  });
  const { fake, fetch } = await startApp(t, { routes });
  await addDevices(fake, (d) => d.name === 'TV Salon');
  const tv = byName(fake, 'TV Salon');
  const access = tv.features.find((f) => f.external_id.endsWith(':internet-access'));
  const ack = await fake.setValue(tv, access, 0);
  assert.equal(ack.success, true);
  const call = fetch.calls.find((c) => c.path.endsWith('/stationBlocking'));
  assert.deepEqual(JSON.parse(call.body), { blocked: 'true', stationId: STATION_TV });
  assert.equal(fake.lastState(access.external_id), 0);
});

test('setting the light ring of a point', async (t) => {
  const routes = healthyRoutes({
    [`PUT ${foyer('/v2/accesspoints/ap-point-02/lighting')}`]: {},
  });
  const { fake } = await startApp(t, { routes });
  const point = byName(fake, 'Wi-Fi point Bureau');
  const light = point.features.find((f) => f.external_id.endsWith(':light'));
  const ack = await fake.setValue(point, light, 25);
  assert.equal(ack.success, true);
  assert.equal(fake.lastState(light.external_id), 25);
});

test('a read-only feature cannot be commanded', async (t) => {
  const { fake } = await startApp(t);
  const router = byName(fake, 'Google Wifi router');
  const ack = await fake.setValue(router, router.features[0], 1);
  assert.equal(ack.success, false);
});

test('a new device on the Wi-Fi re-publishes Discovery', async (t) => {
  const { app, fake, fetch } = await startApp(t);
  const before = fake.discoveredDevices.length;
  const list = stations();
  list.stations[2].connected = true;
  fetch.routes[`GET ${foyer(`/v2/groups/${GROUP_ID}/stations`)}`] = list;
  await app.refresh();
  assert.equal(fake.discoveredDevices.length, before + 1);
});

test('the clients option off: no client in Discovery', async (t) => {
  const { fake } = await startApp(t, {
    config: { router_host: ROUTER_HOST, refresh_token: 'x', publish_clients: false },
  });
  assert.ok(!fake.discoveredDevices.some((d) => d.external_id.includes(':client:')));
});

test('the refresh token never reaches a log line nor Gladys', async (t) => {
  const { fake } = await startApp(t);
  const everything = JSON.stringify([fake.requests, fake.wsMessages]);
  assert.doesNotMatch(everything, /refresh-token-secret/);
  assert.doesNotMatch(everything, /foyer-token|oauth-access-token/);
});
