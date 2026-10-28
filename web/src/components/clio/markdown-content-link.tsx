import { useContext, type ComponentProps, type ReactElement } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import type { ExtraProps } from 'streamdown';
import { ExternalLink } from '@/components/ui/external-link';
import {
  CONTENT_REFERENCE_PATH,
  isMarkdownContentReference,
  parseMarkdownContentReference,
} from '@/lib/markdown-content-reference';
import { cn } from '@/lib/utils';
import { PresentationNavigation } from './presentation-navigation';
import { ScopedDocumentNavigation, SCOPED_DOCUMENT_LINK } from './scoped-document-navigation';
import { SourceCitation } from './source-citation';
import { messageSearchHash } from '@/lib/search-matches';

type ContentLinkProps = ComponentProps<'a'> & ExtraProps & { presentation?: 'citation' | 'source' };

function decoded(uri: string): string {
  try {
    return decodeURIComponent(uri);
  } catch {
    return uri;
  }
}

/** Open explicit source citations in the same workbench as tool-result file links. */
export function MarkdownContentLink({
  href,
  className,
  children,
  node: _node,
  presentation = 'citation',
  ...props
}: ContentLinkProps) {
  const navigation = useContext(PresentationNavigation);
  const bundle = useContext(ScopedDocumentNavigation);
  const inRouter = useInRouterContext();
  const style = cn(
    presentation === 'citation' && 'wrap-anywhere font-medium text-link no-underline',
    className,
  );
  const parts = Array.isArray(children) ? children : [children];
  const text = parts.every((part) => typeof part === 'string' || typeof part === 'number')
    ? parts.join('')
    : undefined;
  const numbered = text !== undefined && /^\d+$/u.test(text);
  const label = numbered ? undefined : text;
  const linkText = numbered ? `[${text}]` : children;
  const cite = (link: ReactElement<ComponentProps<'a'>>, title: string, detail: string) =>
    presentation === 'source' ? (
      link
    ) : (
      <SourceCitation href={href ?? ''} title={title} detail={detail}>
        {link}
      </SourceCitation>
    );
  if (!href) return <a {...props}>{children}</a>;
  if (href.startsWith(SCOPED_DOCUMENT_LINK)) {
    const path = decoded(href.slice(SCOPED_DOCUMENT_LINK.length));
    return bundle?.files.includes(path) ? (
      <a
        {...props}
        className={style}
        href="#"
        target={undefined}
        onClick={(event) => {
          event.preventDefault();
          bundle.open(path);
        }}
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    );
  }
  const uri = href.startsWith(CONTENT_REFERENCE_PATH)
    ? decoded(href.slice(CONTENT_REFERENCE_PATH.length))
    : isMarkdownContentReference(href)
      ? href
      : undefined;
  if (uri === undefined) {
    if (href.startsWith('#')) {
      return (
        <a {...props} className={style} href={href} target={undefined}>
          {children}
        </a>
      );
    }
    if (/^\/workspaces\/[^/?#]+\/sessions\/[^/?#]+(?:#message-[^/?#]+)?$/u.test(href)) {
      return inRouter ? (
        cite(
          <Link {...props} className={style} to={href} target={undefined}>
            {linkText}
          </Link>,
          label ?? 'Conversation',
          href,
        )
      ) : (
        <span
          aria-disabled="true"
          className={className}
          title="Conversation navigation unavailable"
        >
          {children}
        </span>
      );
    }
    const external = (
      <ExternalLink {...props} className={style} href={href}>
        {linkText}
      </ExternalLink>
    );
    if (!/^https?:\/\//iu.test(href)) return external;
    let host: string;
    try {
      host = new URL(href).hostname;
    } catch {
      return external;
    }
    return cite(external, label ?? host, href);
  }
  const reference = parseMarkdownContentReference(uri);
  let open: (() => void) | undefined;
  let title = label ?? 'Source';
  let detail = '';
  if (
    reference?.kind === 'file' &&
    (navigation?.onOpenFileReference ||
      (!reference.workspaceId && !reference.line && !reference.find && navigation?.onOpenFile))
  ) {
    open = () =>
      navigation.onOpenFileReference
        ? navigation.onOpenFileReference(reference.path, {
            workspaceId: reference.workspaceId,
            line: reference.line,
            find: reference.find,
          })
        : navigation.onOpenFile?.(reference.path);
    title = label ?? reference.path.split(/[\\/]/u).at(-1) ?? 'Workspace file';
    detail = reference.path;
  } else if (reference?.kind === 'artifact' && navigation?.onOpenArtifact) {
    const artifacts = Object.values(navigation.artifacts);
    const exact = artifacts.find(
      (item) =>
        item.uri === reference.uri ||
        reference.uri === `artifact://${item.id}` ||
        reference.uri === `artifact:${item.id}`,
    );
    const matches = artifacts.filter((item) => decoded(item.uri) === decoded(reference.uri));
    const artifact = exact ?? (matches.length === 1 ? matches[0] : undefined);
    if (artifact) {
      open = () => navigation.onOpenArtifact?.(artifact);
      title = artifact.name;
      detail = `Saved artifact, version ${artifact.version}`;
    }
  } else if (reference?.kind === 'resource' && navigation?.onOpenResource) {
    const resource = navigation.resources?.[reference.id];
    if (resource && (!reference.workspaceId || resource.workspace_id === reference.workspaceId)) {
      open = () => navigation.onOpenResource?.(resource);
      title = resource.name;
      detail = 'Registered workspace resource';
    }
  } else if (reference?.kind === 'session' && inRouter) {
    const route =
      `/workspaces/${encodeURIComponent(reference.workspaceId)}/sessions/${encodeURIComponent(reference.sessionId)}` +
      (reference.messageId
        ? messageSearchHash(reference.messageId, reference.partId, reference.find)
        : '');
    return cite(
      <Link {...props} className={style} to={route} target={undefined}>
        {linkText}
      </Link>,
      label ?? 'Conversation',
      reference.messageId ? 'Referenced conversation message' : 'Conversation',
    );
  }
  if (!open) {
    return (
      <span
        aria-disabled="true"
        className={className}
        title="Source unavailable in this conversation"
      >
        {children}
      </span>
    );
  }
  return cite(
    <a
      {...props}
      className={style}
      href={uri}
      target={undefined}
      onClick={(event) => {
        event.preventDefault();
        open();
      }}
      title={reference?.kind === 'file' ? reference.path : undefined}
    >
      {linkText}
    </a>,
    title,
    detail,
  );
}
