/**
 * Convert fourth-component build metadata into the public release form:
 * Tauri's `0.9.4+3` and the workspace package's `0.11.2+patch.25` both
 * become the published `0.9.4.3` / `0.11.2.25`.
 */
export function displayReleaseVersion(version: string | undefined): string | undefined {
  const trimmed = version?.trim().replace(/^v/u, '');
  if (!trimmed) return undefined;
  return trimmed
    .replace(/^(\d+\.\d+\.\d+)b(\d+)\.post(\d+)$/u, '$1-beta.$2.$3')
    .replace(/^(\d+\.\d+\.\d+)-(\d+)\+(\d+)$/u, '$1-beta.$2.$3')
    .replace(/^(\d+\.\d+\.\d+)\+(?:patch\.)?(\d+)$/u, '$1.$2')
    .replace(/^(\d+\.\d+\.\d+)(?:b|-)(\d+)$/u, '$1-beta.$2');
}

/** Return a release tag accepted by both GitHub and the CLIO installer. */
export function releaseTag(version: string): string {
  return `v${displayReleaseVersion(version) ?? version}`;
}

/** Compare numeric release components; prerelease labels sort before a final release. */
export function compareReleaseVersions(left: string, right: string): number {
  const parse = (value: string): { parts: number[]; prerelease: string[] } => {
    const normalized = displayReleaseVersion(value) ?? value;
    const [core, prerelease] = normalized.split('-', 2);
    return {
      parts: core.split('.').map((part) => Number.parseInt(part, 10) || 0),
      prerelease: prerelease ? prerelease.split('.') : [],
    };
  };
  const a = parse(left);
  const b = parse(right);
  const width = Math.max(a.parts.length, b.parts.length);
  for (let index = 0; index < width; index += 1) {
    const delta = (a.parts[index] ?? 0) - (b.parts[index] ?? 0);
    if (delta !== 0) return delta < 0 ? -1 : 1;
  }
  if (!a.prerelease.length || !b.prerelease.length) {
    return a.prerelease.length ? -1 : b.prerelease.length ? 1 : 0;
  }
  for (let index = 0; index < Math.max(a.prerelease.length, b.prerelease.length); index += 1) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];
    if (leftPart === rightPart) continue;
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    const leftNumeric = /^\d+$/u.test(leftPart);
    const rightNumeric = /^\d+$/u.test(rightPart);
    if (leftNumeric && rightNumeric) return Number(leftPart) < Number(rightPart) ? -1 : 1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

/** Recognize the public, Python, and Tauri spellings of a beta release. */
export function isBetaVersion(version: string | undefined): boolean {
  return /-beta\.\d+(?:\.\d+)?$/u.test(displayReleaseVersion(version) ?? '');
}
