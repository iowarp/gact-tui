import { describe, expect, it } from 'vitest';
import { changesBetween, parseChangelog } from './changelog';

const CHANGELOG = `# Changelog

Intro text.

## Unreleased

### Added

- Not released yet.

## [0.11.2.22] — 2026-09-29

### Big screen zoom support (hotfix)

- Zoom with Ctrl + wheel.

## [0.11.2.21] — 2026-09-27

## [0.11.2.20] — 2026-09-27

### Fixed

- The sidebar lists every session.

## [0.11.2.9]

- Old change.
`;

describe('parseChangelog', () => {
  it('reads released sections with their dates and skips Unreleased', () => {
    const entries = parseChangelog(CHANGELOG);
    expect(entries.map((entry) => entry.version)).toEqual([
      '0.11.2.22',
      '0.11.2.21',
      '0.11.2.20',
      '0.11.2.9',
    ]);
    expect(entries[0]).toEqual({
      version: '0.11.2.22',
      date: '2026-09-29',
      body: '### Big screen zoom support (hotfix)\n\n- Zoom with Ctrl + wheel.',
    });
    expect(entries[1].body).toBe('');
    expect(entries[3].date).toBeUndefined();
    expect(entries.some((entry) => entry.body.includes('Not released yet'))).toBe(false);
  });

  it('handles Windows line endings', () => {
    const entries = parseChangelog(CHANGELOG.replace(/\n/gu, '\r\n'));
    expect(entries[0].body).toBe(
      '### Big screen zoom support (hotfix)\n\n- Zoom with Ctrl + wheel.',
    );
  });
});

describe('changesBetween', () => {
  const entries = parseChangelog(CHANGELOG);

  it('returns what an update brought: newer than the old version, up to the new one', () => {
    expect(changesBetween(entries, '0.11.2.21', '0.11.2.22').map((e) => e.version)).toEqual([
      '0.11.2.22',
    ]);
  });

  it('spans several skipped releases, drops empty ones, and compares numerically', () => {
    expect(changesBetween(entries, '0.11.2.9', '0.11.2.22').map((e) => e.version)).toEqual([
      '0.11.2.22',
      '0.11.2.20',
    ]);
  });

  it('accepts the Tauri build-metadata form of a version', () => {
    expect(changesBetween(entries, '0.11.2+21', '0.11.2+22').map((e) => e.version)).toEqual([
      '0.11.2.22',
    ]);
  });

  it('is empty when nothing changed', () => {
    expect(changesBetween(entries, '0.11.2.22', '0.11.2.22')).toEqual([]);
  });
});
