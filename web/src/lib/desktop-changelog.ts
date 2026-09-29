// The desktop app's own CHANGELOG, bundled at build time.
import desktopChangelog from '../../../CHANGELOG.md?raw';
import { changesBetween, parseChangelog, type ChangelogEntry } from '@/lib/changelog';
import { compareReleaseVersions } from '@/lib/release-version';

/** The desktop version this machine last showed notes for (or ran). */
const SEEN_DESKTOP_KEY = 'clio.whatsNew.desktopVersion';

/** The last desktop version recorded, or null when none was. */
export function readSeen(): string | null {
  try {
    return window.localStorage.getItem(SEEN_DESKTOP_KEY);
  } catch {
    return null;
  }
}

/** Record `version` as seen, so its notes don't show again. */
export function writeSeen(version: string): void {
  try {
    window.localStorage.setItem(SEEN_DESKTOP_KEY, version);
  } catch {
    // Unavailable storage only means the notes may show again next launch.
  }
}

/**
 * The desktop app's changes to show after an update: the bundled CHANGELOG
 * sections newer than the version this machine last ran. With nothing
 * recorded, only an in-app update (`justUpdated`, from the restart marker)
 * shows this version's own notes; a first install shows nothing.
 */
export function desktopChangesSince(
  seen: string | null,
  current: string,
  justUpdated: boolean,
): ChangelogEntry[] {
  const entries = parseChangelog(desktopChangelog);
  if (!seen) {
    // Versions before this window existed never recorded what they were.
    return justUpdated
      ? entries.filter(
          (entry) => entry.body.length > 0 && compareReleaseVersions(entry.version, current) === 0,
        )
      : [];
  }
  if (compareReleaseVersions(seen, current) >= 0) return [];
  return changesBetween(entries, seen, current);
}
