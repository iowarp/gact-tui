import { createContext, useContext, useRef, type ComponentProps } from 'react';
import { defaultRemarkPlugins, type ExtraProps } from 'streamdown';
import { CodeBlock } from '@/components/ai-elements/code-block';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DOCUMENT_MARKDOWN_CLASS_NAME,
  READ_TYPE_SCALE,
  normalizeConvertedMarkdown,
} from '@/lib/document-markdown';
import { TABLE_SCROLL_CUE_CLASS_NAME, useTableScrollCue } from '@/lib/use-table-scroll-cue';
import { cn } from '@/lib/utils';
import { ContentMarkdown } from './content-markdown';
import { MarkdownContentLink } from './markdown-content-link';
import {
  WIKI_NOTE_LINK,
  remarkKnowledgeWikiLinks,
  type KnowledgeNoteRef,
} from './knowledge-note-links';
import { t } from '@lingui/core/macro';

const KnowledgeWikiNavigation = createContext<{
  resolve: (target: string) => KnowledgeNoteRef | undefined;
  open: (path: string) => void;
} | null>(null);

function decoded(uri: string) {
  try {
    return decodeURIComponent(uri);
  } catch {
    return uri;
  }
}

function KnowledgeMarkdownLink(props: ComponentProps<'a'> & ExtraProps) {
  const wiki = useContext(KnowledgeWikiNavigation);
  const { href, children } = props;
  if (!href?.startsWith(WIKI_NOTE_LINK)) return <MarkdownContentLink {...props} />;
  const note = wiki?.resolve(decoded(href.slice(WIKI_NOTE_LINK.length)));
  if (!wiki || !note) {
    return (
      <span className="text-muted-foreground" title={t`Not in this vault`}>
        {children}
      </span>
    );
  }
  return (
    <a
      href="#"
      className="font-medium text-link no-underline hover:underline"
      title={note.path}
      onClick={(event) => {
        event.preventDefault();
        wiki.open(note.path);
      }}
    >
      {children}
    </a>
  );
}

const COMPONENTS = { a: KnowledgeMarkdownLink };
const REMARK_PLUGINS = [...Object.values(defaultRemarkPlugins), remarkKnowledgeWikiLinks];

/** The spec's document table cells (`.ttab`): 10px either side, so a short table fits a phone. */
const TABLE_CELLS =
  '[&_[data-streamdown=table-cell]]:px-2.5 [&_[data-streamdown=table-header-cell]]:px-2.5';

/**
 * A vault note rendered for reading: the file viewers' layout and type scale,
 * with wiki links that open the linked note and tables that scroll in place.
 */
export function KnowledgeNoteMarkdown({
  content,
  resolve,
  onOpen,
}: {
  content: string;
  resolve: (target: string) => KnowledgeNoteRef | undefined;
  onOpen: (path: string) => void;
}) {
  const reading = useRef<HTMLDivElement>(null);
  useTableScrollCue(reading);
  const frontmatter = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)(?:\r?\n|$)/u.exec(content);
  const body = frontmatter ? content.slice(frontmatter[0].length) : content;
  return (
    <ScrollArea
      className="h-full min-w-0"
      viewportProps={{ className: '[&>div]:!block [&>div]:min-w-0 [&>div]:w-full' }}
    >
      <article className="mx-auto w-full max-w-[80ch] min-w-0 px-5 py-4">
        {frontmatter ? (
          <details className="mb-3 text-sm">
            <summary className="cursor-pointer text-muted-foreground">{t`Document metadata`}</summary>
            <CodeBlock code={frontmatter[1]} language="yaml" />
          </details>
        ) : null}
        <div ref={reading} className={cn(TABLE_SCROLL_CUE_CLASS_NAME, TABLE_CELLS)}>
          <KnowledgeWikiNavigation.Provider value={{ resolve, open: onOpen }}>
            <ContentMarkdown
              className={cn(DOCUMENT_MARKDOWN_CLASS_NAME, READ_TYPE_SCALE)}
              components={COMPONENTS}
              remarkPlugins={REMARK_PLUGINS}
            >
              {normalizeConvertedMarkdown(body)}
            </ContentMarkdown>
          </KnowledgeWikiNavigation.Provider>
        </div>
      </article>
    </ScrollArea>
  );
}
