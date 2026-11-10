import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { WorkspaceFileComments } from './comments/file-comments';
import { FileTextView } from './file-text-view';
import { HtmlFileInBrowser } from './html-in-browser';
import { LatexFileWorkspace } from './latex-workspace';
import { StateView } from './primitives/state-view';
import { ResourceLoading, ViewerReadError } from './resource-states';
import { useRepository } from '@/hooks/use-repository';
import { useWorkspaceTextWindow } from '@/hooks/use-workspace-text-window';
import { textFileFormat } from '@/lib/file-presentation';
import { formatBytes } from '@/lib/format';
import { queryKeys } from '@/lib/query-keys';
import {
  PREVIEW_ROW_LIMIT,
  TEXT_FULL_READ_MAX_BYTES,
  TEXT_WINDOW_CHUNK_BYTES,
} from '@/lib/runtime-limits';
import { SourceWindowContext } from '@/lib/source-window';
import { useConnectionSettings } from '@/providers/connection-provider';
import { FileWindowNoticeShown } from './file-window-context';

function fileName(path: string): string {
  return (
    path
      .split(/[\\/]+/)
      .filter(Boolean)
      .at(-1) ?? path
  );
}

export function WorkspaceTextView({
  workspaceId,
  path,
  size,
  mediaType,
  html,
  startAtEnd = false,
}: {
  workspaceId: string;
  path: string;
  size?: number;
  mediaType?: string;
  /** An HTML file: shown as its source, and opened in the shared browser. */
  html?: { openOnShow: boolean };
  /** A large file opens on its last window (the too-large state's Show the last). */
  startAtEnd?: boolean;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  // Unsized and large files are read in ranged windows, never whole.
  const windowed = size === undefined || size > TEXT_FULL_READ_MAX_BYTES;
  const content = useQuery({
    queryKey: queryKeys.workspaceFile(settings.endpoint, workspaceId, path),
    queryFn: ({ signal }) => repository.readWorkspaceFile(workspaceId, path, signal),
    enabled: !windowed,
  });
  if (windowed)
    return (
      <WorkspaceTextWindowView
        html={html}
        mediaType={mediaType}
        path={path}
        size={size}
        startAtEnd={startAtEnd}
        workspaceId={workspaceId}
      />
    );
  return (
    <WorkspaceTextContent
      content={content.data}
      error={content.error?.message}
      html={html}
      mediaType={mediaType}
      onRetry={() => void content.refetch()}
      path={path}
      workspaceId={workspaceId}
    />
  );
}

/** A file's text once read whole: HTML opens in the browser, papers in the LaTeX workspace. */
function WorkspaceTextContent({
  workspaceId,
  path,
  mediaType,
  html,
  content,
  error,
  onRetry,
}: {
  workspaceId: string;
  path: string;
  mediaType?: string;
  html?: { openOnShow: boolean };
  content?: string;
  error?: string;
  onRetry?: () => void;
}) {
  if (html && content !== undefined)
    return (
      <HtmlFileInBrowser
        content={content}
        name={fileName(path)}
        openOnShow={html.openOnShow}
        path={path}
      />
    );
  const view = (
    <TextResourceView
      content={content}
      error={error}
      mediaType={mediaType}
      onRetry={onRetry}
      path={path}
    />
  );
  // Documents take text comments in the file view too (ledger FB22): Markdown and LaTeX.
  const format = textFileFormat(path, mediaType);
  if (format !== 'markdown' && !path.toLowerCase().endsWith('.tex')) return view;
  // A paper's entry file (it has \documentclass) opens as the LaTeX workspace.
  if (path.toLowerCase().endsWith('.tex') && /^[^%\n]*\\documentclass/mu.test(content ?? ''))
    return (
      <WorkspaceFileComments modes={['text', 'region']} path={path} workspaceId={workspaceId}>
        <LatexFileWorkspace fallback={view} path={path} workspaceId={workspaceId} />
      </WorkspaceFileComments>
    );
  return (
    <WorkspaceFileComments modes={['text']} path={path} workspaceId={workspaceId}>
      {view}
    </WorkspaceFileComments>
  );
}

/**
 * A large or unsized text file: its head window first, more as the source
 * scrolls, and its end on request. A file that fits in the first window is
 * shown whole, like any other.
 */
function WorkspaceTextWindowView({
  workspaceId,
  path,
  size,
  mediaType,
  html,
  startAtEnd,
}: {
  workspaceId: string;
  path: string;
  size?: number;
  mediaType?: string;
  html?: { openOnShow: boolean };
  startAtEnd: boolean;
}) {
  const [showEnd, setShowEnd] = useState(startAtEnd);
  const textWindow = useWorkspaceTextWindow(workspaceId, path, { tail: showEnd });
  const sourceWindow = useMemo(
    () => ({ onEndReached: textWindow.loadMore }),
    [textWindow.loadMore],
  );
  const head = textWindow.head;
  // A table's end keeps the file's header and shows its last rows, not the end's first ones.
  const table = textFileFormat(path, mediaType) === 'csv';
  const tail = useMemo(() => {
    if (textWindow.tail === undefined || !table) return textWindow.tail;
    if (!head && !textWindow.headError) return undefined;
    const lines = textWindow.tail.replace(/\r?\n$/u, '').split('\n');
    const rows = lines.slice(-PREVIEW_ROW_LIMIT).join('\n');
    const header = head?.text.split('\n', 1)[0];
    return header === undefined ? rows : `${header.replace(/\r$/u, '')}\n${rows}`;
  }, [head, table, textWindow.headError, textWindow.tail]);
  // The end opens without waiting on the head; a file whose head is all of it shows whole.
  if (head?.complete || (!showEnd && !head))
    return (
      <WorkspaceTextContent
        content={head?.text}
        error={textWindow.headError?.message}
        html={html}
        mediaType={mediaType}
        path={path}
        workspaceId={workspaceId}
      />
    );
  const name = fileName(path);
  const total = size === undefined ? '' : ` of ${formatBytes(size)}`;
  const status =
    showEnd || !head
      ? textWindow.tailError
        ? `The end of ${name} couldn't be read.`
        : table
          ? `Showing the last ${PREVIEW_ROW_LIMIT.toLocaleString()} rows${total}.`
          : `Showing the last ${formatBytes(TEXT_WINDOW_CHUNK_BYTES)}${total}.`
      : head.capped
        ? `Showing the first ${formatBytes(head.loadedBytes)}${total}. The rest is too large to show here.`
        : `Showing the first ${formatBytes(head.loadedBytes)}${total}.`;
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col" data-slot="text-file-window">
      <div className="min-h-0 flex-1">
        <FileWindowNoticeShown.Provider value>
          {showEnd || !head ? (
            textWindow.tailError ? (
              <ViewerReadError error={textWindow.tailError.message} where={path} />
            ) : tail === undefined ? (
              <ResourceLoading className="p-4" label={`Loading the end of ${name}`} />
            ) : (
              <FileTextView content={tail} mediaType={mediaType} name={name} />
            )
          ) : (
            <SourceWindowContext.Provider value={sourceWindow}>
              <FileTextView content={head.text} mediaType={mediaType} name={name} />
            </SourceWindowContext.Provider>
          )}
        </FileWindowNoticeShown.Provider>
      </div>
      <StateView
        action={{
          label: showEnd
            ? 'Show beginning'
            : `Show the last ${formatBytes(TEXT_WINDOW_CHUNK_BYTES)}`,
          onClick: () => setShowEnd(!showEnd),
        }}
        className="shrink-0 border-t px-3"
        kind={!showEnd && textWindow.loadingMore ? 'loading' : 'too-large'}
        secondaryAction={
          !showEnd && textWindow.loadMore
            ? { label: 'Load more', onClick: textWindow.loadMore }
            : undefined
        }
        size="row"
        title={status}
      />
    </div>
  );
}

export function TextResourceView({
  path,
  content,
  error,
  mediaType,
  onRetry,
}: {
  path: string;
  content?: string;
  error?: string;
  mediaType?: string;
  onRetry?: () => void;
}) {
  if (content === undefined && !error)
    return <ResourceLoading className="p-4" label={`Loading ${fileName(path)}`} />;
  if (error) return <ViewerReadError error={error} onRetry={onRetry} where={path} />;
  return <FileTextView name={fileName(path)} content={content ?? ''} mediaType={mediaType} />;
}
