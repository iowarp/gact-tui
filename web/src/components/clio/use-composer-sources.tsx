import type { ConnectedSourceState, WorkspaceReference } from '@clio/core/v3';
import { useLayoutEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ConnectedSourcePicker } from './connected-source-picker';
import { SourceDownloadAttachment } from './source-download-attachment';
import type { SourceDownloadSelection } from './source-download-selection';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { useSourceDraftLifecycle } from './use-source-draft-lifecycle';
import { toast } from 'sonner';

/** Own the shared attachment picker and directory-drop handoff for the composer. */
export function useComposerSources(
  workspaceId: string,
  onSelect: (reference: WorkspaceReference) => void,
  onUploadFiles?: () => void,
) {
  const { settings } = useConnectionSettings();
  const queryClient = useQueryClient();
  const lifecycle = useSourceDraftLifecycle(workspaceId);
  const [location, setLocation] = useState<{ folder: string; downloaded: boolean }>();
  const scope = `${connectionScope(settings)}:${workspaceId}`;
  const current = useRef({ scope, onSelect });
  useLayoutEffect(() => {
    current.current = { scope, onSelect };
    return () => {
      current.current = { scope: '', onSelect };
    };
  }, [scope, onSelect]);
  const [open, setOpen] = useState(false);
  const [droppedFolder, setDroppedFolder] = useState<File[]>([]);
  const [downloads, setDownloads] = useState<
    Array<{
      scope: string;
      source: ConnectedSourceState;
      operationId: string;
      selection?: SourceDownloadSelection;
    }>
  >([]);
  const pendingIds = useRef(new Set<string>());
  const pending = downloads.filter((row) => row.scope === scope);
  const removeDownload = (operationId: string) => {
    pendingIds.current.delete(operationId);
    setDownloads((rows) => rows.filter((row) => row.operationId !== operationId));
  };
  const close = () => {
    setOpen(false);
    setLocation(undefined);
    setDroppedFolder([]);
  };
  return {
    pending: pending.length > 0,
    attachments: pending.length ? (
      <div
        role="group"
        aria-label="Downloading attachments"
        className="flex w-full flex-wrap gap-2 px-3 pt-3"
      >
        {pending.map((row) => (
          <SourceDownloadAttachment
            key={row.operationId}
            workspaceId={workspaceId}
            source={row.source}
            operationId={row.operationId}
            selection={row.selection}
            onRemove={async () => {
              try {
                await lifecycle.removeDownload(row.source.id, row.selection?.draftId);
                removeDownload(row.operationId);
              } catch (error) {
                toast.error('Could not remove download', {
                  description: error instanceof Error ? error.message : String(error),
                });
              }
            }}
            onSelect={(reference) => {
              if (pendingIds.current.has(row.operationId) && current.current.scope === row.scope)
                current.current.onSelect(reference);
              removeDownload(row.operationId);
            }}
          />
        ))}
      </div>
    ) : null,
    open: workspaceId ? () => setOpen(true) : undefined,
    openReference: (reference: WorkspaceReference) => {
      queryClient.setQueryData(
        ['connected-storage-selection', connectionScope(settings), workspaceId],
        reference.navigation.source_id,
      );
      setLocation({
        folder: String(reference.navigation.source_path ?? ''),
        downloaded: reference.navigation.source_linked === 'false',
      });
      setOpen(true);
    },
    drop: workspaceId
      ? (files: File[]) => {
          setDroppedFolder(files);
          setOpen(true);
        }
      : undefined,
    picker: workspaceId ? (
      <ConnectedSourcePicker
        workspaceId={workspaceId}
        open={open}
        onOpenChange={(next) => {
          if (next) setOpen(true);
          else close();
        }}
        initialFolderFiles={droppedFolder}
        initialFolder={location?.folder}
        initialDownloaded={location?.downloaded}
        onDownloadStarted={(source, operationId, selection) => {
          if (current.current.scope !== scope) return;
          pendingIds.current.add(operationId);
          setDownloads((rows) => [
            ...rows.filter((row) => row.operationId !== operationId),
            { scope, source, operationId, selection },
          ]);
          close();
        }}
        onUploadFiles={
          onUploadFiles
            ? () => {
                close();
                onUploadFiles();
              }
            : undefined
        }
        onSelect={(reference) => {
          if (current.current.scope === scope) current.current.onSelect(reference);
          close();
        }}
      />
    ) : null,
  };
}
