import type { ConnectedSourceState, WorkspaceReference } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { Button } from '@/components/ui/button';
import { SourceAttachmentCard } from './composer-source-attachments';
import { useSourceFolderReference } from './use-source-folder-reference';
import { useSourceFileReference } from './use-source-file-reference';
import type { SourceDownloadSelection } from './source-download-selection';

/** Follow an explicitly attached storage operation after its picker is closed. */
export function SourceDownloadAttachment({
  workspaceId,
  source,
  operationId,
  selection,
  onSelect,
  onRemove,
}: {
  workspaceId: string;
  source: ConnectedSourceState;
  operationId: string;
  selection?: SourceDownloadSelection;
  onSelect: (reference: WorkspaceReference) => void;
  onRemove: () => void;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const operations = useQuery({
    queryKey: [
      'connected-storage',
      connectionScope(settings),
      workspaceId,
      source.id,
      'operations',
    ],
    queryFn: ({ signal }) => repository.sourceOperations(workspaceId, source.id, signal),
    refetchInterval: (query) =>
      query.state.data?.some(
        (row) =>
          row.id === operationId &&
          ['completed', 'failed', 'cancelled', 'interrupted'].includes(row.state),
      )
        ? false
        : 1500,
    retry: false,
  });
  const operation = operations.data?.find((row) => row.id === operationId);
  const folder = useSourceFolderReference(workspaceId, onSelect);
  const file = useSourceFileReference(workspaceId, onSelect);
  const isFile = selection?.kind === 'file';
  const receipt = isFile ? file : folder;
  const attempted = useRef(false);
  const attach = isFile ? file.mutate : folder.mutate;
  const path = selection?.path ?? '';
  const linked = selection?.linked ?? false;
  useEffect(() => {
    if (operation?.state === 'completed' && !attempted.current) {
      attempted.current = true;
      attach({ source, path, draftId: selection?.draftId, linked });
    }
  }, [operation?.state, attach, source, path, selection?.draftId, linked]);
  const problem = receipt.error?.message || operations.error?.message || operation?.error;
  const stopped = operation && ['failed', 'cancelled', 'interrupted'].includes(operation.state);
  const detail =
    problem ||
    (stopped
      ? `${linked ? 'Indexing' : 'Download'} ${operation.state}`
      : operation?.state === 'completed'
        ? 'Preparing attachment…'
        : linked
          ? `Indexing folder… ${operation?.entries_done ?? 0} entries`
          : isFile
            ? 'Downloading file…'
            : 'Downloading folder…');
  return (
    <SourceAttachmentCard
      id={operationId}
      label={path ? `${source.label} / ${path}` : source.label}
      detail={detail}
      folder={!isFile}
      onRemove={onRemove}
    >
      {receipt.error && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => attach({ source, path, draftId: selection?.draftId, linked })}
        >
          Retry attachment
        </Button>
      )}
      {!linked && !problem && !stopped && operation?.bytes_total ? (
        <progress
          aria-label={`Downloading ${source.label}`}
          className="mt-1 h-1 w-full accent-primary"
          value={operation.bytes_done}
          max={operation.bytes_total}
        />
      ) : null}
    </SourceAttachmentCard>
  );
}
