import { HttpError, type HttpTransport } from './transport.js';

type ArtifactExportTransport = Pick<HttpTransport, 'response'>;

/**
 * One artifact's RO-Crate export bundle (clio-agent #973): the raw zip
 * bytes plus the filename the backend proposed via `Content-Disposition`.
 * Falls back to the backend's own naming convention
 * (`${artifactId}.crate.zip`) on the rare response that omits the header.
 */
export interface ArtifactExportResult {
  blob: Blob;
  filename: string;
}

const CONTENT_DISPOSITION_FILENAME = /filename="?([^";]+)"?/i;

/**
 * GET /v1/artifacts/{artifact_id}/export — download one artifact's lineage
 * bundle: its version chain, the producing TransformRecords, and a compiled
 * `reproduce.py`, packaged as an RO-Crate zip
 * (`clio_agent.gact.routes.artifact_export.export_artifact`). An unknown
 * `artifactId` surfaces as a real `HttpError` (backend returns a typed 404),
 * never a silently-empty download.
 */
export async function fetchArtifactExport(
  client: ArtifactExportTransport,
  artifactId: string,
): Promise<ArtifactExportResult> {
  const res = await client.response(`/v1/artifacts/${encodeURIComponent(artifactId)}/export`);
  if (!res.ok) {
    throw new HttpError(res.status, res.statusText, await res.text());
  }
  const disposition = res.headers.get('content-disposition') ?? '';
  const match = CONTENT_DISPOSITION_FILENAME.exec(disposition);
  const filename = match?.[1] ?? `${artifactId}.crate.zip`;
  const blob = await res.blob();
  return { blob, filename };
}
