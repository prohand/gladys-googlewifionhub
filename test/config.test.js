import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  hasCloud,
  hasLocal,
  normalizeConfig,
  normalizeHost,
} from '../src/config.js';

test('an empty config takes the defaults: local on, cloud off', () => {
  const config = normalizeConfig();
  assert.equal(config.router_host, DEFAULT_CONFIG.router_host);
  assert.equal(hasLocal(config), true);
  assert.equal(hasCloud(config), false);
  assert.equal(config.GLADYS_PREFER_LOCAL, true);
});

test('the host is cleaned of scheme, path and spaces', () => {
  assert.equal(normalizeHost(' http://192.168.86.1/api/v1/status '), '192.168.86.1');
  assert.equal(normalizeHost('onhub.here'), 'onhub.here');
  assert.equal(normalizeHost(42), '');
});

test('an emptied router address disables the local channel', () => {
  const config = normalizeConfig({ router_host: '' });
  assert.equal(hasLocal(config), false);
});

test('the refresh token enables the cloud channel, trimmed', () => {
  const config = normalizeConfig({ refresh_token: '  1//0abc \n' });
  assert.equal(config.refresh_token, '1//0abc');
  assert.equal(hasCloud(config), true);
});

test('the refresh interval is a number kept between 30 s and 1 h', () => {
  assert.equal(normalizeConfig({ poll_frequency: '120' }).poll_frequency, 120);
  assert.equal(normalizeConfig({ poll_frequency: 5 }).poll_frequency, 30);
  assert.equal(normalizeConfig({ poll_frequency: 99999 }).poll_frequency, 3600);
  assert.equal(normalizeConfig({ poll_frequency: 'abc' }).poll_frequency, 60);
});

test('only an explicit false disables options', () => {
  assert.equal(normalizeConfig({ publish_clients: false }).publish_clients, false);
  assert.equal(normalizeConfig({ publish_clients: 'yes' }).publish_clients, true);
  assert.equal(normalizeConfig({ GLADYS_PREFER_LOCAL: false }).GLADYS_PREFER_LOCAL, false);
});
