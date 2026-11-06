import type { Artifact } from '@clio/core/v3';
import { textFileFormat } from '@/lib/file-presentation';

/**
 * HTML files open in the shared browser (the Browser surface) by their path, as `file://`
 * pages: their scripts, CDN libraries and WebGL run in a real Chromium with nothing
 * rewritten, and the agent sees the same page. The server allows a `file:` page only inside
 * what the conversation may read. A viewer that would have previewed the file shows its
 * source, with the control that opens it in the browser.
 */

/** Recognize HTML by its registered type or ordinary file extension. */
export function isHtmlFile(name: string, mediaType = ''): boolean {
  return textFileFormat(name, mediaType) === 'html';
}

/** What the server opens: a workspace file by path, or an artifact's file. */
export type BrowserFileTarget = { path: string } | { artifact_id: string };

/** Ask the workbench to show an open browser page (the Browser surface's tab). */
export const OPEN_BROWSER_PAGE_EVENT = 'clio:open-browser-page';

export interface OpenBrowserPageDetail {
  pageId: string;
  sessionId: string;
  label: string;
}

/** The browser target of a workbench open request for an HTML file, if it is one. */
export function htmlBrowserTarget(
  request:
    | { kind: 'workspace-file'; path: string }
    | { kind: 'artifact'; artifact: Pick<Artifact, 'id' | 'name' | 'media_type'> }
    | { kind: string },
): BrowserFileTarget | undefined {
  if (request.kind === 'workspace-file' && 'path' in request && isHtmlFile(request.path))
    return { path: request.path };
  if (request.kind === 'artifact' && 'artifact' in request) {
    const { artifact } = request;
    if (isHtmlFile(artifact.name, artifact.media_type)) return { artifact_id: artifact.id };
  }
  return undefined;
}

/** Ask the conversation to open an HTML file in its shared browser (from the workbench). */
export const OPEN_FILE_IN_BROWSER_EVENT = 'clio:open-file-in-browser';

export interface OpenFileInBrowserDetail {
  target: BrowserFileTarget;
  sessionId: string;
  label: string;
}
