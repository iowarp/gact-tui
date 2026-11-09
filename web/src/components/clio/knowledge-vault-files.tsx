import { useQuery } from '@tanstack/react-query';
import { ChevronLeftIcon, ChevronRightIcon, FileTextIcon, PaperclipIcon } from 'lucide-react';
import { useMemo, useState, type KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { useRepository } from '@/hooks/use-repository';
import { knowledgeDegrees, knowledgeLinkCount } from './knowledge-vault-stats';
import { IconButton } from './primitives/icon-button';
import { ListRow } from './primitives/list-row';
import { StateView } from './primitives/state-view';
import { MetaValue } from './primitives/tag';

const PAGE = 200;

/**
 * The vault's files beside the tabs: a search shared with the note graph and
 * one row per note with its link count. Pages of 200 keep large vaults bounded.
 */
export function KnowledgeVaultFiles({
  queryKey,
  workspaceId,
  sourceId,
  query,
  onQuery,
  search,
  focus,
  selected,
  onPick,
  refetchInterval,
}: {
  /** The vault's query key prefix, so Refresh reaches this page too. */
  queryKey: readonly unknown[];
  workspaceId: string;
  sourceId: string;
  query: string;
  onQuery: (query: string) => void;
  /** The settled search the page is fetched for. */
  search: string;
  focus: string;
  selected: string;
  onPick: (path: string) => void;
  refetchInterval: number | false;
}) {
  const repository = useRepository();
  const pageKey = `${search}\n${focus}`;
  const [page, setPage] = useState({ key: pageKey, offset: 0 });
  const offset = page.key === pageKey ? page.offset : 0;
  const snapshot = useQuery({
    queryKey: [...queryKey, 'files', search, focus, offset],
    queryFn: ({ signal }) =>
      repository.knowledgeSnapshot(workspaceId, sourceId, { query: search, focus, offset }, signal),
    refetchInterval,
  });
  const { degrees } = useMemo(
    () => knowledgeDegrees(snapshot.data ?? { links: [] }),
    [snapshot.data],
  );
  const data = snapshot.data;
  const paged = Boolean(data && (offset > 0 || data.next_offset != null));
  return (
    <div className="flex h-full min-h-0 flex-col" data-slot="knowledge-vault-files">
      <div className="flex h-9 shrink-0 items-center border-b border-border px-1.5">
        <Input
          aria-label="Search notes"
          className="h-7 text-xs"
          placeholder="Search notes"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {snapshot.isPending ? (
          <StateView kind="loading" size="row" title="Listing notes" />
        ) : snapshot.error ? (
          <StateView
            kind="error"
            size="row"
            title="The notes could not be listed"
            detail={snapshot.error.message}
            action={{ label: 'Retry', onClick: () => void snapshot.refetch() }}
          />
        ) : !data?.notes.length ? (
          <StateView kind="empty" size="row" title={search ? 'No notes match' : 'No notes yet'} />
        ) : (
          <div role="list" aria-label="Vault files">
            {data.notes.map((note) => {
              const count = degrees.get(note.path) ?? 0;
              const folder = note.path.includes('/')
                ? note.path.slice(0, note.path.lastIndexOf('/'))
                : undefined;
              const open = () => onPick(note.path);
              return (
                <div role="listitem" key={note.path}>
                  <ListRow
                    role="button"
                    tabIndex={0}
                    aria-pressed={selected === note.path}
                    aria-label={`${note.title}, ${knowledgeLinkCount(count)}`}
                    selected={selected === note.path}
                    className="cursor-pointer"
                    icon={note.kind === 'attachment' ? <PaperclipIcon /> : <FileTextIcon />}
                    title={note.title}
                    description={folder}
                    meta={<MetaValue>{count}</MetaValue>}
                    onClick={open}
                    onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      open();
                    }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
      {data && paged ? (
        <div className="flex h-8 shrink-0 items-center gap-1 border-t border-border px-2 text-[11.5px] text-muted-foreground">
          <span className="min-w-0 flex-1 truncate tabular-nums">
            {offset + 1}–{offset + data.notes.length} of {data.total}
          </span>
          <IconButton
            size="sm"
            label="Previous notes"
            icon={<ChevronLeftIcon aria-hidden="true" />}
            disabledReason={offset ? undefined : 'At the first notes'}
            onClick={() => offset && setPage({ key: pageKey, offset: Math.max(0, offset - PAGE) })}
          />
          <IconButton
            size="sm"
            label="Next notes"
            icon={<ChevronRightIcon aria-hidden="true" />}
            disabledReason={data.next_offset == null ? 'At the last notes' : undefined}
            onClick={() =>
              data.next_offset != null && setPage({ key: pageKey, offset: data.next_offset })
            }
          />
        </div>
      ) : null}
    </div>
  );
}
