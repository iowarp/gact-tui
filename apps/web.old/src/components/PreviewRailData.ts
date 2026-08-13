/**
 * Type definitions and helpers for Preview Rail Data. Key export `PreviewRailClient`.
 */
import { createMemo, createResource, type Accessor } from 'solid-js';
import type { ArtifactList, Client, ContextFileContent, WorkspaceFileEntry } from '@clio/core';

type DocumentPreviewMethods = Pick<
  Client,
  | 'workspaceArtifacts'
  | 'documentManifest'
  | 'documentContent'
  | 'artifactReviews'
  | 'submitArtifactReview'
  | 'createDocumentRendition'
  | 'createDocumentWorkingCopy'
  | 'createDocumentEditorSession'
>;

export type PreviewRailClient = Pick<Client, 'listWorkspaceFiles' | 'readWorkspaceFile'> &
  Partial<DocumentPreviewMethods>;

interface PreviewRailResourcesOptions {
  workspaceId: Accessor<string | undefined>;
  selected: Accessor<string>;
  client: PreviewRailClient;
}

export interface WorkspaceListingResult {
  entries: WorkspaceFileEntry[];
  error?: true;
}

export interface WorkspaceFileReadResult {
  content?: ContextFileContent;
  error?: true;
}

export interface WorkspaceArtifactsResult {
  artifacts: ArtifactList['artifacts'];
  error?: true;
}

export function createPreviewRailResources(options: PreviewRailResourcesOptions) {
  const [listing, { refetch: refetchListing }] = createResource(
    options.workspaceId,
    async (wid): Promise<WorkspaceListingResult> => {
      try {
        const res = await options.client.listWorkspaceFiles(wid);
        return { entries: res.entries };
      } catch {
        return { entries: [], error: true };
      }
    },
  );

  const [content] = createResource(
    () => {
      const wid = options.workspaceId();
      const path = options.selected();
      if (!wid || !path) return null;
      return { wid, path };
    },
    async (key): Promise<WorkspaceFileReadResult | null> => {
      if (!key) return null;
      try {
        return { content: await options.client.readWorkspaceFile(key.wid, key.path) };
      } catch {
        return { error: true };
      }
    },
  );

  const [artifacts, { refetch: refetchArtifacts }] = createResource(
    options.workspaceId,
    async (wid): Promise<WorkspaceArtifactsResult> => {
      if (!options.client.workspaceArtifacts) return { artifacts: [] };
      try {
        const result = await options.client.workspaceArtifacts(wid);
        return { artifacts: result.artifacts };
      } catch {
        return { artifacts: [], error: true };
      }
    },
  );

  return {
    listing,
    refetchListing,
    listError: createMemo(() => listing()?.error === true),
    content,
    fileContent: createMemo(() => content()?.content ?? null),
    readError: createMemo(() => content()?.error === true),
    artifacts,
    refetchArtifacts,
  };
}
