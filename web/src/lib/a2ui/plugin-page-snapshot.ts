import type { A2UISurface, A2UISurfaceOwner, PluginPage } from '@clio/core/v3';

/**
 * The last view a plugin page showed, kept per service so the next open (a
 * route change, a reload, the next launch) paints it at once while the live
 * read runs. Its controls stay off until that read answers: their action
 * tokens belong to the server's earlier render.
 */
export interface StoredPluginPage {
  surfaces: A2UISurface[];
  owner?: A2UISurfaceOwner;
  contextSessionId?: string;
  /** The context's catalog and capability reads, so the stored view renders before they answer. */
  catalogs?: unknown;
  capabilities?: unknown;
  savedAt: number;
}

const PREFIX = 'clio.plugin-page.v1';
const PAGES_PREFIX = 'clio.plugin-pages.v1';
/** A page larger than this is not kept: one open view must not crowd out other storage. */
const MAX_CHARS = 1_500_000;

function storage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function pageKey(scope: string, pageId: string): string {
  return `${PREFIX}\u0000${scope}\u0000${pageId}`;
}

export function readStoredPluginPage(scope: string, pageId: string): StoredPluginPage | undefined {
  const raw = storage()?.getItem(pageKey(scope, pageId));
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as Partial<StoredPluginPage>;
    if (!Array.isArray(value.surfaces) || value.surfaces.length === 0) return undefined;
    return {
      surfaces: value.surfaces,
      owner: value.owner,
      contextSessionId:
        typeof value.contextSessionId === 'string' ? value.contextSessionId : undefined,
      catalogs: value.catalogs,
      capabilities: value.capabilities,
      savedAt: typeof value.savedAt === 'number' ? value.savedAt : 0,
    };
  } catch {
    return undefined;
  }
}

export function storePluginPage(
  scope: string,
  pageId: string,
  page: Omit<StoredPluginPage, 'savedAt'>,
): void {
  const store = storage();
  if (!store) return;
  const key = pageKey(scope, pageId);
  try {
    let raw = JSON.stringify({ ...page, savedAt: Date.now() });
    // Catalogs are the large part; the view alone still paints once they answer.
    if (raw.length > MAX_CHARS)
      raw = JSON.stringify({
        ...page,
        catalogs: undefined,
        capabilities: undefined,
        savedAt: Date.now(),
      });
    if (raw.length > MAX_CHARS) store.removeItem(key);
    else store.setItem(key, raw);
  } catch {
    // Full or unavailable storage: the next open reads the page live, as before.
  }
}

/** The left bar's plugin pages as last read, so a page route resolves before the list answers. */
export function readStoredPluginPages(scope: string): PluginPage[] | undefined {
  const raw = storage()?.getItem(`${PAGES_PREFIX}\u0000${scope}`);
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? (value as PluginPage[]) : undefined;
  } catch {
    return undefined;
  }
}

export function storePluginPages(scope: string, pages: readonly PluginPage[]): void {
  try {
    storage()?.setItem(`${PAGES_PREFIX}\u0000${scope}`, JSON.stringify(pages));
  } catch {
    // The list is read live next time.
  }
}
