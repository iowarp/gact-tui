/**
 * Type definitions and helpers for Preview Rail Data. Key export `PreviewRailClient`.
 */
import { createMemo, createResource, type Accessor } from 'solid-js';
import type { Client, ContextFileContent, WorkspaceFileEntry } from '@clio/core';

export type PreviewRailClient = Pick<Client, 'listWorkspaceFiles' | 'readWorkspaceFile'>;

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

  return {
    listing,
    refetchListing,
    listError: createMemo(() => listing()?.error === true),
    content,
    fileContent: createMemo(() => content()?.content ?? null),
    readError: createMemo(() => content()?.error === true),
  };
}
