import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
import { ExternalLinkIcon, PanelRightIcon } from 'lucide-react';
import type { ExtraProps } from 'streamdown';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  CONTENT_REFERENCE_PATH,
  isMarkdownContentReference,
} from '@/lib/markdown-content-reference';
import { MarkdownContentLink } from './markdown-content-link';
import { cn } from '@/lib/utils';

type SourceLink = ReactElement<ComponentProps<typeof MarkdownContentLink>>;

function isSourceLink(child: ReactNode): child is SourceLink {
  if (!isValidElement<ComponentProps<typeof MarkdownContentLink>>(child)) return false;
  const href = child.props.href;
  return (
    child.type === MarkdownContentLink &&
    Boolean(
      href &&
        (/^https?:\/\//iu.test(href) ||
          href.startsWith(CONTENT_REFERENCE_PATH) ||
          isMarkdownContentReference(href) ||
          /^\/workspaces\/[^/?#]+\/sessions\//u.test(href)),
    )
  );
}

/** A compact, interactive source list retaining each link's existing routing. */
export function MarkdownSourceGroup({ links }: { links: SourceLink[] }) {
  const [open, setOpen] = useState(false);
  const hovered = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cancelClose = () => clearTimeout(closeTimer.current);
  const closeAfterLeave = () => {
    cancelClose();
    if (hovered.current) closeTimer.current = setTimeout(() => setOpen(false), 200);
  };
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  return (
    <span className="not-prose inline-block align-baseline" data-slot="source-group">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2 py-0.5 align-baseline text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onPointerEnter={(event) => {
              if (event.pointerType === 'touch') return;
              cancelClose();
              if (!open) hovered.current = true;
              setOpen(true);
            }}
            onPointerLeave={closeAfterLeave}
            onClick={(event) => {
              cancelClose();
              if (open && hovered.current) event.preventDefault();
              hovered.current = false;
            }}
            onKeyDown={() => {
              cancelClose();
              hovered.current = false;
            }}
          >
            Sources <span className="tabular-nums">{links.length}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          ref={contentRef}
          align="start"
          aria-label="Sources"
          className="w-80 max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-1"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            if (!hovered.current) {
              const firstLink = contentRef.current?.querySelector<HTMLAnchorElement>('a[href]');
              (firstLink ?? contentRef.current)?.focus();
            }
          }}
          onCloseAutoFocus={(event) => {
            if (hovered.current) event.preventDefault();
          }}
          onPointerEnter={cancelClose}
          onPointerLeave={closeAfterLeave}
          onFocusCapture={() => {
            cancelClose();
            hovered.current = false;
          }}
        >
          <ul className="max-h-72 overflow-y-auto overscroll-contain">
            {links.map((link, index) => {
              const href = link.props.href ?? '';
              const external = /^https?:\/\//iu.test(href);
              const Icon = external ? ExternalLinkIcon : PanelRightIcon;
              let host: string | undefined;
              if (external) {
                try {
                  host = new URL(href).hostname.replace(/^www\./u, '');
                } catch {
                  // Leave malformed destinations to the existing Markdown link handler.
                }
              }
              return (
                <li key={`${href}:${index}`}>
                  {cloneElement(link, {
                    presentation: 'source',
                    className:
                      'flex min-w-0 items-center gap-3 rounded-md px-2.5 py-2 text-sm text-foreground no-underline outline-none hover:bg-accent focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                    children: (
                      <>
                        <span className="min-w-0 flex-1">
                          <span className="block break-words font-medium">
                            {link.props.children}
                          </span>
                          {host && (
                            <span className="block truncate text-xs text-muted-foreground">
                              {host}
                            </span>
                          )}
                        </span>
                        <Icon
                          aria-hidden="true"
                          className="size-3.5 shrink-0 text-muted-foreground"
                        />
                      </>
                    ),
                  })}
                </li>
              );
            })}
          </ul>
        </PopoverContent>
      </Popover>
    </span>
  );
}

/** Collapse adjacent citations, leaving links embedded in ordinary prose alone. */
function groupSourceLinks(children: ReactNode): ReactNode {
  const parts = Children.toArray(children);
  const result: ReactNode[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const first = parts[index];
    if (!isSourceLink(first)) {
      result.push(first);
      continue;
    }
    const links = [first];
    let end = index;
    while (end + 1 < parts.length) {
      let next = end + 1;
      if (typeof parts[next] === 'string' && /^[\s·,;|]*$/u.test(parts[next] as string)) next += 1;
      if (!isSourceLink(parts[next])) break;
      links.push(parts[next] as SourceLink);
      end = next;
    }
    if (links.length === 1) result.push(first);
    else {
      result.push(<MarkdownSourceGroup key={`sources:${index}`} links={links} />);
      index = end;
    }
  }
  return result;
}

/** Apply citation grouping in paragraphs, including paragraphs inside lists. */
export function MarkdownSourceParagraph({
  children,
  node: _node,
  ...props
}: ComponentProps<'p'> & ExtraProps) {
  // Retain Streamdown's block-image/code handling when overriding its paragraph renderer.
  const parts = Children.toArray(children);
  if (
    parts.length === 1 &&
    isValidElement<{ node?: { tagName?: string }; 'data-block'?: unknown }>(parts[0])
  ) {
    const child = parts[0];
    const tagName = child.props.node?.tagName;
    if (tagName === 'img' || (tagName === 'code' && 'data-block' in child.props)) return children;
  }
  return <p {...props}>{groupSourceLinks(children)}</p>;
}

/** Tight Markdown list items omit their paragraph wrapper. */
export function MarkdownSourceListItem({
  children,
  className,
  node: _node,
  ...props
}: ComponentProps<'li'> & ExtraProps) {
  return (
    <li {...props} className={cn('py-1 [&>p]:inline', className)} data-streamdown="list-item">
      {groupSourceLinks(children)}
    </li>
  );
}
