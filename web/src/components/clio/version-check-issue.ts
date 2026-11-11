import type { useSystemVersionStatus } from '@/hooks/use-system-version-status';
import type { LatestRelease } from '@clio/core/v3';
import { ReleaseFeedRateLimited } from '@/lib/github-releases';
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
  error?: unknown,
): VersionCheckIssue | undefined {
  const reason = release?.degradation?.reason;
  if (reason === 'manifest_not_published') return { state: 'unavailable', text: STILL_PUBLISHING };
  if (requestFailed && error instanceof ReleaseFeedRateLimited) {
    return { state: 'unavailable', text: `Could not check for updates: ${error.message}` };
  }
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
    case 'version_mismatch':
      return { state: 'error', text: snapshot.message };
    case 'signature_mismatch':
      return { state: 'error', text: 'The update was rejected: its signature did not match.' };
    case 'manifest_not_published':
      return { state: 'unavailable', text: STILL_PUBLISHING };
    case 'rate_limited':
      return { state: 'unavailable', text: `Could not check for updates: ${snapshot.message}` };
    case 'platform_not_published':
      return {
        state: 'unavailable',
        text: 'Could not check for updates: no update is published for this computer yet.',
      };
    case 'release_not_published':
      return {
        state: 'unavailable',
        text: `Could not check for updates: ${snapshot.message.charAt(0).toLowerCase()}${snapshot.message.slice(1)}`,
      };
    default:
      return {
        state: 'unavailable',
        text: 'Could not check for updates: the update server could not be reached.',
      };
  }
}

/** An issue's reason on its own, for a row already titled "Couldn't check for updates". */
export function versionCheckIssueDetail(text: string): string {
  return text.replace(/^Could not check for updates:\s*(.)/i, (_match, initial: string) =>
    initial.toUpperCase(),
  );
}

export type SystemVersionStatus = ReturnType<typeof useSystemVersionStatus>;

/**
 * What the bell says about updates: an actionable "Update ready" only for a
 * newer release, and a check that could not finish said once without an
 * action -- there is nothing to install, so it is not counted in the badge.
 */
export function attentionUpdate(versions: SystemVersionStatus): {
  updateReady: boolean;
  checkIssue: string | undefined;
  shown: boolean;
} {
  const updateReady = versions.state === 'available';
  const checkIssue =
    versions.state === 'unavailable' && versions.message
      ? versionCheckIssueDetail(versions.message)
      : undefined;
  return { updateReady, checkIssue, shown: updateReady || checkIssue !== undefined };
}
