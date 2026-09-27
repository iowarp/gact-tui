import type { LatestRelease } from '@clio/core/v3';
import type { DesktopUpdateSnapshot } from '@/tauri/desktop-updater';

/**
 * Why a version check did not produce an answer, in words for the person.
 *
 * `unavailable` is a check that ran and could not finish -- usually transient
 * (a release published before its update manifest was uploaded) and never a
 * red alarm. `error` is reserved for what genuinely needs the person: an
 * update whose signature did not match.
 */
export interface VersionCheckIssue {
  state: 'unavailable' | 'error';
  text: string;
}

const STILL_PUBLISHING =
  'Could not check for updates: the latest release is still being published.';

/** The CLIO row: the server's typed `latest-release` degradation, or a failed request. */
export function agentCheckIssue(
  release: LatestRelease | undefined,
  requestFailed: boolean,
): VersionCheckIssue | undefined {
  const reason = release?.degradation?.reason;
  if (reason === 'manifest_not_published') return { state: 'unavailable', text: STILL_PUBLISHING };
  if (reason || requestFailed) {
    return {
      state: 'unavailable',
      text: 'Could not check for updates: the release server could not be reached.',
    };
  }
  return undefined;
}

/** The desktop row: the updater's typed failure reason. */
export function desktopCheckIssue(snapshot: DesktopUpdateSnapshot): VersionCheckIssue | undefined {
  if (snapshot.status !== 'error') return undefined;
  switch (snapshot.reason) {
    case 'signature_mismatch':
      return { state: 'error', text: 'The update was rejected: its signature did not match.' };
    case 'manifest_not_published':
      return { state: 'unavailable', text: STILL_PUBLISHING };
    case 'platform_not_published':
      return {
        state: 'unavailable',
        text: 'Could not check for updates: no update is published for this computer yet.',
      };
    default:
      return {
        state: 'unavailable',
        text: 'Could not check for updates: the update server could not be reached.',
      };
  }
}
