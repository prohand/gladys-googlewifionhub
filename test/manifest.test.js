// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The store indexer validates the manifest shape (the CI runs it on pull
// requests), but nothing there knows which handlers the code registers, nor
// the rules this repository adds (four languages, keys forever).
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';
import { SCENE_TRIGGER_KEYS } from '../src/capabilities/triggers.js';
import { createActions } from '../src/capabilities/actions.js';
import { createSceneActions } from '../src/capabilities/scenes.js';
import { createWidgets } from '../src/capabilities/widgets.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// The capability factories only need an app to close over: no call is made.
const fakeApp = {};
const ACTIONS = createActions(fakeApp);
const SCENE_ACTIONS = createSceneActions(fakeApp);
const WIDGETS = createWidgets(fakeApp);

// Vocabulary of the store browse categories (integration-store src/constants.js).
const CATEGORIES = [
  'climate',
  'lighting',
  'energy',
  'security',
  'multimedia',
  'appliances',
  'environment',
  'protocols',
  'network',
  'notifications',
  'assistants',
  'services',
  'transport',
  'vehicles',
  'servers',
  'leisure',
];

const keysOf = (list) => (list ?? []).map((entry) => entry.key).sort();

const allFields = [
  ...manifest.config_schema,
  ...[
    ...(manifest.actions ?? []),
    ...(manifest.scene_triggers ?? []),
    ...(manifest.scene_actions ?? []),
  ].flatMap((item) => item.fields ?? []),
];

test('every manifest action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions), Object.keys(ACTIONS).sort());
});

test('every scene action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.scene_actions), Object.keys(SCENE_ACTIONS).sort());
});

test('every widget has a content handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets), Object.keys(WIDGETS).sort());
  for (const widget of Object.values(WIDGETS)) {
    assert.equal(typeof widget.get, 'function');
  }
});

test('the scene triggers the code fires are the ones the manifest declares', () => {
  // An undeclared key is a 404 on publishSceneEvent; a declared key nobody
  // fires is a dead card in the scene editor.
  assert.deepEqual(keysOf(manifest.scene_triggers), [...SCENE_TRIGGER_KEYS].sort());
});

test('the keys users store never change (scenes, dashboards, config)', () => {
  // Renaming one breaks every scene or dashboard built on it: this list only grows.
  assert.deepEqual(keysOf(manifest.scene_triggers), [
    'access_point_offline',
    'client_connected',
    'client_disconnected',
    'internet_lost',
    'internet_restored',
    'update_available',
  ]);
  assert.deepEqual(keysOf(manifest.scene_actions), [
    'check_internet',
    'pause_client',
    'restart_wifi',
    'run_speed_test',
  ]);
  assert.deepEqual(keysOf(manifest.widgets), ['wifi_clients', 'wifi_status']);
  assert.deepEqual(keysOf(manifest.config_schema), [
    'cloud',
    'intro',
    'poll_frequency',
    'publish_clients',
    'refresh_token',
    'router_host',
  ]);
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[field.key], field.default, `DEFAULT_CONFIG.${field.key}`);
    }
  }
});

test('every stored config key is known by the code', () => {
  for (const field of manifest.config_schema.filter((f) => f.type !== 'section')) {
    assert.ok(field.key in DEFAULT_CONFIG, `config key "${field.key}" unknown to src/config.js`);
  }
});

test('the refresh token is a secret field, without default', () => {
  const token = manifest.config_schema.find((field) => field.key === 'refresh_token');
  assert.equal(token.type, 'secret');
  assert.equal(token.default, undefined);
});

test('section fields are purely presentational', () => {
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    assert.equal(section.placeholder, undefined);
    assert.ok(!(section.key in DEFAULT_CONFIG));
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('dynamic selects declare the devices source and no static options', () => {
  const dynamic = allFields.filter((f) => f.source !== undefined);
  assert.ok(dynamic.length > 0);
  for (const field of dynamic) {
    assert.equal(field.source, 'devices');
    assert.equal(field.options, undefined);
    assert.equal(field.default, undefined);
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/prohand/gladys-googlewifionhub:${manifest.version}`);
});

test('the categories stay inside the vocabulary the store indexes', () => {
  const { categories } = manifest;
  assert.ok(categories.length >= 1 && categories.length <= 3);
  assert.equal(new Set(categories).size, categories.length);
  for (const category of categories) {
    assert.ok(CATEGORIES.includes(category), `unknown category "${category}"`);
  }
});

function floorAtLeast(wantedMajor, wantedMinor) {
  const [major, minor] = manifest.gladys_version.replace(/^>=/, '').split('.').map(Number);
  return major > wantedMajor || (major === wantedMajor && minor >= wantedMinor);
}

test('the Gladys floor covers every field the manifest declares', () => {
  // categories: 4.86 — widgets and scenes: 5.1 — keywords and countries: 5.3.
  assert.ok(floorAtLeast(5, 3), `got ${manifest.gladys_version}`);
});

test('the search keywords follow the store rules', () => {
  const normalized = manifest.keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.ok(normalized.length >= 1 && normalized.length <= 10);
  assert.equal(new Set(normalized).size, normalized.length);
  for (const keyword of normalized) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, `keyword "${keyword}"`);
  }
});

test('the countries are ISO codes, unique, 20 at most', () => {
  const { countries } = manifest;
  assert.ok(countries.length >= 1 && countries.length <= 20);
  assert.equal(new Set(countries).size, countries.length);
  for (const code of countries) {
    assert.match(code, /^[A-Z]{2}$/);
  }
  assert.ok(countries.includes('FR') && countries.includes('DE') && countries.includes('ES'));
});

test('both transports are declared: local and cloud', () => {
  assert.deepEqual([...manifest.transports].sort(), ['cloud', 'local']);
});

/** Every multi-language object of the manifest, with where it sits. */
function multiLanguageTexts(node, path = 'manifest') {
  if (Array.isArray(node)) {
    return node.flatMap((child, index) => multiLanguageTexts(child, `${path}[${index}]`));
  }
  if (node === null || typeof node !== 'object') {
    return [];
  }
  const keys = Object.keys(node);
  if (keys.includes('en') && keys.every((key) => /^[a-z]{2}$/.test(key))) {
    return [{ path, text: node }];
  }
  return keys.flatMap((key) => multiLanguageTexts(node[key], `${path}.${key}`));
}

test('every multi-language text of the manifest carries en, fr, de and es', () => {
  const texts = multiLanguageTexts(manifest);
  assert.ok(texts.length > 50, `only ${texts.length} texts found`);
  for (const { path, text } of texts) {
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), `${path}: languages`);
    for (const language of LANGUAGES) {
      assert.ok(text[language].trim().length > 0, `${path}.${language} is empty`);
    }
  }
});

test('the per-language length limits of the store hold', () => {
  const within = (text, min, max, where) => {
    for (const language of LANGUAGES) {
      const { length } = text[language];
      assert.ok(length >= min && length <= max, `${where}.${language}: ${length} characters`);
    }
  };
  within(manifest.description, 10, 100, 'description');
  for (const widget of manifest.widgets) {
    within(widget.label, 3, 30, `widget ${widget.key} label`);
    within(widget.description, 1, 100, `widget ${widget.key} description`);
  }
  for (const section of manifest.config_schema.filter((f) => f.type === 'section')) {
    within(section.description, 1, 1000, `section ${section.key} description`);
  }
});

test('the cover is in the repository, at the size the store wants', async () => {
  const png = await readFile(new URL('../cover.png', import.meta.url));
  // PNG signature, then the IHDR chunk: width and height, big-endian.
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  assert.equal(png.readUInt32BE(16), 800);
  assert.equal(png.readUInt32BE(20), 534);
  assert.ok(png.length <= 150 * 1024, `${png.length} bytes`);
});

test('the user documentation exists in the four languages', async () => {
  for (const language of LANGUAGES) {
    const doc = await readFile(new URL(`../docs/${language}.md`, import.meta.url), 'utf8');
    assert.ok(doc.length >= 300, `docs/${language}.md is too short`);
  }
});
