import { compareReleaseVersions, displayReleaseVersion } from '@/lib/release-version';

/** One released version's section of a CHANGELOG.md. */
export interface ChangelogEntry {
  /** Public release form, e.g. `0.11.2.22`. */
  version: string;
  /** The date on the heading, when it has one. */
  date?: string;
  /** The section's markdown, without its heading. Empty for a release with no notes. */
  body: string;
}

export interface ChangelogSection {
  title?: string;
  body: string;
}

/** Preserve Markdown while separating third-level sections outside fenced code. */
export function changelogSections(markdown: string): ChangelogSection[] {
  const sections: ChangelogSection[] = [];
  let title: string | undefined;
  let lines: string[] = [];
  let fence: string | undefined;
  const flush = () => {
    const body = lines.join('\n').trim();
    if (body) sections.push({ title, body });
  };
  for (const line of markdown.split(/\r?\n/u)) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/u.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
    }
    const heading = !fence && /^###\s+(.+?)\s*#*\s*$/u.exec(line);
    if (heading) {
      flush();
      title = heading[1];
      lines = [];
    } else lines.push(line);
  }
  flush();
  return sections;
}

// `## [0.11.2.22] — 2026-09-29` (Keep a Changelog). `## Unreleased` has no
// version and is skipped: it is not something anyone has installed.
const HEADING = /^##\s+\[?v?(\d+(?:\.\d+)+(?:-[\w.]+)?)\]?(?:\s*[-—–]\s*(\S+))?\s*$/u;

/** The released sections of a Keep-a-Changelog file, newest first as written. */
export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: { version: string; date?: string; lines: string[] } | undefined;
  const flush = () => {
    if (current) {
      entries.push({
        version: current.version,
        date: current.date,
        body: current.lines.join('\n').trim(),
      });
    }
  };
  for (const line of markdown.split(/\r?\n/u)) {
    if (line.startsWith('## ')) {
      flush();
      const match = HEADING.exec(line);
      current = match ? { version: match[1], date: match[2], lines: [] } : undefined;
      continue;
    }
    current?.lines.push(line);
  }
  flush();
  return entries;
}

/**
 * The entries a person gets by moving from `from` to `to`: newer than `from`,
 * up to and including `to`, newest first. Releases with no notes are dropped.
 */
export function changesBetween(
  entries: ChangelogEntry[],
  from: string,
  to: string,
): ChangelogEntry[] {
  const low = displayReleaseVersion(from) ?? from;
  const high = displayReleaseVersion(to) ?? to;
  return entries
    .filter(
      (entry) =>
        entry.body.length > 0 &&
        compareReleaseVersions(entry.version, low) > 0 &&
        compareReleaseVersions(entry.version, high) <= 0,
    )
    .sort((a, b) => compareReleaseVersions(b.version, a.version));
}
