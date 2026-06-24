/**
 * Backend-version update logic for the unified version-badge update panel.
 *
 * The web/desktop shells already track their OWN build version (the app
 * shell) via {@link ./updateCheck.ts} (web) and {@link ./tauri_update.ts}
 * (desktop). This module is the second half of the "Unified app + backend"
 * update flow: it reports the latest released version of the *backend* the
 * shell is configured to install (the brand's `backendRepository`, e.g.
 * `iowarp/clio-agent`) and compares it against the version the connected
 * backend currently advertises via GET /v1/capabilities → `backend.version`.
 *
 * The backend repository is brand-scoped: only profiles that set
 * `backendRepository` (today: `clio`) have a backend the shell knows how to
 * point at. For the neutral `gact` profile this whole row is absent.
 *
 * Fetching the latest release uses the public GitHub REST API
 * (`/repos/{owner}/{repo}/releases/latest`), which needs no auth for public
 * repos. Failures (offline, rate-limited, no releases yet) resolve to `null`
 * — an update check must never surface an error to the user.
 */

/** A brand `backendRepository` descriptor (mirrors the resolved brand shape). */
export interface BackendRepository {
  label: string;
  url: string;
  detail: string;
}

/**
 * Parse `owner/repo` out of a GitHub repository URL (or a bare `owner/repo`
 * slug). Returns null when the URL is not a recognisable GitHub repo, so the
 * caller can quietly skip the remote check rather than build a bad API URL.
 */
export function parseGithubRepo(url: string): { owner: string; repo: string } | null {
  const trimmed = url.trim().replace(/\/+$/, '');
  // Accept a bare "owner/repo" slug.
  const bare = /^([\w.-]+)\/([\w.-]+)$/.exec(trimmed);
  if (bare && bare[1] && bare[2]) return { owner: bare[1], repo: bare[2] };
  // Accept a full github.com URL (http/https, with or without www).
  const full = /github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?$/.exec(trimmed);
  if (full && full[1] && full[2]) return { owner: full[1], repo: full[2] };
  return null;
}

/**
 * Normalise a version string for comparison: strip a leading `v`/`V` and
 * surrounding whitespace. `v0.5.2` and `0.5.2` are the same release.
 */
export function normalizeVersion(version: string): string {
  return version.trim().replace(/^[vV]/, '');
}

/**
 * Fetch the latest released version tag for a GitHub repo. Returns the raw
 * tag name (e.g. `v0.5.2`) or null on any failure. Cache-busted and
 * `no-store` so a long-lived tab does not pin a stale answer.
 */
export async function fetchLatestBackendVersion(
  repository: BackendRepository,
  fetchImpl: typeof fetch,
): Promise<string | null> {
  const parsed = parseGithubRepo(repository.url);
  if (!parsed) return null;
  try {
    const url =
      `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/releases/latest` +
      `?t=${Date.now()}`;
    const res = await fetchImpl(url, {
      cache: 'no-store',
      headers: { accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    if (
      data &&
      typeof data === 'object' &&
      'tag_name' in data &&
      typeof (data as { tag_name: unknown }).tag_name === 'string'
    ) {
      const tag = (data as { tag_name: string }).tag_name.trim();
      return tag.length > 0 ? tag : null;
    }
    return null;
  } catch {
    // Offline, rate-limited, no releases, malformed JSON — all non-fatal.
    return null;
  }
}

/** The comparison outcome for a single update row (app or backend). */
export type UpdateState = 'current' | 'available' | 'unknown';

/**
 * Compare an installed version against the latest known version. `unknown`
 * when either side is missing (we never claim an update we cannot confirm).
 * `available` only when both are known AND they differ after normalisation.
 */
export function compareVersions(
  installed: string | null | undefined,
  latest: string | null | undefined,
): UpdateState {
  if (!installed || !latest) return 'unknown';
  return normalizeVersion(installed) === normalizeVersion(latest) ? 'current' : 'available';
}
