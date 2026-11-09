import { ArrowLeftIcon, ArrowRightIcon, UnlinkIcon } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import type { useRepository } from '@/hooks/use-repository';
import { FileReadView } from './file-text-view';
import { FileSourceView } from './file-source-view';
import { ListRow } from './primitives/list-row';
import { WorkspaceResourceCarousel } from './workspace-resource-view';

export type KnowledgeOpened = Awaited<
  ReturnType<ReturnType<typeof useRepository>['knowledgeOpen']>
>;

/** Note: the selected note rendered, then the links it makes and the notes that link to it. */
export function KnowledgeNoteRead({
  opened,
  workspaceId,
  onSelect,
}: {
  opened: KnowledgeOpened;
  workspaceId: string;
  onSelect: (path: string) => void;
}) {
  const path = opened.note.path;
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
          <FileReadView name={opened.note.title} content={opened.text} format="markdown" />
        )}
      </div>
      {opened.links.length ? (
        <section
          aria-label="Links"
          className="max-h-[35%] shrink-0 overflow-y-auto border-t border-border p-1"
        >
          {opened.links.map((link, index) => {
            const outgoing = link.source === path;
            const resolved = link.status === 'resolved';
            const label = outgoing
              ? `→ ${link.target}${link.selector ? `#${link.selector}` : ''}`
              : `← ${link.source}`;
            const follow = () => onSelect(outgoing ? link.target : link.source);
            return (
              <ListRow
                key={index}
                role={resolved ? 'button' : undefined}
                tabIndex={resolved ? 0 : undefined}
                aria-label={resolved ? label : undefined}
                className={resolved ? 'cursor-pointer' : undefined}
                icon={
                  !resolved ? <UnlinkIcon /> : outgoing ? <ArrowRightIcon /> : <ArrowLeftIcon />
                }
                title={
                  outgoing
                    ? `${link.target}${link.selector ? `#${link.selector}` : ''}`
                    : link.source
                }
                description={
                  resolved
                    ? link.kind === 'embed'
                      ? 'Embedded'
                      : undefined
                    : `${link.status === 'ambiguous' ? 'Ambiguous' : link.status === 'external' ? 'External' : 'Not found'}${link.candidates?.length ? `: ${link.candidates.join(', ')}` : ''}`
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
            );
          })}
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
