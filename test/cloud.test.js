import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CloudApiError,
  CloudClient,
  ISSUE_TOKEN_URL,
  OAUTH_TOKEN_URL,
  isOnlineState,
  parseGroupStatus,
  parseGroups,
  parseRealtimeMetrics,
  parseSpeedTestResults,
  parseStations,
} from '../src/googlewifi/cloud.js';
import { createFakeFetch, reply } from './helpers/fakeFetch.js';
import {
  AP_POINT,
  GROUP_ID,
  STATION_PHONE,
  STATION_TV,
  foyer,
  groupStatus,
  groups,
  healthyRoutes,
  metrics,
  speedTestResults,
  stations,
} from './helpers/fixtures.js';

const REFRESH_TOKEN = '1//0refresh-token-secret';

function client(routes = healthyRoutes(), options = {}) {
  const fetch = createFakeFetch(routes);
  return { fetch, cloud: new CloudClient({ refreshToken: REFRESH_TOKEN, fetch, ...options }) };
}

test('online states are read by meaning', () => {
  assert.equal(isOnlineState('ONLINE'), true);
  assert.equal(isOnlineState('AP_ONLINE'), true);
  assert.equal(isOnlineState('OFFLINE'), false);
  assert.equal(isOnlineState('AP_OFFLINE'), false);
  assert.equal(isOnlineState('DISCONNECTED'), false);
  assert.equal(isOnlineState(''), null);
  assert.equal(isOnlineState('WEIRD'), null);
  assert.equal(isOnlineState(true), true);
});

test('parsers: groups, status, stations, metrics', () => {
  const [group] = parseGroups(groups());
  assert.equal(group.id, GROUP_ID);
  assert.equal(group.ssid, 'Maison');
  assert.deepEqual(
    group.accessPoints.map((ap) => [ap.name, ap.ledIntensity]),
    [
      ['Salon', 80],
      ['Bureau', 40],
    ],
  );

  const status = parseGroupStatus(groupStatus({ point: 'AP_OFFLINE' }));
  assert.equal(status.online, true);
  assert.equal(status.accessPoints[AP_POINT], false);

  const list = parseStations(stations({ tvPaused: true }));
  assert.equal(list.length, 3);
  assert.equal(list.find((s) => s.id === STATION_PHONE).ip, '192.168.86.23');
  assert.equal(list.find((s) => s.id === STATION_TV).paused, true);

  const live = parseRealtimeMetrics(metrics());
  assert.equal(live.downloadMbps, 52.34);
  assert.equal(live.uploadMbps, 4.1);
  assert.equal(live.stations[STATION_TV].downloadMbps, 25);
});

test('parsers never crash on empty or odd answers', () => {
  assert.deepEqual(parseGroups({}), []);
  assert.deepEqual(parseStations(null), []);
  assert.deepEqual(parseGroupStatus(undefined), { online: null, accessPoints: {} });
  assert.equal(parseRealtimeMetrics({}).downloadMbps, null);
  assert.equal(parseSpeedTestResults({}), null);
});

test('speed test results are found by meaning, in bps or Mbps', () => {
  assert.deepEqual(parseSpeedTestResults(speedTestResults()), {
    downloadMbps: 912.4,
    uploadMbps: 41.2,
    timestamp: '2026-11-20T08:00:00Z',
  });
  assert.deepEqual(
    parseSpeedTestResults({
      speedTestResults: [{ result: { downloadMbps: 300.123, uploadMbps: 20 } }],
    }),
    { downloadMbps: 300.12, uploadMbps: 20, timestamp: '' },
  );
});

test('the token is obtained in two steps and reused', async () => {
  const { fetch, cloud } = client();
  await cloud.getGroups();
  await cloud.getGroups();
  const oauth = fetch.calls.filter((c) => c.path === OAUTH_TOKEN_URL);
  const issue = fetch.calls.filter((c) => c.path === ISSUE_TOKEN_URL);
  assert.equal(oauth.length, 1);
  assert.equal(issue.length, 1);
  assert.match(oauth[0].body, /grant_type=refresh_token/);
  assert.equal(issue[0].headers.Authorization, 'Bearer oauth-access-token');
  const api = fetch.calls.filter((c) => c.path === foyer('/v2/groups'));
  assert.equal(api.length, 2);
  assert.equal(api[0].headers.Authorization, 'Bearer foyer-token');
  assert.match(api[0].url, /prettyPrint=false/);
});

test('the token is renewed once it expires', async () => {
  let now = 0;
  const { fetch, cloud } = client(healthyRoutes(), { now: () => now });
  await cloud.getGroups();
  now += 3600 * 1000;
  await cloud.getGroups();
  assert.equal(fetch.calls.filter((c) => c.path === ISSUE_TOKEN_URL).length, 2);
});

test('a 401 drops the token and retries once', async () => {
  let first = true;
  const { fetch, cloud } = client(
    healthyRoutes({
      [`GET ${foyer('/v2/groups')}`]: () => {
        if (first) {
          first = false;
          return reply(401, {});
        }
        return groups();
      },
    }),
  );
  const list = await cloud.getGroups();
  assert.equal(list.length, 1);
  assert.equal(fetch.calls.filter((c) => c.path === ISSUE_TOKEN_URL).length, 2);
});

test('a revoked refresh token is an auth error, and never leaks in the message', async () => {
  const { cloud } = client(
    healthyRoutes({ [`POST ${OAUTH_TOKEN_URL}`]: reply(400, { error: 'invalid_grant' }) }),
  );
  await assert.rejects(cloud.getGroups(), (err) => {
    assert.ok(err instanceof CloudApiError);
    assert.equal(err.auth, true);
    assert.doesNotMatch(err.message, /refresh-token-secret/);
    return true;
  });
});

test('API errors carry the status and the path, not the token', async () => {
  const { cloud } = client(
    healthyRoutes({ [`GET ${foyer(`/v2/groups/${GROUP_ID}/stations`)}`]: reply(500, {}) }),
  );
  await assert.rejects(cloud.getStations(GROUP_ID), (err) => {
    assert.equal(err.status, 500);
    assert.match(err.message, /stations/);
    assert.doesNotMatch(err.message, /foyer-token/);
    return true;
  });
});

test('a client needs a refresh token', () => {
  assert.throws(() => new CloudClient({ refreshToken: '' }), CloudApiError);
});

test('commands: pause, light, restarts', async () => {
  const routes = healthyRoutes({
    [`PUT ${foyer(`/v2/groups/${GROUP_ID}/stationBlocking`)}`]: {},
    [`PUT ${foyer(`/v2/accesspoints/${AP_POINT}/lighting`)}`]: reply(204),
    [`POST ${foyer(`/v2/groups/${GROUP_ID}/reboot`)}`]: {},
    [`POST ${foyer(`/v2/accesspoints/${AP_POINT}/reboot`)}`]: '',
  });
  const { fetch, cloud } = client(routes);
  await cloud.setStationBlocked(GROUP_ID, STATION_TV, true);
  await cloud.setLightIntensity(AP_POINT, 150);
  await cloud.rebootGroup(GROUP_ID);
  await cloud.rebootAccessPoint(AP_POINT);
  const blocking = fetch.calls.find((c) => c.path.endsWith('/stationBlocking'));
  assert.deepEqual(JSON.parse(blocking.body), { blocked: 'true', stationId: STATION_TV });
  const light = fetch.calls.find((c) => c.path.endsWith('/lighting'));
  assert.deepEqual(JSON.parse(light.body), { intensity: 100 });
  assert.match(light.url, /updateMask=intensity&prettyPrint=false/);
});

test('a speed test waits for its operation, then reads the result', async () => {
  let polls = 0;
  const routes = healthyRoutes({
    [`POST ${foyer(`/v2/groups/${GROUP_ID}/wanSpeedTest`)}`]: {
      operation: { operationId: 'op-1' },
    },
    [`GET ${foyer('/v2/operations/op-1')}`]: () => {
      polls += 1;
      return { operationState: polls < 3 ? 'RUNNING' : 'DONE' };
    },
  });
  const { cloud } = client(routes, { sleep: async () => {} });
  const result = await cloud.runSpeedTest(GROUP_ID);
  assert.equal(polls, 3);
  assert.equal(result.downloadMbps, 912.4);
});

test('a speed test that never finishes times out', async () => {
  let now = 0;
  const routes = healthyRoutes({
    [`POST ${foyer(`/v2/groups/${GROUP_ID}/wanSpeedTest`)}`]: {
      operation: { operationId: 'op-2' },
    },
    [`GET ${foyer('/v2/operations/op-2')}`]: { operationState: 'RUNNING' },
  });
  const { cloud } = client(routes, {
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  });
  await assert.rejects(cloud.runSpeedTest(GROUP_ID), /did not finish/);
});
