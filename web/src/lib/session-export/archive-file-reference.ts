/** The files an export includes, as its manifest lists them. */
export interface ArchiveFileInventory {
  files: { archive_path: string; source_path?: string }[];
  artifacts: { artifact_id: string; archive_path?: string | null; path?: string }[];
  workspace_folders?: { source_path: string; archive_path: string }[];
}

function normalize(path: string): string {
  const cleaned = path
    .replaceAll('\\', '/')
    .replace(/^\/\/\?\//u, '')
    .replace(/\/+$/u, '');
  return /^[A-Za-z]:/u.test(cleaned) ? cleaned.toLowerCase() : cleaned;
}

/** Resolve only paths actually inventoried in the export, never arbitrary host paths. */
export function archiveFileHref(uri: string, inventory: ArchiveFileInventory): string | undefined {
  const id = uri.startsWith('artifact://')
    ? uri.slice('artifact://'.length).split('/')[0]
    : undefined;
  const canonical = normalize(uri);
  let path = inventory.artifacts.find((item) =>
    id ? item.artifact_id === id : item.path && normalize(item.path) === canonical,
  )?.archive_path;
  path ??= inventory.files.find(
    (item) =>
      item.archive_path === uri || (item.source_path && normalize(item.source_path) === canonical),
  )?.archive_path;
  if (!path) {
    for (const folder of inventory.workspace_folders ?? []) {
      const root = normalize(folder.source_path);
      if (!canonical.startsWith(root + '/')) continue;
      const relative = uri
        .replaceAll('\\', '/')
        .replace(/^\/\/\?\//u, '')
        .slice(root.length + 1);
      const candidate = `${folder.archive_path}/${relative}`;
      path = inventory.files.find(
        (item) => normalize(item.archive_path) === normalize(candidate),
      )?.archive_path;
      if (path) break;
    }
  }
  return path?.split('/').map(encodeURIComponent).join('/');
}

/**
 * Where a folder's files are in the export: the archive directory holding the
 * included files that came from under `folder` (a workspace snapshot's copy, or
 * recorded inputs and artifacts), or undefined when the export carries none.
 */
export function archiveFolderPath(
  folder: string,
  inventory: ArchiveFileInventory,
): string | undefined {
  const root = normalize(folder);
  if (!root) return undefined;
  const found: string[] = [];
  for (const file of inventory.files)
    if (file.source_path && normalize(file.source_path).startsWith(root + '/'))
      found.push(file.archive_path);
  for (const item of inventory.artifacts)
    if (item.archive_path && item.path && normalize(item.path).startsWith(root + '/'))
      found.push(item.archive_path);
  for (const mapping of inventory.workspace_folders ?? []) {
    const base = normalize(mapping.source_path);
    if (root !== base && !root.startsWith(base + '/')) continue;
    const prefix = normalize(`${mapping.archive_path}/${root.slice(base.length + 1)}`);
    for (const file of inventory.files)
      if (normalize(file.archive_path).startsWith(prefix + '/')) found.push(file.archive_path);
  }
  if (!found.length) return undefined;
  // The deepest directory every found file shares.
  const parts = found.map((path) => path.split('/').slice(0, -1));
  const shared: string[] = [];
  for (let index = 0; parts.every((row) => index < row.length); index += 1) {
    const segment = parts[0]![index]!;
    if (!parts.every((row) => row[index] === segment)) break;
    shared.push(segment);
  }
  return shared.join('/') || found[0];
}
