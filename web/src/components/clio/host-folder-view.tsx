import type { WorkspaceFileEntry, WorkspaceResource } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  AttachedFolderIcon,
  type HostFolder,
  hostFolderInPlace,
  hostFolderOriginal,
  hostFolderSize,
  hostFolderStatement,
} from './host-folder';
import { PathText } from './path-text';
import { ResourceLoading } from './resource-states';
import { TechnicalDetails } from './technical-details';
import { WorkbenchFileTree } from './workbench-file-tree';
import { buildFileTree, type WorkspaceFileNode } from './workbench-file-tree-model';

/** Rows drawn at most; the record itself already lists only part of a very large folder. */
const MAX_ROWS = 1000;

interface FolderEntry {
  path: string;
  kind: 'file' | 'directory';
  size?: number;
}

interface FolderListing {
  entries: FolderEntry[];
  truncated: boolean;
}

const ACCESS_LABELS: Record<string, string> = {
  read_write: 'Read and write',
  read_only: 'Read only',
};

/**
 * An attached folder from the agent's computer, shown as a folder: how it is attached,
 * where it lives and what is in it. Its resource bytes are only the record CLIO keeps
 * for the agent, so they are read for the listing and never shown as a file.
 */
export function HostFolderView({
  besideControls,
  folder,
  resource,
  workspaceId,
}: {
  /** Arrows overlay the sides (a carousel of several), so the content keeps out from under them. */
  besideControls?: boolean;
  folder: HostFolder;
  resource: WorkspaceResource;
  workspaceId: string;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const record = useQuery({
    queryKey: queryKeys.workspaceResourcePreview(
      settings.endpoint,
      workspaceId,
      resource.id,
      resource.revision,
    ),
    queryFn: ({ signal }) => repository.resourcePreview(workspaceId, resource.id, signal),
    enabled: resource.state === 'ready',
  });
  const listing = useMemo(() => parseListing(record.data), [record.data]);
  const inPlace = hostFolderInPlace(folder);
  const original = hostFolderOriginal(folder);
  const size = hostFolderSize(folder);
  const access = ACCESS_LABELS[folder.access ?? ''];
  const name = folder.label || resource.name;
  const rows = useMemo(() => listing?.entries.slice(0, MAX_ROWS) ?? [], [listing]);
  const hidden = listing ? listing.entries.length - rows.length : 0;
  const tree = useMemo(() => folderTree(rows), [rows]);

  return (
    <ScrollArea className="h-full">
      <section
        aria-label={`Folder ${name}`}
        className={cn('@container mx-auto w-full max-w-3xl p-5', besideControls && 'px-12')}
      >
        <header className="flex items-start gap-3">
          <AttachedFolderIcon
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
          />
          <div className="min-w-0">
            <h2 className="text-base font-medium [overflow-wrap:anywhere]">{name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{hostFolderStatement(folder)}</p>
          </div>
        </header>
        <dl className="mt-4 grid grid-cols-1 gap-x-4 text-sm @sm:grid-cols-[auto_minmax(0,1fr)] @sm:gap-y-1.5">
          {original ? (
            <>
              <dt className="mt-1.5 text-muted-foreground first:mt-0 @sm:mt-0">
                {inPlace ? 'Folder' : 'Copied from'}
              </dt>
              <dd>
                <PathText path={original} />
              </dd>
            </>
          ) : null}
          {size ? (
            <>
              <dt className="mt-1.5 text-muted-foreground first:mt-0 @sm:mt-0">Size</dt>
              <dd>{size}</dd>
            </>
          ) : null}
          {access ? (
            <>
              <dt className="mt-1.5 text-muted-foreground first:mt-0 @sm:mt-0">Access</dt>
              <dd>{access}</dd>
            </>
          ) : null}
        </dl>
        {!inPlace && folder.path ? (
          <TechnicalDetails className="mt-3 text-xs" title="Technical details">
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              Copy kept at <PathText path={folder.path} />
            </p>
          </TechnicalDetails>
        ) : null}
        <h3 className="mt-6 border-b pb-2 text-sm font-medium">Contents</h3>
        {record.isPending && resource.state === 'ready' ? (
          <ResourceLoading className="mt-3" label="Loading the folder's contents" variant="line" />
        ) : null}
        {record.error ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            Could not list this folder. {record.error.message}
          </p>
        ) : null}
        {listing && !rows.length ? (
          <p className="mt-3 text-sm text-muted-foreground">This folder is empty.</p>
        ) : null}
        {rows.length ? (
          <div className="mt-1">
            <WorkbenchFileTree
              countFolders
              defaultExpanded={tree.folders}
              label={`Contents of ${name}`}
              nodes={tree.nodes}
            />
          </div>
        ) : null}
        {listing && (listing.truncated || hidden > 0) ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Showing the first {rows.length} items. {vocab.agent} can read the whole folder.
          </p>
        ) : null}
      </section>
    </ScrollArea>
  );
}

/** The listing as a tree, every folder open so nothing is hidden on arrival. */
function folderTree(entries: readonly FolderEntry[]) {
  const nodes = buildFileTree(
    entries.map(
      (entry): WorkspaceFileEntry => ({
        path: entry.path,
        type: entry.kind === 'directory' ? 'dir' : 'file',
        internal: false,
        size: entry.size,
      }),
    ),
  );
  const folders: string[] = [];
  const walk = (level: readonly WorkspaceFileNode[]) => {
    for (const node of level) {
      if (node.entry.type !== 'dir') continue;
      folders.push(node.entry.path);
      walk([...node.children.values()]);
    }
  };
  walk(nodes);
  return { nodes, folders };
}

function parseListing(bytes: Uint8Array | undefined): FolderListing | undefined {
  if (!bytes) return undefined;
  try {
    const record = JSON.parse(new TextDecoder().decode(bytes)) as {
      entries?: unknown;
      entries_truncated?: unknown;
    };
    const entries = (Array.isArray(record.entries) ? record.entries : [])
      .filter(
        (entry): entry is FolderEntry =>
          Boolean(entry) &&
          typeof entry === 'object' &&
          typeof (entry as FolderEntry).path === 'string' &&
          ((entry as FolderEntry).kind === 'file' || (entry as FolderEntry).kind === 'directory'),
      )
      .sort((left, right) => left.path.localeCompare(right.path));
    return { entries, truncated: record.entries_truncated === true };
  } catch {
    return { entries: [], truncated: false };
  }
}
