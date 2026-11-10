import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type ComponentProps,
  type RefObject,
} from 'react';
import { defaultRemarkPlugins, type ExtraProps } from 'streamdown';
import { CodeBlock } from '@/components/ai-elements/code-block';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DOCUMENT_MARKDOWN_CLASS_NAME,
  READ_TYPE_SCALE,
  normalizeConvertedMarkdown,
} from '@/lib/document-markdown';
import { cn } from '@/lib/utils';
import { ContentMarkdown } from './content-markdown';
import { MarkdownContentLink } from './markdown-content-link';
import {
  WIKI_NOTE_LINK,
  remarkKnowledgeWikiLinks,
  type KnowledgeNoteRef,
} from './knowledge-note-links';

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
      <span className="text-muted-foreground" title="Not in this vault">
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

/** Wide tables scroll in place: a thin visible scrollbar and a right-edge fade while more columns follow. */
const TABLE_SCROLL =
  '[&_[data-knowledge-table-scroll]]:[scrollbar-width:thin] [&_[data-knowledge-table-scroll]]:[scrollbar-color:color-mix(in_oklch,var(--muted-foreground)_36%,transparent)_transparent] [&_[data-scroll-more]]:[mask-image:linear-gradient(to_left,transparent,#000_32px)]';
/** The spec's document table cells (`.ttab`): 10px either side, so a short table fits a phone. */
const TABLE_CELLS =
  '[&_[data-streamdown=table-cell]]:px-2.5 [&_[data-streamdown=table-header-cell]]:px-2.5';

/** Marks each table's scroller while columns remain to its right. */
function useTableScrollCue(root: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const watched = new Map<HTMLElement, () => void>();
    const update = (scroller: HTMLElement) =>
      scroller.toggleAttribute(
        'data-scroll-more',
        scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft > 1,
      );
    const resize =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver((entries) => {
            for (const entry of entries) {
              const target = entry.target as HTMLElement;
              const scroller = target.tagName === 'TABLE' ? target.parentElement : target;
              if (scroller) update(scroller);
            }
          });
    const scan = () => {
      for (const table of element.querySelectorAll('table')) {
        const scroller = table.parentElement;
        if (!scroller || watched.has(scroller)) continue;
        scroller.setAttribute('data-knowledge-table-scroll', '');
        const onScroll = () => update(scroller);
        scroller.addEventListener('scroll', onScroll, { passive: true });
        resize?.observe(scroller);
        resize?.observe(table);
        watched.set(scroller, () => scroller.removeEventListener('scroll', onScroll));
        update(scroller);
      }
    };
    scan();
    const mutations = new MutationObserver(scan);
    mutations.observe(element, { childList: true, subtree: true });
    return () => {
      mutations.disconnect();
      resize?.disconnect();
      for (const stop of watched.values()) stop();
    };
  }, [root]);
}

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
            <summary className="cursor-pointer text-muted-foreground">Document metadata</summary>
            <CodeBlock code={frontmatter[1]} language="yaml" />
          </details>
        ) : null}
        <div ref={reading} className={cn(TABLE_SCROLL, TABLE_CELLS)}>
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
