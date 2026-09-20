/** Convert Tauri's fourth component build metadata into the public release form. */
export function displayReleaseVersion(version: string | undefined): string | undefined {
  const trimmed = version?.trim().replace(/^v/u, '');
  if (!trimmed) return undefined;
  return trimmed.replace(/^(\d+\.\d+\.\d+)\+(\d+)$/u, '$1.$2');
}

/** Return a release tag accepted by both GitHub and the CLIO installer. */
export function releaseTag(version: string): string {
  return `v${displayReleaseVersion(version) ?? version}`;
}

/** Compare numeric release components; prerelease labels sort before a final release. */
export function compareReleaseVersions(left: string, right: string): number {
  const parse = (value: string): { parts: number[]; prerelease: boolean } => {
    const normalized = displayReleaseVersion(value) ?? value;
    const [core, prerelease] = normalized.split('-', 2);
    return {
      parts: core.split('.').map((part) => Number.parseInt(part, 10) || 0),
      prerelease: Boolean(prerelease),
    };
  };
  const a = parse(left);
  const b = parse(right);
  const width = Math.max(a.parts.length, b.parts.length);
  for (let index = 0; index < width; index += 1) {
    const delta = (a.parts[index] ?? 0) - (b.parts[index] ?? 0);
    if (delta !== 0) return delta < 0 ? -1 : 1;
  }
  if (a.prerelease === b.prerelease) return 0;
  return a.prerelease ? -1 : 1;
}
