import { describe, expect, it } from 'vitest';
import { compareReleaseVersions, displayReleaseVersion, releaseTag } from './release-version';

describe('release versions', () => {
  it('shows Tauri build metadata as the fourth CLIO release component', () => {
    expect(displayReleaseVersion('0.9.4+3')).toBe('0.9.4.3');
    expect(releaseTag('0.9.4+3')).toBe('v0.9.4.3');
  });

  it('compares the fourth component instead of treating it as ignorable metadata', () => {
    expect(compareReleaseVersions('0.9.4.2', '0.9.4+3')).toBeLessThan(0);
    expect(compareReleaseVersions('0.9.4+3', '0.9.4.3')).toBe(0);
    expect(compareReleaseVersions('0.9.4.3-rc.1', '0.9.4.3')).toBeLessThan(0);
  });
});
