export interface Workspace {
  id: string;
  name: string;
  root_path: string;
}

/** Normalized file bytes for previews. Historically the response of the
 * removed `GET /v1/sessions/{id}/context/files/content`; now produced
 * client-side by `Client.readWorkspaceFile` from the raw bytes of
 * `GET /v1/workspaces/{wid}/files/read` (base64-encoded here so image and
 * text previews share one shape). */
export interface ContextFileContent {
  path: string;
  display_path?: string;
  size: number;
  media_type: string;
  source_media_type?: string;
  encoding: 'base64';
  data: string;
}

/** One entry from `GET /v1/workspaces/{wid}/files` (workspace file tree).
 * Backs the file browser + the side-by-side preview rail. */
export interface WorkspaceFileEntry {
  path: string;
  type: 'file' | 'dir';
  size?: number;
  modified?: string;
}
