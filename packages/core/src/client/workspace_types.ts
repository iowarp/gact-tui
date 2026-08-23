import type { Workspace } from '../wire/types.js';

export interface WorkspaceFilesRaw {
  entries?: Array<{ path: string; type?: string; size?: number }>;
  files?: Array<{ path: string; size?: number; language?: string; mime?: string }>;
  next_cursor?: string;
}

export interface WorkspaceFilesNormalized {
  files: Array<{
    path: string;
    size?: number;
    language?: string;
    mime?: string;
    type?: string;
  }>;
  next_cursor?: string;
}

export interface CreateWorkspaceInput {
  root_path: string;
  name?: string;
  config?: Record<string, unknown>;
}

export interface WorkspacesResult {
  workspaces: Workspace[];
}

export interface WorkspaceFilesOptions {
  cursor?: string;
  limit?: number;
}

export interface WorkspaceReadFileResult {
  path: string;
  content: string;
  mime?: string;
  size?: number;
}

export interface WorkspaceRepoMapResult {
  tree?: Record<string, unknown>;
  tokens?: number;
}

export type PatchWorkspaceInput = Partial<Pick<Workspace, 'name'>> & {
  config?: Record<string, unknown>;
};
