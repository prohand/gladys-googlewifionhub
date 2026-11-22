import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LocalApiError, fetchLocalStatus, parseLocalStatus } from '../src/googlewifi/local.js';
import { modelName } from '../src/googlewifi/models.js';
import { createFakeFetch, reply } from './helpers/fakeFetch.js';
import { ROUTER_HOST, localStatus } from './helpers/fixtures.js';

test('the status page is reduced to the values the integration uses', () => {
  const status = parseLocalStatus(localStatus());
  assert.equal(status.deviceId, 'dev-0f3a-91');
  assert.equal(status.model, 'Google Wifi');
  assert.equal(status.online, true);
  assert.equal(status.wanIp, '203.0.113.42');
  assert.equal(status.currentVersion, '14150.376.32');
  assert.equal(status.updateAvailable, false);
  assert.equal(status.newVersion, '');
  assert.equal(status.uptimeSeconds, 3 * 86400 + 3600);
  assert.equal(status.countryCode, 'FR');
});

test('a pending firmware is an available update', () => {
  const status = parseLocalStatus(localStatus({ software: { updateNewVersion: '14200.1.2' } }));
  assert.equal(status.updateAvailable, true);
  assert.equal(status.newVersion, '14200.1.2');
});

test('offline: no WAN address is reported', () => {
  const status = parseLocalStatus(localStatus({ wan: { online: false } }));
  assert.equal(status.online, false);
  assert.equal(status.wanIp, '');
});

test('missing fields give null, never a crash', () => {
  const status = parseLocalStatus({ wan: { online: true } });
  assert.equal(status.uptimeSeconds, null);
  assert.equal(status.ethernetLink, null);
  assert.equal(status.model, 'Google Wifi');
});

test('anything else than a status page is refused', () => {
  assert.throws(() => parseLocalStatus({ hello: 'world' }), LocalApiError);
  assert.throws(() => parseLocalStatus(null), LocalApiError);
});

test('the board name gives the commercial model', () => {
  assert.equal(modelName('WHIRLWIND A1B2'), 'OnHub (TP-Link)');
  assert.equal(modelName('ARKHAM X'), 'OnHub (ASUS)');
  assert.equal(modelName('MISTRAL B'), 'Nest Wifi');
  assert.equal(modelName('SOMETHING'), 'Google Wifi');
  assert.equal(modelName(undefined), 'Google Wifi');
});

test('fetchLocalStatus reads http://<host>/api/v1/status', async () => {
  const fetch = createFakeFetch({ [`GET http://${ROUTER_HOST}/api/v1/status`]: localStatus() });
  const status = await fetchLocalStatus(ROUTER_HOST, { fetch });
  assert.equal(status.online, true);
  assert.equal(fetch.calls[0].url, `http://${ROUTER_HOST}/api/v1/status`);
});

test('fetchLocalStatus errors are LocalApiError: unreachable, HTTP error, not JSON', async () => {
  await assert.rejects(fetchLocalStatus(ROUTER_HOST, { fetch: createFakeFetch() }), {
    name: 'LocalApiError',
    message: /unreachable/,
  });
  await assert.rejects(
    fetchLocalStatus(ROUTER_HOST, {
      fetch: createFakeFetch({ [`GET http://${ROUTER_HOST}/api/v1/status`]: reply(404, {}) }),
    }),
    { status: 404 },
  );
  await assert.rejects(
    fetchLocalStatus(ROUTER_HOST, {
      fetch: createFakeFetch({ [`GET http://${ROUTER_HOST}/api/v1/status`]: '<html>' }),
    }),
    /JSON/,
  );
  await assert.rejects(fetchLocalStatus(''), /No router address/);
});
