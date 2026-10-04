import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  latestPublishedRelease,
  releasesApi,
  selectPublishedRelease,
  type PublishedRelease,
} from './github-releases';

afterEach(() => vi.unstubAllGlobals());

describe('release feed failures', () => {
  it('reports HTTP errors instead of claiming the installation is current', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 403 })),
    );
    await expect(
      latestPublishedRelease('https://github.com/example/product/releases', 'beta'),
    ).rejects.toThrow('HTTP 403');
  });
  it('rejects malformed metadata and missing published candidates', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ invalid: true }))
      .mockResolvedValueOnce(Response.json([release('v0.9.5-beta.2', { draft: true })]));
    vi.stubGlobal('fetch', fetcher);
    await expect(
      latestPublishedRelease('https://github.com/example/product/releases', 'beta'),
    ).rejects.toThrow('invalid response');
    await expect(
      latestPublishedRelease('https://github.com/example/product/releases', 'beta'),
    ).rejects.toThrow('No published beta');
  });
});

function release(tag: string, overrides: Partial<PublishedRelease> = {}): PublishedRelease {
  return {
    tag_name: tag,
    draft: false,
    prerelease: tag.includes('-beta.'),
    published_at: '2026-10-03T12:00:00Z',
    assets: [{ name: 'latest-lite.json' }],
    ...overrides,
  };
}

describe('published release channels', () => {
  const releases = [release('v0.9.5-beta.2'), release('v0.9.4.24'), release('v0.9.5-beta.1')];
  it('keeps stable users on stable and gives beta users newer betas', () => {
    expect(selectPublishedRelease(releases, 'stable')?.tag_name).toBe('v0.9.4.24');
    expect(selectPublishedRelease(releases, 'beta')?.tag_name).toBe('v0.9.5-beta.2');
  });
  it('excludes drafts, unpublished entries, and missing updater assets', () => {
    expect(
      selectPublishedRelease(
        [
          release('v0.9.5-beta.5', { draft: true }),
          release('v0.9.5-beta.4', { published_at: null }),
          release('v0.9.5-beta.3', { assets: [] }),
          ...releases,
        ],
        'beta',
      )?.tag_name,
    ).toBe('v0.9.5-beta.2');
  });
  it('selects by version, including multi-digit beta numbers and newer stable releases', () => {
    expect(selectPublishedRelease([...releases, release('v0.9.5-beta.10')], 'beta')?.tag_name).toBe(
      'v0.9.5-beta.10',
    );
    expect(selectPublishedRelease([...releases, release('v0.9.5')], 'beta')?.tag_name).toBe(
      'v0.9.5',
    );
  });
  it('does not trust a beta mislabeled as stable or unrelated prerelease labels', () => {
    expect(
      selectPublishedRelease([release('v0.9.5-beta.2', { prerelease: false })], 'stable'),
    ).toBeUndefined();
    expect(
      selectPublishedRelease([release('v0.9.6-rc.1', { prerelease: true })], 'beta'),
    ).toBeUndefined();
  });
  it('uses the selected brand repository and refuses arbitrary feeds', () => {
    expect(releasesApi('https://github.com/example/product/releases')).toBe(
      'https://api.github.com/repos/example/product/releases?per_page=100',
    );
    expect(() => releasesApi('https://other.invalid/example/product/releases')).toThrow();
  });
});
