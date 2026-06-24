import type { Workspace } from '../wire/types.js';
import type { ReadWorkspaceFileResult, WorkspaceFileListResult } from './context.js';
import { fetchWorkspaceFileList, readWorkspaceBinaryFile } from './context.js';
import { SettingsClient } from './settings_client.js';
import {
  fetchWorkspaceFiles,
  fetchWorkspaceRepoMap,
  fetchWorkspaces,
  readWorkspaceTextFile,
  registerWorkspace,
  removeWorkspace,
  updateWorkspace,
} from './workspace.js';
import type {
  CreateWorkspaceInput,
  PatchWorkspaceInput,
  WorkspaceFilesNormalized,
  WorkspaceFilesOptions,
  WorkspaceReadFileResult,
  WorkspaceRepoMapResult,
  WorkspacesResult,
} from './workspace_types.js';

export class WorkspaceClient extends SettingsClient {
  /* -------- Discovery endpoints (Wave 0.9.1: LeftRail backing) -------- */

  workspaces(): Promise<WorkspacesResult> {
    return fetchWorkspaces(this);
  }

  /**
   * GET /v1/workspaces/{id}/files — list the file tree (paginated by
   * cursor). Used to back the composer `@`-mention picker.
   */
  workspaceFiles(
    workspaceId: string,
    options: WorkspaceFilesOptions = {},
  ): Promise<WorkspaceFilesNormalized> {
    return fetchWorkspaceFiles(this, workspaceId, options);
  }

  /**
   * GET /v1/workspaces/{id}/files/read?path=… — read a single file's
   * text content. Used to preview an `@`-mention before sending.
   */
  workspaceReadFile(workspaceId: string, path: string): Promise<WorkspaceReadFileResult> {
    return readWorkspaceTextFile(this, workspaceId, path);
  }

  /**
   * GET /v1/workspaces/{id}/repo_map — indexed tree + per-file token
   * estimates. Useful for an "overview" panel.
   */
  workspaceRepoMap(workspaceId: string): Promise<WorkspaceRepoMapResult> {
    return fetchWorkspaceRepoMap(this, workspaceId);
  }

  /**
   * POST /v1/workspaces — register a new workspace root.
   * Per SPEC §6.1 only `root_path` is required; the backend chooses
   * an `id` and creates the on-disk metadata directory.
   */
  createWorkspace(body: CreateWorkspaceInput): Promise<Workspace> {
    return registerWorkspace(this, body);
  }

  /** DELETE /v1/workspaces/{id} — unregister a workspace from the
   * backend. Backend keeps on-disk files; only metadata is dropped. */
  deleteWorkspace(workspaceId: string): Promise<void> {
    return removeWorkspace(this, workspaceId);
  }

  /** PATCH /v1/workspaces/{id} — partial update (rename, config). */
  patchWorkspace(workspaceId: string, patch: PatchWorkspaceInput): Promise<Workspace> {
    return updateWorkspace(this, workspaceId, patch);
  }

  /**
   * GET /v1/workspaces/{wid}/files — list the workspace file tree (flat
   * entries with path/type/size/modified). Backs the file browser and the
   * preview rail. Replaces the removed session-scoped context-file content
   * endpoint with a broader, workspace-scoped surface.
   */
  listWorkspaceFiles(workspaceId: string): Promise<WorkspaceFileListResult> {
    return fetchWorkspaceFileList(this, workspaceId);
  }

  /**
   * GET /v1/workspaces/{wid}/files/read?path=… — read one workspace file's
   * raw bytes. The endpoint returns the bytes directly with a real
   * Content-Type (not a base64 JSON envelope), so we normalize here to the
   * `ContextFileContent` shape (base64 `data` + `media_type`) that the
   * preview renderers expect — one shape for both text and image previews.
   *
   * This replaces the removed `getContextFileContent` (the
   * `/v1/sessions/{id}/context/files/content` route + `x_clio_files_content`
   * flag were dropped on clio develop ~2026-06). Workspace-scoped, so it can
   * preview ANY workspace file, not just registered context files.
   */
  async readWorkspaceFile(workspaceId: string, path: string): Promise<ReadWorkspaceFileResult> {
    return readWorkspaceBinaryFile(this, workspaceId, path);
  }
}
