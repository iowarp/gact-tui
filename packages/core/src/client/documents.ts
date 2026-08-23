import type { HttpTransport } from './transport.js';
import type {
  ArtifactList,
  ArtifactReview,
  DocumentAnchor,
  DocumentEditorHealth,
  DocumentEditorSession,
  DocumentManifest,
  DocumentWorkingCopy,
} from './document_types.js';

export function fetchWorkspaceArtifacts(
  transport: HttpTransport,
  workspaceId: string,
): Promise<ArtifactList> {
  return transport.get<ArtifactList>(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/artifacts?limit=200`,
  );
}

export function fetchDocumentManifest(
  transport: HttpTransport,
  artifactId: string,
): Promise<DocumentManifest> {
  return transport.get<DocumentManifest>(
    `/v1/artifacts/${encodeURIComponent(artifactId)}/document`,
  );
}

export async function fetchDocumentContent(
  transport: HttpTransport,
  artifactId: string,
): Promise<Blob> {
  const response = await transport.response(
    `/v1/artifacts/${encodeURIComponent(artifactId)}/document/content`,
  );
  if (!response.ok) throw new Error(await response.text());
  return await response.blob();
}

export async function fetchArtifactReviews(
  transport: HttpTransport,
  artifactId: string,
): Promise<ArtifactReview[]> {
  const result = await transport.get<{ reviews: ArtifactReview[] }>(
    `/v1/artifacts/${encodeURIComponent(artifactId)}/reviews`,
  );
  return result.reviews;
}

export function submitArtifactReview(
  transport: HttpTransport,
  sessionId: string,
  input: {
    artifact_id: string;
    expected_version: number;
    expected_sha256: string;
    anchor: DocumentAnchor;
    text: string;
    idempotency_key: string;
    allow_historical?: boolean;
  },
): Promise<ArtifactReview> {
  return transport.post<ArtifactReview>(
    `/v1/sessions/${encodeURIComponent(sessionId)}/artifact-reviews`,
    input,
  );
}

export async function createDocumentRendition(
  transport: HttpTransport,
  artifactId: string,
  sessionId: string,
): Promise<DocumentManifest> {
  const result = await transport.post<{ artifact: DocumentManifest }>(
    `/v1/artifacts/${encodeURIComponent(artifactId)}/renditions?session_id=${encodeURIComponent(sessionId)}`,
    { format: 'pdf' },
  );
  return result.artifact;
}

export function createDocumentWorkingCopy(
  transport: HttpTransport,
  artifactId: string,
  input: {
    session_id: string;
    provider: 'native' | 'onlyoffice' | 'collabora';
    writable?: boolean;
    auto_checkpoint?: boolean;
  },
): Promise<DocumentWorkingCopy> {
  return transport.post<DocumentWorkingCopy>(
    `/v1/artifacts/${encodeURIComponent(artifactId)}/working-copies`,
    input,
  );
}

export function fetchDocumentWorkingCopy(
  transport: HttpTransport,
  workingCopyId: string,
): Promise<DocumentWorkingCopy> {
  return transport.get<DocumentWorkingCopy>(
    `/v1/document-working-copies/${encodeURIComponent(workingCopyId)}`,
  );
}

export function closeDocumentWorkingCopy(
  transport: HttpTransport,
  workingCopyId: string,
): Promise<DocumentWorkingCopy> {
  return transport.del<DocumentWorkingCopy>(
    `/v1/document-working-copies/${encodeURIComponent(workingCopyId)}`,
  );
}

export function resolveDocumentConflict(
  transport: HttpTransport,
  workingCopyId: string,
  input: {
    resolution: 'keep-current' | 'use-working-copy';
    expected_head_artifact_id: string;
  },
): Promise<DocumentWorkingCopy> {
  return transport.post<DocumentWorkingCopy>(
    `/v1/document-working-copies/${encodeURIComponent(workingCopyId)}/conflict`,
    input,
  );
}

export function fetchDocumentEditorHealth(transport: HttpTransport): Promise<DocumentEditorHealth> {
  return transport.get<DocumentEditorHealth>('/v1/document-editors/health');
}

export function createDocumentEditorSession(
  transport: HttpTransport,
  workingCopyId: string,
  provider: 'onlyoffice' | 'collabora',
): Promise<DocumentEditorSession> {
  return transport.post<DocumentEditorSession>(
    `/v1/document-working-copies/${encodeURIComponent(workingCopyId)}/editor-sessions`,
    { provider },
  );
}
