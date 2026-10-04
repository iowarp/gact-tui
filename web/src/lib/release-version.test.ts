import { describe, expect, it } from 'vitest';
import { compareReleaseVersions, displayReleaseVersion, releaseTag } from './release-version';

describe('release versions', () => {
  it('shows Tauri build metadata as the fourth CLIO release component', () => {
    expect(displayReleaseVersion('0.9.4+3')).toBe('0.9.4.3');
    expect(releaseTag('0.9.4+3')).toBe('v0.9.4.3');
  });

  it('shows the workspace package patch metadata as the fourth release component', () => {
    expect(displayReleaseVersion('0.11.2+patch.25')).toBe('0.11.2.25');
    expect(releaseTag('0.11.2+patch.25')).toBe('v0.11.2.25');
  });

  it('compares the fourth component instead of treating it as ignorable metadata', () => {
    expect(compareReleaseVersions('0.9.4.2', '0.9.4+3')).toBeLessThan(0);
    expect(compareReleaseVersions('0.9.4+3', '0.9.4.3')).toBe(0);
    expect(compareReleaseVersions('0.9.4.3-rc.1', '0.9.4.3')).toBeLessThan(0);
  });

  it('normalizes Python and Tauri beta versions to real GitHub release tags', () => {
    for (const version of ['0.9.5b2', '0.9.5-2', 'v0.9.5-beta.2']) {
      expect(displayReleaseVersion(version)).toBe('0.9.5-beta.2');
      expect(releaseTag(version)).toBe('v0.9.5-beta.2');
    }
  });

  it('orders beta revisions numerically and final releases after betas', () => {
    expect(compareReleaseVersions('0.9.5b1', '0.9.5-beta.2')).toBeLessThan(0);
    expect(compareReleaseVersions('0.9.5-2', '0.9.5-beta.10')).toBeLessThan(0);
    expect(compareReleaseVersions('0.9.5-beta.10', '0.9.5')).toBeLessThan(0);
    expect(compareReleaseVersions('0.9.5b2', '0.9.5-2')).toBe(0);
    expect(compareReleaseVersions('0.9.5b2', '0.9.4.24')).toBeGreaterThan(0);
  });
});
