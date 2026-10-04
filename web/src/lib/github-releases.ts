import { compareReleaseVersions, displayReleaseVersion, isBetaVersion } from './release-version';
import type { UpdateChannel } from './update-channel';

export interface PublishedRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  assets: Array<{ name: string }>;
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
      if (!version || !/^\d+\.\d+\.\d+(?:\.\d+)?(?:-beta\.\d+)?$/u.test(version)) return false;
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
  let releases: unknown;
  try {
    const response = await fetch(releasesApi(releaseUrl), {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
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
