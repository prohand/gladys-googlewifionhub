import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startApp, addDevices } from './helpers/startApp.js';
import {
  GROUP_ID,
  ROUTER_HOST,
  foyer,
  groupStatus,
  localStatus,
  stations,
} from './helpers/fixtures.js';

const LOCAL = `GET http://${ROUTER_HOST}/api/v1/status`;

test('nothing fires on the first refresh', async (t) => {
  const { fake } = await startApp(t);
  assert.deepEqual(fake.sceneEvents, []);
});

test('internet lost, then restored with the outage length, once each', async (t) => {
  let now = Date.parse('2026-11-22T10:00:00Z');
  const { app, fake, fetch } = await startApp(t, { now: () => now });
  fetch.routes[LOCAL] = localStatus({ wan: { online: false } });
  now += 60_000;
  await app.refresh();
  now += 60_000;
  await app.refresh();
  assert.deepEqual(fake.sceneEvents, [{ key: 'internet_lost', data: { source: 'local' } }]);

  fetch.routes[LOCAL] = localStatus();
  now += 5 * 60_000;
  await app.refresh();
  assert.deepEqual(fake.sceneEvents.at(-1), {
    key: 'internet_restored',
    data: { source: 'local', offline_minutes: 6 },
  });
  assert.equal(fake.sceneEvents.length, 2);
});

test('a router that stops answering is not an internet outage', async (t) => {
  const { app, fake, fetch } = await startApp(t, { config: { router_host: ROUTER_HOST } });
  fetch.routes[LOCAL] = new TypeError('fetch failed');
  await app.refresh();
  assert.deepEqual(fake.sceneEvents, []);
});

test('devices joining and leaving the Wi-Fi', async (t) => {
  const { app, fake, fetch } = await startApp(t);
  fetch.routes[`GET ${foyer(`/v2/groups/${GROUP_ID}/stations`)}`] = stations({ phone: false });
  await app.refresh();
  fetch.routes[`GET ${foyer(`/v2/groups/${GROUP_ID}/stations`)}`] = stations({ phone: true });
  await app.refresh();
  assert.deepEqual(
    fake.sceneEvents.map((event) => [event.key, event.data.name, event.data.device]),
    [
      ['client_disconnected', 'Pixel de Sam', 'ext:test-integration:client:st-phone-1'],
      ['client_connected', 'Pixel de Sam', 'ext:test-integration:client:st-phone-1'],
    ],
  );
  assert.equal(fake.sceneEvents[1].data.ip, '192.168.86.23');
});

test('a Wi-Fi point going offline', async (t) => {
  const { app, fake, fetch } = await startApp(t);
  fetch.routes[`GET ${foyer(`/v2/groups/${GROUP_ID}/status`)}`] = groupStatus({
    point: 'AP_OFFLINE',
  });
  await app.refresh();
  assert.deepEqual(fake.sceneEvents, [
    {
      key: 'access_point_offline',
      data: { device: 'ext:test-integration:access-point:ap-point-02', name: 'Wi-Fi point Bureau' },
    },
  ]);
});

test('a firmware update announced by the router', async (t) => {
  const { app, fake, fetch } = await startApp(t);
  await addDevices(fake, (d) => d.name === 'Google Wifi router');
  fetch.routes[LOCAL] = localStatus({ software: { updateNewVersion: '14200.1.2' } });
  await app.refresh();
  assert.deepEqual(fake.sceneEvents, [
    {
      key: 'update_available',
      data: { current_version: '14150.376.32', new_version: '14200.1.2' },
    },
  ]);
  assert.equal(fake.lastState('ext:test-integration:router:dev-0f3a-91:update-available'), 1);
});
