import { compareReleaseVersions, displayReleaseVersion, isBetaVersion } from './release-version';
import type { UpdateChannel } from './update-channel';

export interface PublishedRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  assets: Array<{ name: string }>;
}

/**
 * GitHub answers anonymous API calls 60 times an hour per network address.
 * Once that is used up, every further call is another 403 in the console until
 * the reset, so the reset time is kept across reloads and no call is made
 * before it.
 */
export class ReleaseFeedRateLimited extends Error {
  constructor(readonly resetAt: number) {
    const time = new Date(resetAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    super(`GitHub's limit for update checks from this network is used up until ${time}.`);
    this.name = 'ReleaseFeedRateLimited';
  }
}

const RATE_LIMIT_STORAGE_PREFIX = 'release-feed-rate-limited-until:';
// Used only when GitHub limits a call without saying when the limit resets.
const RATE_LIMIT_FALLBACK_MS = 15 * 60 * 1000;

function rateLimitedUntil(api: string): number | undefined {
  try {
    const value = Number(localStorage.getItem(RATE_LIMIT_STORAGE_PREFIX + api));
    return value > Date.now() ? value : undefined;
  } catch {
    return undefined; // No storage: fall back to asking GitHub.
  }
}

function recordRateLimit(api: string, response: Response): number | undefined {
  const remaining = response.headers.get('x-ratelimit-remaining');
  const retryAfter = Number(response.headers.get('retry-after'));
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  if (
    response.status !== 429 &&
    !(response.status === 403 && (remaining === '0' || retryAfter > 0))
  )
    return undefined;
  const resetAt =
    retryAfter > 0
      ? Date.now() + retryAfter * 1000
      : reset > 0
        ? reset * 1000
        : Date.now() + RATE_LIMIT_FALLBACK_MS;
  try {
    localStorage.setItem(RATE_LIMIT_STORAGE_PREFIX + api, String(resetAt));
  } catch {
    // Best effort: without storage the next page load asks GitHub again.
  }
  return resetAt;
}

/** Derive the public, CORS-enabled API from the product's branded release location. */
export function releasesApi(releaseUrl: string): string {
  const url = new URL(releaseUrl);
  const match = /^\/([^/]+)\/([^/]+)\/releases\/?$/u.exec(url.pathname);
  if (url.protocol !== 'https:' || url.host !== 'github.com' || !match) {
    throw new Error('This product has no supported GitHub release feed.');
  }
  return `https://api.github.com/repos/${match[1]}/${match[2]}/releases?per_page=100`;
}

/** Choose by version, excluding drafts, unpublished releases, and incomplete update manifests. */
export function selectPublishedRelease(
  releases: PublishedRelease[],
  channel: UpdateChannel,
): PublishedRelease | undefined {
  return releases
    .filter((release) => {
      const version = displayReleaseVersion(release.tag_name);
      if (!version || !/^\d+\.\d+\.\d+(?:\.\d+)?(?:-beta\.\d+(?:\.\d+)?)?$/u.test(version))
        return false;
      if (release.draft || !release.published_at) return false;
      if (channel === 'stable' && (release.prerelease || isBetaVersion(version))) return false;
      if (release.prerelease && !isBetaVersion(version)) return false;
      return release.assets.some(
        (asset) => asset.name === 'latest-lite.json' || asset.name === 'latest.json',
      );
    })
    .sort((a, b) => compareReleaseVersions(b.tag_name, a.tag_name))[0];
}

/** Fetch public release metadata; a draft is never an available update. */
export async function latestPublishedRelease(
  releaseUrl: string,
  channel: UpdateChannel,
  signal?: AbortSignal,
): Promise<PublishedRelease> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const api = releasesApi(releaseUrl);
  let releases: unknown;
  try {
    const limitedUntil = rateLimitedUntil(api);
    if (limitedUntil !== undefined) throw new ReleaseFeedRateLimited(limitedUntil);
    const response = await fetch(api, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    const resetAt = response.ok ? undefined : recordRateLimit(api, response);
    if (resetAt !== undefined) throw new ReleaseFeedRateLimited(resetAt);
    if (!response.ok) throw new Error(`Release check failed (HTTP ${response.status}).`);
    releases = await response.json();
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
  if (!Array.isArray(releases)) throw new Error('Release feed returned an invalid response.');
  const candidates = releases.filter(
    (value): value is PublishedRelease =>
      typeof value === 'object' &&
      value !== null &&
      typeof value.tag_name === 'string' &&
      typeof value.draft === 'boolean' &&
      typeof value.prerelease === 'boolean' &&
      typeof value.published_at === 'string' &&
      Array.isArray(value.assets) &&
      value.assets.every(
        (asset: unknown) =>
          typeof asset === 'object' &&
          asset !== null &&
          'name' in asset &&
          typeof asset.name === 'string',
      ),
  );
  const release = selectPublishedRelease(candidates, channel);
  if (!release) throw new Error(`No published ${channel} channel update is available.`);
  return release;
}
