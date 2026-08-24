import type { WorkspaceFileEntry } from '@clio/core/v3';

/** Keeps CLIO-owned persistence out of general user file and search surfaces. */
export function visibleWorkspaceFiles(
  files: readonly WorkspaceFileEntry[],
): WorkspaceFileEntry[] {
  return files.filter((file) => !isClioInternalPath(file.path));
}

export function isClioInternalPath(path: string): boolean {
  const normalized = path.replace(/\\/gu, '/').toLocaleLowerCase();
  return normalized
    .split('/')
    .filter(Boolean)
    .some((segment) => segment === '.clio' || segment.startsWith('.clio-'));
}
