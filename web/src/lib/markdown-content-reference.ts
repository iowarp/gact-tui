export const CONTENT_REFERENCE_PATH = '/__clio_content_reference__/';
import type { FileSearchLocation } from './search-matches';

export type MarkdownContentReference =
  | ({ kind: 'file'; path: string } & FileSearchLocation)
  | { kind: 'artifact'; uri: string }
  | { kind: 'resource'; id: string; workspaceId?: string }
  | {
      kind: 'session';
      workspaceId: string;
      sessionId: string;
      messageId?: string;
      partId?: string;
      find?: string;
    };

function validIdentity(value: string): boolean {
  return (
    Boolean(value) &&
    value !== '.' &&
    value !== '..' &&
    !/[\\/?#]/u.test(value) &&
    !Array.from(value).some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  );
}

/** Recognize explicit CLIO references without guessing from filenames or URLs. */
export function isMarkdownContentReference(uri: string): boolean {
  return /^(?:workspace-file|artifact|resource|session):/iu.test(uri);
}

/** Decode an explicit reference; filesystem reads retain the connected service's policy. */
export function parseMarkdownContentReference(uri: string): MarkdownContentReference | undefined {
  const separator = uri.indexOf(':');
  const scheme = uri.slice(0, separator).toLowerCase();
  const body = uri.slice(separator + 1);
  if (scheme === 'workspace-file') {
    if (!body || body.includes('#')) return undefined;
    const [target, query, extra] = body.split('?');
    if (extra !== undefined) return undefined;
    const params = new URLSearchParams(query);
    if ([...params.keys()].some((key) => !['line', 'find', 'locator'].includes(key)))
      return undefined;
    // An object inside the file (an HDF5 dataset such as /entry/data) opens the viewer there.
    const locator = params.get('locator') ?? undefined;
    const controlCharacter = (character: string) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127;
    if (
      locator !== undefined &&
      (!locator.startsWith('/') || Array.from(locator).some(controlCharacter))
    )
      return undefined;
    const line = params.has('line') ? Number(params.get('line')) : undefined;
    if (line !== undefined && (!Number.isSafeInteger(line) || line < 1)) return undefined;
    let path: string;
    let workspaceId: string | undefined;
    try {
      if (target.startsWith('//')) {
        const slash = target.indexOf('/', 2);
        if (slash < 0) return undefined;
        workspaceId = decodeURIComponent(target.slice(2, slash));
        if (!validIdentity(workspaceId)) return undefined;
        path = decodeURIComponent(target.slice(slash + 1));
      } else path = decodeURIComponent(target);
    } catch {
      return undefined;
    }
    const hasControl = Array.from(path).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    });
    if (!path.trim() || hasControl) return undefined;
    if (path.split(/[\\/]/u).some((segment) => segment === '..')) return undefined;
    return {
      kind: 'file',
      path,
      ...(workspaceId ? { workspaceId } : {}),
      ...(line ? { line } : {}),
      ...(params.has('find') ? { find: params.get('find')! } : {}),
      ...(locator ? { locator } : {}),
    };
  }
  if (scheme === 'artifact' && body && body !== '//') return { kind: 'artifact', uri };
  if (scheme === 'resource') {
    const parts = body.replace(/^\/\//u, '').split('/');
    const id = parts.at(-1);
    if (!id || !/^res_[A-Za-z0-9]+$/u.test(id) || parts.length > 2) return undefined;
    const workspaceId = parts.length === 2 ? parts[0] : undefined;
    if (workspaceId === '') return undefined;
    return { kind: 'resource', id, ...(workspaceId ? { workspaceId } : {}) };
  }
  if (scheme === 'session') {
    const [target, fragment, extra] = body.split('#');
    if (extra !== undefined || !target.startsWith('//')) return undefined;
    const parts = target.slice(2).split('/');
    if (parts.length !== 2) return undefined;
    try {
      const [workspaceId, sessionId] = parts.map(decodeURIComponent);
      const invalid = (part: string) =>
        !part ||
        part === '.' ||
        part === '..' ||
        /[\\/?#]/u.test(part) ||
        Array.from(part).some(
          (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        );
      if (invalid(workspaceId) || invalid(sessionId)) return undefined;
      if (fragment !== undefined && !fragment.startsWith('message-')) return undefined;
      const [messageTarget, query, extraQuery] = fragment?.slice(8).split('?') ?? [];
      if (extraQuery !== undefined) return undefined;
      const params = new URLSearchParams(query);
      if ([...params.keys()].some((key) => !['part', 'find'].includes(key))) return undefined;
      const partId = params.get('part') ?? undefined;
      if (partId !== undefined && invalid(partId)) return undefined;
      const messageId = messageTarget === undefined ? undefined : decodeURIComponent(messageTarget);
      if (messageId !== undefined && invalid(messageId)) return undefined;
      return {
        kind: 'session',
        workspaceId,
        sessionId,
        ...(messageId ? { messageId } : {}),
        ...(partId ? { partId } : {}),
        ...(params.has('find') ? { find: params.get('find')! } : {}),
      };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

interface MarkdownNode {
  type: string;
  url?: string;
  children?: MarkdownNode[];
}

/** A path-relative link (`notes/plan.md`, `./a.md`), which has no page to open here. */
function pathRelative(url: string): boolean {
  return !/^[a-z][a-z\d+.-]*:|^[/\\#?]/iu.test(url) || /^\.\.?\//u.test(url);
}

/**
 * Preserve supported link schemes before generic Markdown URL sanitization. A
 * path-relative link keeps its words as plain text rather than a "[blocked]" mark
 * or a link to nowhere; explicit references and bundle links are rewritten first.
 */
export function remarkContentReferences() {
  return (tree: MarkdownNode) => {
    const visit = (node: MarkdownNode) => {
      if (node.type === 'link' && node.url && isMarkdownContentReference(node.url)) {
        try {
          node.url = `${CONTENT_REFERENCE_PATH}${encodeURIComponent(node.url)}`;
        } catch {
          // Malformed Unicode from untrusted prose must not crash the transcript.
          node.url = CONTENT_REFERENCE_PATH;
        }
      }
      if (node.children?.some((child) => child.type === 'link' && pathRelative(child.url ?? '')))
        node.children = node.children.flatMap((child) =>
          child.type === 'link' && pathRelative(child.url ?? '') ? (child.children ?? []) : [child],
        );
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
