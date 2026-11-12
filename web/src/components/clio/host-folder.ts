import type { WorkspaceResource } from '@clio/core/v3';
import { vocab } from '@/lib/brand-vocabulary';
import { formatBytes } from '@/lib/format';

/** A folder on the agent's computer, used in place or copied, recorded on its resource. */
export type HostFolder = Record<string, string>;

/** The host folder a resource stands for, when it is one. */
export function hostFolderOf(resource: WorkspaceResource | undefined): HostFolder | undefined {
  const source = resource?.connected_source;
  return source?.kind === 'host_folder' ? source : undefined;
}

/** The name people know a resource by: a host folder's own name, not its internal record. */
export function resourceDisplayName(resource: WorkspaceResource): string {
  return hostFolderOf(resource)?.label || resource.name;
}

export function hostFolderInPlace(folder: HostFolder): boolean {
  return folder.placement === 'in_place';
}

/** What the agent works on, and whether its changes reach the person's files. */
export function hostFolderStatement(folder: HostFolder): string {
  return hostFolderInPlace(folder)
    ? `In place. ${vocab.agent} works on your original folder, and its changes affect your files.`
    : `Full copy. ${vocab.agent} works on its own copy, and your originals stay untouched.`;
}

/** "N files, X", or empty when the record has no counts. */
export function hostFolderSize(folder: HostFolder): string {
  const files = Number(folder.file_count);
  const bytes = Number(folder.total_bytes);
  if (!folder.file_count || !Number.isFinite(files) || !Number.isFinite(bytes)) return '';
  return `${files} ${files === 1 ? 'file' : 'files'}, ${formatBytes(bytes)}`;
}

/** The person's own folder: the original of a copy, or the folder itself when in place. */
export function hostFolderOriginal(folder: HostFolder): string {
  return folder.original_path || (hostFolderInPlace(folder) ? folder.path : '');
}
