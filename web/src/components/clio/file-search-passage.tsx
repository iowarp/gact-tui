import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { searchMatchRanges, type FileSearchLocation } from '@/lib/search-matches';
import { SearchHighlight } from './search-highlight';
import { ResourceLoading, ResourceUnavailable } from './resource-states';

/** Exact source text and line landmarks for a file citation's search destination. */
export function FileSearchPassage({
  workspaceId,
  path,
  location,
}: {
  workspaceId: string;
  path: string;
  location: FileSearchLocation;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const host = useRef<HTMLDivElement>(null);
  const content = useQuery({
    queryKey: ['file-search-passage', connectionScope(settings), workspaceId, path, location.line],
    queryFn: ({ signal }) =>
      repository.searchFilePassage(workspaceId, path, location.line ?? 1, signal),
  });
  useEffect(() => {
    const line = location.line ?? 1;
    host.current
      ?.querySelector(`[data-source-line="${line}"]`)
      ?.scrollIntoView({ block: 'center' });
  }, [content.data, location.line, location.find]);
  if (content.isPending) return <ResourceLoading label="Loading matching source" />;
  if (content.error)
    return <ResourceUnavailable label="Source unavailable" detail={content.error.message} />;
  const text = content.data?.text ?? '';
  const firstLine = content.data?.start_line ?? 1;
  const ranges = searchMatchRanges(text, location.find ?? '', false);
  const lines = text.split('\n');
  const offsets: number[] = [];
  let sourceOffset = 0;
  for (const line of lines) {
    offsets.push(sourceOffset);
    sourceOffset += line.length + 1;
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <p className="shrink-0 border-b px-3 py-2 text-xs text-muted-foreground">
        Source text at line {location.line ?? 1}
        {location.find ? ` matching “${location.find}”` : ''}
        {content.data?.truncated
          ? ' — bounded excerpt; open the file normally for the complete preview.'
          : ''}
      </p>
      <div
        ref={host}
        className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs leading-6"
        aria-label="Matching file passage"
      >
        {lines.map((line, index) => (
          <div
            key={index}
            data-source-line={index + firstLine}
            className={`flex min-w-max ${index + firstLine === location.line ? 'bg-highlight/35' : ''}`}
          >
            <span
              aria-hidden="true"
              className="sticky left-0 mr-4 w-10 shrink-0 bg-background text-right text-muted-foreground"
            >
              {index + firstLine}
            </span>
            <span className="whitespace-pre">
              <SearchHighlight
                text={line}
                query={location.find ?? ''}
                ranges={ranges
                  .filter(([lo, hi]) => lo < offsets[index] + line.length && hi > offsets[index])
                  .map(([lo, hi]) => [
                    Math.max(0, lo - offsets[index]),
                    Math.min(line.length, hi - offsets[index]),
                  ])}
              />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
