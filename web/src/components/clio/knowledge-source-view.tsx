import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { vocab } from '@/lib/brand-vocabulary';
import { KNOWLEDGE_ATTACH_EVENT, type KnowledgeAttachRequest } from '@/lib/knowledge-navigation';
import { KnowledgeGraph } from './knowledge-graph';
import { MarkdownFilePreview } from './markdown-file-preview';
import { WorkspaceResourceCarousel } from './workspace-resource-view';

/** Graph, list and reader share source identity and selection; content is fetched on demand. */
export function KnowledgeSourceView({
  workspaceId,
  sourceId,
}: {
  workspaceId: string;
  sourceId: string;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const [view, setView] = useState<'graph' | 'list'>('graph');
  const [attachments, setAttachments] = useState(false);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query), 300);
    return () => window.clearTimeout(timer);
  }, [query]);
  const [focus, setFocus] = useState('');
  const [selected, setSelected] = useState('');
  const [offset, setOffset] = useState(0);
  const [attached, setAttached] = useState('');
  const sources = useQuery({
    queryKey: ['knowledge-source', scope, workspaceId, sourceId],
    queryFn: ({ signal }) => repository.connectedSources(workspaceId, signal),
  });
  const source = sources.data?.find((row) => row.id === sourceId);
  const snapshot = useQuery({
    queryKey: ['knowledge', scope, workspaceId, sourceId, view, search, focus, offset, attachments],
    queryFn: ({ signal }) =>
      view === 'graph'
        ? repository.knowledgeGraph(
            workspaceId,
            sourceId,
            { query: search, focus, attachments },
            signal,
          )
        : repository.knowledgeSnapshot(
            workspaceId,
            sourceId,
            { query: search, focus, offset },
            signal,
          ),
    refetchInterval: source?.connection === 'headless_sync' ? 5000 : false,
  });
  const note = useQuery({
    queryKey: ['knowledge-note', scope, workspaceId, sourceId, selected, snapshot.data?.revision],
    queryFn: ({ signal }) => repository.knowledgeOpen(workspaceId, sourceId, selected, '', signal),
    enabled: Boolean(selected) && snapshot.isSuccess,
  });
  const sync = useQuery({
    queryKey: ['knowledge-sync', scope, workspaceId, sourceId],
    queryFn: () => repository.knowledgeSync(workspaceId, sourceId),
    enabled: source?.connection === 'headless_sync',
    refetchInterval: source?.connection === 'headless_sync' ? 5000 : false,
  });
  const controlSync = useMutation({
    mutationFn: (action: 'start' | 'stop') =>
      repository.knowledgeSync(workspaceId, sourceId, action),
    onSuccess: () => {
      void sync.refetch();
    },
  });
  const select = (path: string) => {
    setSelected(path);
    setAttached('');
  };
  const error = snapshot.error || note.error || controlSync.error || sources.error;
  return (
    <div className="@container flex h-full min-h-0 flex-col" aria-label="Knowledge source">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <div role="group" aria-label="Knowledge view">
          <Button
            size="sm"
            variant={view === 'graph' ? 'secondary' : 'ghost'}
            aria-pressed={view === 'graph'}
            onClick={() => setView('graph')}
          >
            Graph
          </Button>
          <Button
            size="sm"
            variant={view === 'list' ? 'secondary' : 'ghost'}
            aria-pressed={view === 'list'}
            onClick={() => setView('list')}
          >
            Files
          </Button>
        </div>
        <Input
          aria-label="Search knowledge"
          className="min-w-36 flex-1"
          placeholder="Search notes, tags, aliases…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOffset(0);
          }}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await Promise.all([snapshot.refetch(), sources.refetch()]);
            if (selected) await note.refetch();
            if (source?.connection === 'headless_sync') await sync.refetch();
          }}
        >
          Refresh
        </Button>
        <span className="text-xs text-muted-foreground">
          {source?.link_access === 'read_only' || !source?.link_access
            ? 'Read only'
            : source.link_access === 'publish_later'
              ? 'Edits require review'
              : 'Edits update originals'}
        </span>
      </div>
      {source?.connection === 'headless_sync' && (
        <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
          <span>
            Sync: {sync.data?.state ?? 'checking'}, {sync.data?.mode ?? 'pull-only'}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={controlSync.isPending}
            onClick={() => controlSync.mutate(sync.data?.state === 'running' ? 'stop' : 'start')}
          >
            {sync.data?.state === 'running' ? 'Stop sync' : 'Start sync'}
          </Button>
          {sync.data?.error}
        </div>
      )}
      {error && (
        <p role="alert" className="p-3 text-sm text-destructive">
          {error.message}
        </p>
      )}
      {snapshot.isPending && (
        <p role="status" className="p-3 text-sm">
          Indexing vault notes…
        </p>
      )}
      {snapshot.data && (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
            <span>
              {snapshot.data.total}{' '}
              {view === 'graph' && !attachments
                ? snapshot.data.total === 1
                  ? 'note'
                  : 'notes'
                : snapshot.data.total === 1
                  ? 'item'
                  : 'items'}
            </span>
            {view === 'graph' && (
              <label className="flex cursor-pointer items-center gap-1.5">
                <Checkbox
                  checked={attachments}
                  onCheckedChange={(value) => setAttachments(value === true)}
                />
                Attachments
              </label>
            )}
            {snapshot.data.relationships_truncated && (
              <span>Relationship limit reached; explore a note neighborhood.</span>
            )}
            {snapshot.data.truncated && (
              <span>
                Showing{' '}
                {view === 'graph'
                  ? snapshot.data.notes.length
                  : `${offset + 1}–${offset + snapshot.data.notes.length}`}
                . Search, select a folder, or explore a note's links to narrow this view.
              </span>
            )}
            {focus && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFocus('');
                  setQuery('');
                  setOffset(0);
                }}
              >
                All notes
              </Button>
            )}
            {view === 'list' && (offset > 0 || snapshot.data.next_offset != null) && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!offset}
                  onClick={() => setOffset(Math.max(0, offset - 200))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={snapshot.data.next_offset == null}
                  onClick={() => setOffset(snapshot.data!.next_offset!)}
                >
                  Next
                </Button>
              </>
            )}
          </div>
          {(snapshot.data.warnings?.length ?? 0) > 0 && (
            <details className="px-3 text-xs">
              <summary>{snapshot.data.warnings!.length} indexing warnings</summary>
              {snapshot.data.warnings!.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </details>
          )}
          <div
            className={`grid min-h-0 flex-1 grid-cols-1 overflow-auto ${selected ? '@3xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.8fr)]' : ''}`}
          >
            <div className={`min-h-80 min-w-0 ${selected ? 'border-r' : ''}`}>
              {snapshot.data.total === 0 && !search && !focus ? (
                <div role="status" className="grid gap-2 p-6 text-sm">
                  <h3 className="font-medium">Your vault is ready</h3>
                  <p className="text-muted-foreground">There are no notes yet.</p>
                  <p className="max-w-xl leading-6 text-muted-foreground">
                    {source?.capabilities?.note_write && source.link_access !== 'read_only'
                      ? `Ask ${vocab.agent} to create notes in this vault, or add Markdown files to the folder and choose Refresh.`
                      : 'Add Markdown files to the folder and choose Refresh. This connection is read only.'}
                  </p>
                </div>
              ) : view === 'graph' ? (
                <KnowledgeGraph snapshot={snapshot.data} selected={selected} onSelect={select} />
              ) : (
                <ul aria-label="Vault files" className="h-full overflow-auto p-2">
                  {snapshot.data.notes.map((item) => (
                    <li key={item.path}>
                      <Button
                        aria-label={`Open ${item.path}`}
                        aria-pressed={selected === item.path}
                        variant={selected === item.path ? 'secondary' : 'ghost'}
                        className="h-auto w-full justify-start whitespace-normal text-left"
                        onClick={() => select(item.path)}
                      >
                        <span>
                          <span className="block">{item.title}</span>
                          <span className="block break-all text-xs font-normal text-muted-foreground">
                            {item.path}
                          </span>
                        </span>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {selected && (
              <div
                className="flex min-h-80 min-w-0 flex-col overflow-auto p-3"
                aria-label="Knowledge reader"
              >
                {!selected && (
                  <p className="m-auto text-sm text-muted-foreground">
                    Select a note to read it and follow its links.
                  </p>
                )}
                {note.isFetching && selected && <p role="status">Opening note…</p>}
                {note.data && (
                  <>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setFocus(selected);
                          setView('graph');
                          setQuery('');
                          setOffset(0);
                        }}
                      >
                        Explore links
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          window.dispatchEvent(
                            new CustomEvent<KnowledgeAttachRequest>(KNOWLEDGE_ATTACH_EVENT, {
                              detail: { scope, workspaceId, resource: note.data.resource },
                            }),
                          );
                          setAttached(selected);
                        }}
                      >
                        {attached === selected ? 'Added to chat' : 'Attach note'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="ml-auto"
                        onClick={() => select('')}
                      >
                        Close note
                      </Button>
                    </div>
                    <p className="mb-2 break-all text-xs text-muted-foreground">
                      {note.data.note.path}, captured revision{' '}
                      {note.data.note.revision.slice(0, 12)}
                    </p>
                    <div className="min-h-64 flex-1">
                      {note.data.note.kind === 'attachment' ? (
                        <WorkspaceResourceCarousel
                          resource={note.data.resource}
                          resources={[note.data.resource]}
                          workspaceId={workspaceId}
                        />
                      ) : (
                        <MarkdownFilePreview name={note.data.note.title} content={note.data.text} />
                      )}
                    </div>
                    <details className="mt-3 text-sm" open>
                      <summary>Links and backlinks</summary>
                      {note.data.relationships_truncated && (
                        <p>More relationships are available. Use Explore links and pagination.</p>
                      )}
                      <ul>
                        {note.data.links.map((link, index) => (
                          <li key={index} className="py-1">
                            {link.status === 'resolved' ? (
                              <Button
                                variant="link"
                                size="sm"
                                className="h-auto max-w-full whitespace-normal break-all text-left"
                                onClick={() =>
                                  select(link.source === selected ? link.target : link.source)
                                }
                              >
                                {link.source === selected
                                  ? `→ ${link.target}${link.selector ? `#${link.selector}` : ''}`
                                  : `← ${link.source}`}
                                {link.kind === 'embed' ? ' (embed)' : ''}
                              </Button>
                            ) : (
                              <span className="break-all text-muted-foreground">
                                {link.target} ({link.status})
                                {link.candidates?.length ? `: ${link.candidates.join(', ')}` : ''}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
