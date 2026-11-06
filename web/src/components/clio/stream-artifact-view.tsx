import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Artifact, StreamEntry } from '@clio/core/v3';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { describeStream, streamRowsQueryPrefix, useStreamLease } from './table-query-rows';

/** The most entries the panel reads at once (a stream's window is at most 1,000). */
const STREAM_PANEL_ENTRIES = 200;

/** The columns of a set of record entries, in the order they first appear. */
function recordColumns(records: readonly Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  for (const record of records) for (const key of Object.keys(record)) seen.add(key);
  return [...seen];
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function EntryLine({ entry }: { entry: StreamEntry }) {
  if (entry.text !== undefined) return <span className="whitespace-pre-wrap">{entry.text}</span>;
  if (entry.value !== undefined) return <span>{cellText(entry.value)}</span>;
  return (
    <span className="text-muted-foreground">
      {entry.size_bytes.toLocaleString()} bytes, {entry.media_type}
    </span>
  );
}

/**
 * A stream artifact in the side panel: its newest entries, read from clio-core, live while
 * the stream is open (the panel holds a watch lease, so each write refreshes it) and shown
 * as closed once it is. Records are a table, text and other entries a list, newest last.
 */
export function StreamArtifactView({
  artifact,
  sessionId,
}: {
  artifact: Artifact;
  sessionId: string | undefined;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const streamId = String(artifact.producer?.['stream_id'] ?? '');
  useStreamLease(streamId || undefined, sessionId);
  const content = useQuery({
    enabled: Boolean(streamId),
    queryKey: streamRowsQueryPrefix(settings.endpoint, streamId),
    queryFn: ({ signal }) =>
      repository.streamContent(
        `/v1/streams/${encodeURIComponent(streamId)}/content?limit=${STREAM_PANEL_ENTRIES}`,
        signal,
      ),
    placeholderData: (previous) => previous,
    staleTime: 0,
  });
  const entries = useMemo(() => content.data?.entries ?? [], [content.data]);
  const records = useMemo(
    () => entries.filter((entry) => isRecord(entry.value)).map((entry) => entry.value as Record<string, unknown>),
    [entries],
  );
  const columns = useMemo(() => recordColumns(records), [records]);
  const stream = content.data?.stream;
  if (!streamId) return <p className="p-4 text-sm text-muted-foreground">This stream has no address.</p>;
  if (content.isError)
    return (
      <p role="alert" className="p-4 text-sm text-destructive">
        The stream could not be read: {content.error instanceof Error ? content.error.message : ''}
      </p>
    );
  return (
    <section aria-label={`Stream ${artifact.name}`} className="flex min-h-0 flex-col gap-3 p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">{artifact.name}</h2>
        <p data-slot="stream-state" className="text-xs text-muted-foreground">
          {content.isPending ? 'Reading the stream…' : describeStream(stream)}
          {stream ? ` ${stream.writes.toLocaleString()} writes; keeps the newest ${stream.window.toLocaleString()}.` : ''}
        </p>
      </header>
      {!content.isPending && entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No entries yet.</p>
      ) : records.length === entries.length && records.length > 0 ? (
        <div className="min-h-0 overflow-auto rounded-md border">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-muted">
              <tr>
                {columns.map((column) => (
                  <th key={column} scope="col" className="px-2 py-1 font-medium">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((record, index) => (
                <tr key={entries[index]!.seq} className="border-t">
                  {columns.map((column) => (
                    <td key={column} className="px-2 py-1 tabular-nums">
                      {cellText(record[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ol className="min-h-0 overflow-auto rounded-md border font-mono text-xs">
          {entries.map((entry) => (
            <li key={entry.seq} className="flex gap-3 border-t px-2 py-1 first:border-t-0">
              <span className="text-muted-foreground tabular-nums">
                {new Date(entry.at).toLocaleTimeString()}
              </span>
              <EntryLine entry={entry} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
