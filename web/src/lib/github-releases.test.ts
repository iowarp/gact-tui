import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  latestPublishedRelease,
  ReleaseFeedRateLimited,
  releasesApi,
  selectPublishedRelease,
  type PublishedRelease,
} from './github-releases';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

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
  it('stops asking GitHub until a used-up rate limit resets, across reloads', async () => {
    const resetSeconds = Math.floor(Date.now() / 1000) + 600;
    const fetcher = vi.fn(
      async () =>
        new Response('', {
          status: 403,
          headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(resetSeconds) },
        }),
    );
    vi.stubGlobal('fetch', fetcher);
    const feed = 'https://github.com/example/product/releases';
    const first = latestPublishedRelease(feed, 'beta');
    await expect(first).rejects.toBeInstanceOf(ReleaseFeedRateLimited);
    await expect(first).rejects.toMatchObject({ resetAt: resetSeconds * 1000 });
    // The reset time is in storage, so a reloaded page waits for it too.
    await expect(latestPublishedRelease(feed, 'beta')).rejects.toBeInstanceOf(
      ReleaseFeedRateLimited,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('asks again once the rate limit has reset', async () => {
    const api = releasesApi('https://github.com/example/product/releases');
    localStorage.setItem(`release-feed-rate-limited-until:${api}`, String(Date.now() - 1000));
    const fetcher = vi.fn(async () => Response.json([release('v0.9.5-beta.2')]));
    vi.stubGlobal('fetch', fetcher);
    await expect(
      latestPublishedRelease('https://github.com/example/product/releases', 'beta'),
    ).resolves.toMatchObject({ tag_name: 'v0.9.5-beta.2' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('does not mistake any other 403 for a rate limit', async () => {
    const fetcher = vi.fn(async () => new Response('', { status: 403 }));
    vi.stubGlobal('fetch', fetcher);
    const feed = 'https://github.com/example/product/releases';
    await expect(latestPublishedRelease(feed, 'beta')).rejects.toThrow('HTTP 403');
    await expect(latestPublishedRelease(feed, 'beta')).rejects.toThrow('HTTP 403');
    expect(fetcher).toHaveBeenCalledTimes(2);
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
  it('selects a published beta hotfix while retaining stable channel and manifest guards', () => {
    const candidates = [
      release('v0.9.5-beta.5.2', { assets: [] }),
      release('v0.9.5-beta.5.1'),
      release('v0.9.5-beta.5'),
      release('v0.9.4.24'),
    ];
    expect(selectPublishedRelease(candidates, 'beta')?.tag_name).toBe('v0.9.5-beta.5.1');
    expect(selectPublishedRelease(candidates, 'stable')?.tag_name).toBe('v0.9.4.24');
    expect(
      selectPublishedRelease([release('v0.9.5-beta.5.1', { prerelease: false })], 'stable'),
    ).toBeUndefined();
  });
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
