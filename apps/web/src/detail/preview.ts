/**
 * Fetching an artifact's content preview for the DetailSlot Overview.
 *
 * Root cause this module exists for (round-3 DOM mapping, defect 2): the S2
 * bytes route (`/v1/artifacts/{id}/bytes`) only serves CAS-custody versions.
 * A `workspace-referenced` version — which is what live minting produces
 * today — answers a TYPED 409 `custody_not_cas` whose `details.fetch_via`
 * points at the workspace file-read route (clio-agent
 * `routes/artifacts.py::get_artifact_bytes`). The old inline fetch treated
 * every non-2xx as failure and swallowed it in a bare `.catch(() => {})`, so
 * the markdown preview never rendered and nothing said why. This helper
 * follows the typed redirect, and every remaining failure is a typed error
 * the caller must surface — never a silent catch.
 */
import type { ArtifactPreview } from './types';

/** The one transport method this module needs (Client.response). */
export interface PreviewTransport {
  response(path: string, init?: RequestInit): Promise<Response>;
}

/** Typed failure: the preview could not be fetched, and this is why. */
export class PreviewUnavailableError extends Error {
  constructor(
    public readonly artifactId: string,
    public readonly reason: string,
  ) {
    super(`artifact preview unavailable (${artifactId}): ${reason}`);
    this.name = 'PreviewUnavailableError';
  }
}

/** The identity fields the preview mapping needs. */
export interface PreviewSubject {
  id: string;
  kind?: string;
  /** The artifact's display name — drives the extension fallbacks. */
  name?: string;
}

/**
 * Fetch and shape an artifact's preview: bytes route first, then the typed
 * `custody_not_cas` redirect (`details.fetch_via`) when custody is
 * workspace-referenced. Throws {@link PreviewUnavailableError} on any dead
 * end so the caller can surface the reason.
 */
export async function fetchArtifactPreview(
  client: PreviewTransport,
  subject: PreviewSubject,
): Promise<ArtifactPreview> {
  let res: Response;
  try {
    res = await client.response(`/v1/artifacts/${encodeURIComponent(subject.id)}/bytes`);
  } catch (err) {
    throw new PreviewUnavailableError(subject.id, `bytes route unreachable: ${String(err)}`);
  }
  if (!res.ok) {
    const status = res.status;
    const fetchVia = await custodyRedirect(res);
    if (!fetchVia) {
      throw new PreviewUnavailableError(subject.id, `bytes route ${status} (no fetch_via redirect)`);
    }
    try {
      res = await client.response(fetchVia);
    } catch (err) {
      throw new PreviewUnavailableError(subject.id, `fetch_via route unreachable: ${String(err)}`);
    }
    if (!res.ok) {
      throw new PreviewUnavailableError(subject.id, `fetch_via route ${res.status}`);
    }
  }
  const blob = await res.blob();
  return previewFromBlob(blob, subject);
}

/**
 * The bytes route's typed custody redirect, if this failure carries one.
 * A body that is not the typed envelope yields `null` — the caller then
 * raises the plain status as the typed reason, so nothing is swallowed.
 */
async function custodyRedirect(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as {
      error?: { error?: string; details?: { fetch_via?: string } };
    };
    const fetchVia = body.error?.details?.fetch_via;
    return typeof fetchVia === 'string' && fetchVia ? fetchVia : null;
  } catch {
    return null;
  }
}

/** Map fetched bytes onto the prototype's per-kind preview shapes. */
export async function previewFromBlob(blob: Blob, subject: PreviewSubject): Promise<ArtifactPreview> {
  const kind = subject.kind ?? '';
  const name = subject.name ?? '';
  if (kind === 'image') {
    return { kind: 'image', url: URL.createObjectURL(blob) };
  }
  const text = await blob.text();
  if (kind === 'dataset' || /\.csv$/i.test(name)) {
    const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
    const header = (lines[0] ?? '').split(',');
    const rows = lines.slice(1, 201).map((line) => line.split(','));
    return { kind: 'csv', header, rows, totalRows: lines.length - 1 };
  }
  if (kind === 'report' || /\.md$/i.test(name)) {
    return { kind: 'markdown', text: text.slice(0, 20000) };
  }
  return { kind: 'text', text: text.slice(0, 20000) };
}
