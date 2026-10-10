import type { ConnectedSourceState, SourceOperation } from '@clio/core/v3';
import { useEffect, useRef, useState } from 'react';
import type { SourceDownloadSelection } from './source-download-selection';

type AttachmentInput = {
  source: ConnectedSourceState;
  path: string;
  draftId?: string;
  linked?: boolean;
};

/** Attach once, after the exact storage owner has published its completed manifest. */
export function useStorageAttachment(
  source: ConnectedSourceState,
  operations: readonly SourceOperation[] | undefined,
  downloaded: boolean,
  attachFolder: (input: AttachmentInput) => void,
  attachFile: (input: AttachmentInput) => void,
) {
  const [queued, queue] = useState<{ id: string; selection: SourceDownloadSelection }>();
  const attached = useRef<string | undefined>(undefined);
  const operation = operations?.find((row) => row.id === queued?.id);
  useEffect(() => {
    if (!queued || operation?.state !== 'completed' || attached.current === operation.id) return;
    if (!queued.selection.linked && !downloaded) return;
    attached.current = operation.id;
    const { path, draftId, linked, kind } = queued.selection;
    (kind === 'file' ? attachFile : attachFolder)({ source, path, draftId, linked });
  }, [queued, operation?.id, operation?.state, downloaded, source, attachFolder, attachFile]);
  return queue;
}
