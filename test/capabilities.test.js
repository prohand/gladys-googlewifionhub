import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { addDevices, startApp } from './helpers/startApp.js';
import { reply } from './helpers/fakeFetch.js';
import {
  GROUP_ID,
  ROUTER_HOST,
  STATION_TV,
  foyer,
  healthyRoutes,
  stations,
} from './helpers/fixtures.js';

const LANGS = ['en', 'fr', 'de', 'es'];

function speedTestRoutes() {
  return healthyRoutes({
    [`POST ${foyer(`/v2/groups/${GROUP_ID}/wanSpeedTest`)}`]: {
      operation: { operationId: 'op-9' },
    },
    [`GET ${foyer('/v2/operations/op-9')}`]: { operationState: 'DONE' },
    [`PUT ${foyer(`/v2/groups/${GROUP_ID}/stationBlocking`)}`]: {},
    [`POST ${foyer(`/v2/groups/${GROUP_ID}/reboot`)}`]: {},
    [`POST ${foyer('/v2/accesspoints/ap-point-02/reboot')}`]: {},
  });
}

function assertValid(content) {
  const problems = validateWidgetContent(content);
  assert.deepEqual(problems, [], JSON.stringify(problems));
}

// --- Widgets -----------------------------------------------------------------

test('wifi_status: valid content, with live tiles once the network is added', async (t) => {
  const { fake } = await startApp(t);
  let ack = await fake.widgetGet('wifi_status');
  assert.equal(ack.success, true);
  assertValid(ack.data.content);
  assert.ok(!ack.data.content.components.some((c) => c.device_feature));

  await addDevices(fake, (d) => d.name === 'Wi-Fi Maison');
  ack = await fake.widgetGet('wifi_status');
  assertValid(ack.data.content);
  const tiles = ack.data.content.components.filter((c) => c.device_feature);
  assert.equal(tiles.length, 2);
  const status = ack.data.content.components.find((c) => c.type === 'status');
  assert.ok(status.items.length >= 5);
  assert.ok(ack.data.content.components.some((c) => c.type === 'button'));
});

test('wifi_status: nothing reachable still gives a valid content', async (t) => {
  const { fake } = await startApp(t, { config: { router_host: '' } });
  const ack = await fake.widgetGet('wifi_status');
  assertValid(ack.data.content);
});

test('wifi_status button runs a speed test', async (t) => {
  const { fake } = await startApp(t, { routes: speedTestRoutes() });
  const ack = await fake.widgetAction('wifi_status', 'speed_test');
  assert.equal(ack.success, true);
  for (const lang of LANGS) {
    assert.match(ack.data.message[lang], /912\.4/);
  }
});

test('wifi_clients: busiest first, paused badge, valid content', async (t) => {
  const { fake } = await startApp(t);
  const ack = await fake.widgetGet('wifi_clients');
  assertValid(ack.data.content);
  const list = ack.data.content.components[0];
  assert.equal(list.type, 'card-list');
  assert.deepEqual(
    list.items.map((item) => item.title),
    ['TV Salon', 'Pixel de Sam'],
  );
  assert.equal(list.items[0].subtitle, '192.168.86.30 · 2.4 GHz');
});

test('wifi_clients: a paused device carries a badge', async (t) => {
  const routes = healthyRoutes({
    [`GET ${foyer(`/v2/groups/${GROUP_ID}/stations`)}`]: stations({ tvPaused: true }),
  });
  const { fake } = await startApp(t, { routes });
  const ack = await fake.widgetGet('wifi_clients', { language: 'fr' });
  assertValid(ack.data.content);
  const tv = ack.data.content.components[0].items.find((item) => item.title === 'TV Salon');
  assert.equal(tv.badge.color, 'warning');
  assert.equal(tv.badge.text.fr, 'En pause');
});

test('wifi_clients without cloud explains what is missing', async (t) => {
  const { fake } = await startApp(t, { config: { router_host: ROUTER_HOST } });
  const ack = await fake.widgetGet('wifi_clients');
  assertValid(ack.data.content);
  assert.equal(ack.data.content.components[0].type, 'text');
});

test('the widgets are nudged when their content changes', async (t) => {
  const { fake } = await startApp(t);
  assert.ok(fake.widgetRefreshes.includes('wifi_status'));
  assert.ok(fake.widgetRefreshes.includes('wifi_clients'));
});

// --- Scene actions -----------------------------------------------------------

test('scene pause_client pauses the chosen device', async (t) => {
  const { fake, fetch } = await startApp(t, { routes: speedTestRoutes() });
  const ack = await fake.sceneAction('pause_client', {
    device: `ext:test-integration:client:${STATION_TV}`,
    paused: true,
  });
  assert.equal(ack.success, true);
  assert.deepEqual(ack.data.outputs, { paused: true });
  assert.ok(fetch.calls.some((c) => c.path.endsWith('/stationBlocking')));
});

test('scene pause_client refuses a device that is not a client', async (t) => {
  const { fake } = await startApp(t, { routes: speedTestRoutes() });
  const ack = await fake.sceneAction('pause_client', {
    device: 'ext:test-integration:network:grp-AAA111',
  });
  assert.equal(ack.success, false);
});

test('scene run_speed_test returns the speeds', async (t) => {
  const { fake } = await startApp(t, { routes: speedTestRoutes() });
  const ack = await fake.sceneAction('run_speed_test');
  assert.deepEqual(ack.data.outputs, { download_mbps: 912.4, upload_mbps: 41.2 });
});

test('scene restart_wifi: one point, or the whole system', async (t) => {
  const { fake, fetch } = await startApp(t, { routes: speedTestRoutes() });
  let ack = await fake.sceneAction('restart_wifi', {
    device: 'ext:test-integration:access-point:ap-point-02',
  });
  assert.deepEqual(ack.data.outputs, { restarted: true });
  assert.ok(fetch.calls.some((c) => c.path.endsWith('/accesspoints/ap-point-02/reboot')));
  ack = await fake.sceneAction('restart_wifi', {});
  assert.deepEqual(ack.data.outputs, { restarted: true });
  assert.ok(fetch.calls.some((c) => c.path.endsWith(`/groups/${GROUP_ID}/reboot`)));
  ack = await fake.sceneAction('restart_wifi', { device: 'ext:test-integration:client:st-tv-2' });
  assert.equal(ack.success, false);
});

test('scene check_internet reads the router now', async (t) => {
  const { fake } = await startApp(t);
  const ack = await fake.sceneAction('check_internet');
  assert.deepEqual(ack.data.outputs, { online: true, source: 'local', connected_clients: 2 });
});

test('cloud scene actions without a token fail with a clear message', async (t) => {
  const { fake } = await startApp(t, { config: { router_host: ROUTER_HOST } });
  const ack = await fake.sceneAction('run_speed_test');
  assert.equal(ack.success, false);
  assert.match(ack.error, /refresh token/);
});

// --- Configuration actions ---------------------------------------------------

test('test_connection reports both channels in every language', async (t) => {
  const { fake } = await startApp(t);
  const ack = await fake.action('test_connection');
  assert.equal(ack.success, true);
  assert.match(ack.data.message.en, /Local: OK — Google Wifi 14150\.376\.32, internet up/);
  assert.match(ack.data.message.fr, /Cloud Google : |Cloud Google: OK/);
  for (const lang of LANGS) {
    assert.ok(ack.data.message[lang]);
  }
});

test('test_connection names a failing channel', async (t) => {
  const routes = healthyRoutes({ [`GET http://${ROUTER_HOST}/api/v1/status`]: reply(500, {}) });
  const { fake } = await startApp(t, { routes });
  const ack = await fake.action('test_connection');
  assert.match(ack.data.message.en, /HTTP 500/);
});

test('restart_wifi needs the confirmation box', async (t) => {
  const { fake, fetch } = await startApp(t, { routes: speedTestRoutes() });
  let ack = await fake.action('restart_wifi', { confirm: false });
  assert.match(ack.data.message.en, /Nothing done/);
  assert.ok(!fetch.calls.some((c) => c.path.endsWith('/reboot')));
  ack = await fake.action('restart_wifi', { confirm: true });
  assert.match(ack.data.message.fr, /Redémarrage demandé/);
});

test('run_speed_test action without a token explains it', async (t) => {
  const { fake } = await startApp(t, { config: { router_host: ROUTER_HOST } });
  const ack = await fake.action('run_speed_test');
  assert.match(ack.data.message.es, /refresh token/);
});
