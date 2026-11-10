import { useQuery } from '@tanstack/react-query';
import { TransportError } from '@clio/core/v3';
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

/**
 * The server refuses a whole-file read past its read cap, and a suffix read of
 * such a file with it; the cap is server policy, so it is learned from the refusal.
 */
function serverCapSentence(error: Error | null, size?: number): string | undefined {
  if (!(error instanceof TransportError)) return undefined;
  if (
    error.status !== 413 &&
    error.code !== 'file_too_large' &&
    !/exceeds policy cap/iu.test(error.message)
  )
    return undefined;
  const [, reported, cap] = /\((\d+) > (\d+) bytes\)/u.exec(error.message) ?? [];
  const bytes = size ?? (reported ? Number(reported) : undefined);
  const file = bytes === undefined ? 'this file' : `this ${wholeBytes(bytes)} file`;
  return cap
    ? `The file server reads up to ${wholeBytes(Number(cap))}, so the end of ${file} can't be shown.`
    : `The file server can't read the end of ${file}.`;
}

/** "1 GB", not "1.0 GB", for a round limit in a sentence. */
function wholeBytes(bytes: number): string {
  return formatBytes(bytes).replace(/\.0 /u, ' ');
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
  // A table's end keeps the file's header and shows its last rows, not the end's first ones.
  const table = textFileFormat(path, mediaType) === 'csv';
  // The end alone reads one window: the head only when a table needs its header.
  const textWindow = useWorkspaceTextWindow(workspaceId, path, {
    tail: showEnd,
    head: !showEnd || table,
  });
  const sourceWindow = useMemo(
    () => ({ onEndReached: textWindow.loadMore }),
    [textWindow.loadMore],
  );
  const head = textWindow.head;
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
  const capRefusal = (showEnd || !head) && serverCapSentence(textWindow.tailError, size);
  if (capRefusal)
    return (
      <StateView
        action={{ label: 'Show beginning', onClick: () => setShowEnd(false) }}
        kind="too-large"
        size="viewer"
        title={capRefusal}
      />
    );
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
    <div
      className="@container/text-window flex h-full min-h-0 min-w-0 flex-col"
      data-slot="text-file-window"
    >
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
        // Narrow, the status line keeps its room; scrolling to the end still loads more.
        className="shrink-0 border-t px-3 @max-[420px]/text-window:[&_[data-slot=state-secondary-action]]:hidden"
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
