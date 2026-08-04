/**
 * Self-update check — ported from `web.old/src/updateCheck.ts`.
 *
 * The standard "a new build was deployed, refresh" pattern. Vite emits a tiny
 * `/version.json` marker next to the bundle at build time and the running
 * bundle knows its own stamp via `__APP_VERSION__` (git describe). Comparing
 * the two answers "is what I am running still what is deployed".
 *
 * This is entirely CLIENT-side. I had recorded "update available" as a backend
 * gap and filed clio-agent#1175 asking for an endpoint; that was a wrong
 * premise, and the legacy tree had the real mechanism all along.
 *
 * Framework-free by design: the legacy module wrapped this in Solid signals,
 * which is the only part that does not port.
 */

/** Path to the build marker. Root-relative so it works under any base. */
export const VERSION_MARKER_PATH = '/version.json';

/** Default poll cadence, carried over from the legacy service. */
export const DEFAULT_UPDATE_POLL_MS = 5 * 60 * 1000;

/** A build stamp with no git information — a bare checkout or ts-node run. */
const UNSTAMPED = 'dev';

/** Strip the dirty marker: a dirty tree is the same build to the user. */
function commitOf(version: string): string {
  return version.replace(/-dirty$/, '');
}

/**
 * Whether `deployed` is a different build from the one running.
 *
 * Returns false for an unstamped running build (nothing meaningful to compare)
 * and for a dirty-suffix-only difference — prompting someone to reload away
 * their own uncommitted work would be actively wrong.
 */
export function isNewerBuild(running: string, deployed: string | null): boolean {
  if (!deployed) return false;
  if (running === UNSTAMPED) return false;
  return commitOf(running) !== commitOf(deployed);
}

/**
 * Read the deployed build marker, or `null` if it cannot be read.
 *
 * Never throws. Offline, a missing marker, or a malformed body are all "no
 * answer" — an update check must not surface an error the user cannot act on.
 */
export async function fetchDeployedVersion(fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    // Cache-busted: a cached marker would report the running build forever,
    // which is the one failure mode that makes the whole check useless.
    const response = await fetcher(`${VERSION_MARKER_PATH}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const body = (await response.json()) as { version?: unknown };
    return typeof body.version === 'string' && body.version ? body.version : null;
  } catch {
    return null;
  }
}
