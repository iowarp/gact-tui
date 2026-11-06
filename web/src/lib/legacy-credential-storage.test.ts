import { afterEach, describe, expect, it } from 'vitest';
import {
  LEGACY_TOKEN_STORAGE_KEYS,
  removeLegacyCredentialStorage,
} from './legacy-credential-storage';

afterEach(() => localStorage.clear());

describe('removeLegacyCredentialStorage', () => {
  it('removes the old registry that held bearer tokens and nothing else', () => {
    localStorage.setItem(
      'clio.backends.v1',
      JSON.stringify({ backends: [{ url: 'http://lab', bearerToken: 'old-secret' }] }),
    );
    localStorage.setItem('clio.recent-connections', '[{"endpoint":"http://lab"}]');

    removeLegacyCredentialStorage(localStorage);

    expect(localStorage.getItem('clio.backends.v1')).toBeNull();
    expect(localStorage.getItem('clio.recent-connections')).toBe('[{"endpoint":"http://lab"}]');
    expect(LEGACY_TOKEN_STORAGE_KEYS).toContain('clio.backends.v1');
  });

  it('is harmless when there is nothing to remove', () => {
    expect(() => removeLegacyCredentialStorage(localStorage)).not.toThrow();
  });
});
