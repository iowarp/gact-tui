// The desktop app's own CHANGELOG, bundled at build time.
import interfaceChangelog from '../../../CHANGELOG.md?raw';
import { changesBetween, parseChangelog, type ChangelogEntry } from '@/lib/changelog';
import { compareReleaseVersions } from '@/lib/release-version';

/** The desktop version this machine last showed notes for (or ran). */
const SEEN_DESKTOP_KEY = 'clio.whatsNew.desktopVersion';
const SEEN_INTERFACE_KEY = 'clio.whatsNew.interfaceVersion';

/** Branded builds provide their own changelog independently of the UI release. */
export function hasProductChangelog(): boolean {
  return Boolean(import.meta.env.VITE_CLIO_DESKTOP_CHANGELOG?.trim());
}

/** The last desktop version recorded, or null when none was. */
export function readSeen(product: 'desktop' | 'interface' = 'desktop'): string | null {
  try {
    return window.localStorage.getItem(
      product === 'desktop' ? SEEN_DESKTOP_KEY : SEEN_INTERFACE_KEY,
    );
  } catch {
    return null;
  }
}

/** Record `version` as seen, so its notes don't show again. */
export function writeSeen(version: string, product: 'desktop' | 'interface' = 'desktop'): void {
  try {
    window.localStorage.setItem(
      product === 'desktop' ? SEEN_DESKTOP_KEY : SEEN_INTERFACE_KEY,
      version,
    );
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
  return changesSince(
    hasProductChangelog() ? import.meta.env.VITE_CLIO_DESKTOP_CHANGELOG : interfaceChangelog,
    seen,
    current,
    justUpdated,
  );
}

/** UI notes use the stamped UI build version, independently of the native app. */
export function interfaceChangesSince(
  seen: string | null,
  current: string,
  justUpdated: boolean,
): ChangelogEntry[] {
  return changesSince(interfaceChangelog, seen, current, justUpdated);
}

function changesSince(
  changelog: string,
  seen: string | null,
  current: string,
  justUpdated: boolean,
): ChangelogEntry[] {
  const entries = parseChangelog(changelog);
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
