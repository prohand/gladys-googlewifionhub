import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const SAMPLE = `# Changelog

## [Unreleased]

### Added

- Something new.

[Unreleased]: https://github.com/prohand/gladys-googlewifionhub/commits/main
`;

test('the Unreleased section moves under the released version', () => {
  const out = rollChangelog(SAMPLE, '1.0.1', '2026-11-22');
  assert.match(
    out,
    /## \[Unreleased\]\n\n## \[1\.0\.1\] - 2026-11-22\n\n### Added\n\n- Something new\./,
  );
  assert.match(
    out,
    /\[Unreleased\]: https:\/\/github\.com\/prohand\/gladys-googlewifionhub\/compare\/v1\.0\.1\.\.\.HEAD/,
  );
  assert.match(
    out,
    /\[1\.0\.1\]: https:\/\/github\.com\/prohand\/gladys-googlewifionhub\/releases\/tag\/v1\.0\.1/,
  );
});

test('an empty Unreleased section still writes the version', () => {
  const out = rollChangelog(
    SAMPLE.replace('### Added\n\n- Something new.\n\n', ''),
    '1.0.2',
    '2026-11-23',
  );
  assert.match(out, /## \[1\.0\.2\] - 2026-11-23\n\n- Maintenance release/);
});

test('the repository changelog has an Unreleased section and no hand-written version heading above it', async () => {
  const text = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.match(text, /^## \[Unreleased\]$/m);
});
