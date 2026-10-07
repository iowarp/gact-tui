interface FileInventory {
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
export function archiveFileHref(uri: string, inventory: FileInventory): string | undefined {
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
