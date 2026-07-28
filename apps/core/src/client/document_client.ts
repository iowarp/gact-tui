import {
  closeDocumentWorkingCopy,
  createDocumentEditorSession,
  createDocumentRendition,
  createDocumentWorkingCopy,
  fetchArtifactReviews,
  fetchDocumentContent,
  fetchDocumentEditorHealth,
  fetchDocumentManifest,
  fetchDocumentWorkingCopy,
  fetchWorkspaceArtifacts,
  resolveDocumentConflict,
  submitArtifactReview,
} from './documents.js';
import type {
  ArtifactReview,
  DocumentAnchor,
  DocumentEditorSession,
  DocumentManifest,
  DocumentWorkingCopy,
} from './document_types.js';
import { WorkspaceClient } from './workspace_client.js';

export class DocumentClient extends WorkspaceClient {
  workspaceArtifacts(workspaceId: string) {
    return fetchWorkspaceArtifacts(this, workspaceId);
  }

  documentManifest(artifactId: string) {
    return fetchDocumentManifest(this, artifactId);
  }

  documentContent(artifactId: string) {
    return fetchDocumentContent(this, artifactId);
  }

  artifactReviews(artifactId: string): Promise<ArtifactReview[]> {
    return fetchArtifactReviews(this, artifactId);
  }

  submitArtifactReview(
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
    return submitArtifactReview(this, sessionId, input);
  }

  createDocumentRendition(artifactId: string, sessionId: string): Promise<DocumentManifest> {
    return createDocumentRendition(this, artifactId, sessionId);
  }

  createDocumentWorkingCopy(
    artifactId: string,
    input: {
      session_id: string;
      provider: 'native' | 'onlyoffice' | 'collabora';
      writable?: boolean;
      auto_checkpoint?: boolean;
    },
  ): Promise<DocumentWorkingCopy> {
    return createDocumentWorkingCopy(this, artifactId, input);
  }

  documentWorkingCopy(workingCopyId: string): Promise<DocumentWorkingCopy> {
    return fetchDocumentWorkingCopy(this, workingCopyId);
  }

  closeDocumentWorkingCopy(workingCopyId: string): Promise<DocumentWorkingCopy> {
    return closeDocumentWorkingCopy(this, workingCopyId);
  }

  resolveDocumentConflict(
    workingCopyId: string,
    input: {
      resolution: 'keep-current' | 'use-working-copy';
      expected_head_artifact_id: string;
    },
  ): Promise<DocumentWorkingCopy> {
    return resolveDocumentConflict(this, workingCopyId, input);
  }

  documentEditorHealth() {
    return fetchDocumentEditorHealth(this);
  }

  createDocumentEditorSession(
    workingCopyId: string,
    provider: 'onlyoffice' | 'collabora',
  ): Promise<DocumentEditorSession> {
    return createDocumentEditorSession(this, workingCopyId, provider);
  }
}
