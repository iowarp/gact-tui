import type { KnowledgeNote } from '@clio/core/v3';
import { ArrowLeftIcon, ArrowRightIcon, UnlinkIcon } from 'lucide-react';
import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import type { useRepository } from '@/hooks/use-repository';
import { FileSourceView } from './file-source-view';
import { knowledgeNoteName, knowledgeNoteResolver } from './knowledge-note-links';
import { KnowledgeNoteMarkdown } from './knowledge-note-markdown';
import { ListGroupLabel, ListRow } from './primitives/list-row';
import { WorkspaceResourceCarousel } from './workspace-resource-view';

export type KnowledgeOpened = Awaited<
  ReturnType<ReturnType<typeof useRepository>['knowledgeOpen']>
>;

type KnowledgeLink = KnowledgeOpened['links'][number];

/** Rows shown before the list asks to show the rest. */
const LINK_ROWS = 5;

function linkStatus(link: KnowledgeLink, titles: ReadonlyMap<string, string>) {
  const kind =
    link.status === 'ambiguous'
      ? 'Ambiguous'
      : link.status === 'external'
        ? 'External'
        : 'Not found';
  const candidates = link.candidates?.map((path) => knowledgeNoteName(path, titles));
  return candidates?.length ? `${kind}: ${candidates.join(', ')}` : kind;
}

/** Note: the selected note rendered, then the links it makes and the notes that link to it. */
export function KnowledgeNoteRead({
  opened,
  workspaceId,
  onSelect,
  notes,
}: {
  opened: KnowledgeOpened;
  workspaceId: string;
  onSelect: (path: string) => void;
  /** The vault's indexed notes, so wiki links and link rows resolve to their titles. */
  notes?: readonly KnowledgeNote[];
}) {
  const path = opened.note.path;
  const title = opened.note.title;
  const headingId = useId();
  const [expandedFor, setExpandedFor] = useState('');
  const expanded = expandedFor === path;
  const titles = useMemo(
    () =>
      new Map([...(notes ?? []).map((note) => [note.path, note.title] as const), [path, title]]),
    [notes, path, title],
  );
  const resolve = useMemo(() => {
    const linked = opened.links
      .filter((link) => link.status === 'resolved')
      .map((link) => (link.source === path ? link.target : link.source))
      .filter((other) => !titles.has(other))
      .map((other) => ({ path: other, title: knowledgeNoteName(other) }));
    return knowledgeNoteResolver({ path, title }, [...(notes ?? []), ...linked]);
  }, [notes, opened.links, path, title, titles]);
  const { outgoing, incoming } = useMemo(() => {
    const seen = new Set<string>();
    const outgoing: KnowledgeLink[] = [];
    const incoming: KnowledgeLink[] = [];
    for (const link of opened.links) {
      const out = link.source === path;
      const key = `${out ? '>' : '<'}${out ? link.target : link.source}#${link.selector ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      (out ? outgoing : incoming).push(link);
    }
    return { outgoing, incoming };
  }, [opened.links, path]);
  const rows = [...outgoing, ...incoming];
  const hidden = rows.length - LINK_ROWS;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        {opened.note.kind === 'attachment' ? (
          <WorkspaceResourceCarousel
            resource={opened.resource}
            resources={[opened.resource]}
            workspaceId={workspaceId}
          />
        ) : (
          <KnowledgeNoteMarkdown content={opened.text} resolve={resolve} onOpen={onSelect} />
        )}
      </div>
      {rows.length ? (
        <section
          aria-labelledby={headingId}
          className={
            expanded
              ? 'max-h-[40%] shrink-0 overflow-y-auto border-t border-border px-1 pb-1'
              : 'shrink-0 border-t border-border px-1 pb-1'
          }
        >
          <ListGroupLabel id={headingId}>
            <span className="tabular-nums">
              Links {outgoing.length} · Backlinks {incoming.length}
            </span>
          </ListGroupLabel>
          <div role="list">
            {(expanded ? rows : rows.slice(0, LINK_ROWS)).map((link) => {
              const out = link.source === path;
              const other = out ? link.target : link.source;
              const resolved = link.status === 'resolved';
              const name = knowledgeNoteName(other, titles);
              const follow = () => onSelect(other);
              return (
                <div role="listitem" key={`${out ? '>' : '<'}${other}#${link.selector ?? ''}`}>
                  <ListRow
                    role={resolved ? 'button' : undefined}
                    tabIndex={resolved ? 0 : undefined}
                    aria-label={
                      resolved
                        ? `${out ? 'Links to' : 'Linked from'} ${name}${link.selector ? `, ${link.selector}` : ''}`
                        : undefined
                    }
                    className={resolved ? 'cursor-pointer' : undefined}
                    icon={!resolved ? <UnlinkIcon /> : out ? <ArrowRightIcon /> : <ArrowLeftIcon />}
                    title={
                      <span title={`${other}${link.selector ? `#${link.selector}` : ''}`}>
                        {name}
                      </span>
                    }
                    description={
                      resolved
                        ? (link.selector ?? (link.kind === 'embed' ? 'Embedded' : undefined))
                        : linkStatus(link, titles)
                    }
                    onClick={resolved ? follow : undefined}
                    onKeyDown={
                      resolved
                        ? (event: KeyboardEvent<HTMLDivElement>) => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            follow();
                          }
                        : undefined
                    }
                  />
                </div>
              );
            })}
          </div>
          {hidden > 0 ? (
            <button
              type="button"
              aria-expanded={expanded}
              className="h-6 rounded-[6px] px-2 text-[11.5px] text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
              onClick={() => setExpandedFor(expanded ? '' : path)}
            >
              {expanded ? 'Show fewer' : `${hidden} more`}
            </button>
          ) : null}
          {opened.relationships_truncated ? (
            <p className="px-2 py-1 text-[11.5px] text-muted-foreground">
              More links than shown. Show its linked notes from More actions.
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/** Markdown: the selected note's source, numbered lines in the shared source viewer. */
export function KnowledgeNoteSource({ opened }: { opened: KnowledgeOpened }) {
  return (
    <FileSourceView
      name={opened.note.path}
      content={opened.text}
      language="markdown"
      label={`Markdown of ${opened.note.title}`}
    />
  );
}
