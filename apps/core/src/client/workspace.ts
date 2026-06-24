import type { Workspace } from '../wire/types.js';
import type { HttpTransport } from './transport.js';
import type {
  CreateWorkspaceInput,
  PatchWorkspaceInput,
  WorkspaceFilesNormalized,
  WorkspaceFilesOptions,
  WorkspaceFilesRaw,
  WorkspaceReadFileResult,
  WorkspaceRepoMapResult,
  WorkspacesResult,
} from './workspace_types.js';

export * from './workspace_types.js';

type WorkspaceTransport = Pick<HttpTransport, 'get' | 'post' | 'del' | 'request'>;

export function normalizeWorkspaceFiles(raw: WorkspaceFilesRaw): WorkspaceFilesNormalized {
  // clio returns `{entries: [{path,type,size,modified}]}`; older/other
  // backends may return `{files: [...]}`. Normalize to `{files}` so the
  // @-mention picker works either way.
  const src = raw.files ?? raw.entries ?? [];
  return {
    files: src.map((e) => ({
      path: e.path,
      ...(typeof e.size === 'number' ? { size: e.size } : {}),
      ...('language' in e && e.language ? { language: e.language } : {}),
      ...('type' in e && e.type ? { type: e.type } : {}),
    })),
    next_cursor: raw.next_cursor,
  };
}

export function createWorkspacePayload(body: CreateWorkspaceInput): Record<string, unknown> {
  // Wire: clio's CreateWorkspaceRequest is { name, root_path,
  // storage_root, metadata }. Map desktop's `config` to `metadata`,
  // synth a default name if the caller omitted one.
  const { name, root_path, config } = body;
  const fallbackName =
    name ?? root_path.split(/[\\/]/).filter(Boolean).pop() ?? 'workspace';
  const payload: Record<string, unknown> = {
    name: fallbackName,
    root_path,
  };
  if (config) payload['metadata'] = config;
  return payload;
}

export function fetchWorkspaces(client: WorkspaceTransport): Promise<WorkspacesResult> {
  return client.get<WorkspacesResult>('/v1/workspaces');
}

export async function fetchWorkspaceFiles(
  client: WorkspaceTransport,
  workspaceId: string,
  options: WorkspaceFilesOptions = {},
): Promise<WorkspaceFilesNormalized> {
  const qs = new URLSearchParams();
  if (options.cursor) qs.set('cursor', options.cursor);
  if (options.limit) qs.set('limit', String(options.limit));
  const suffix = qs.toString() ? `?${qs}` : '';
  const raw = await client.get<WorkspaceFilesRaw>(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/files${suffix}`,
  );
  return normalizeWorkspaceFiles(raw);
}

export function readWorkspaceTextFile(
  client: WorkspaceTransport,
  workspaceId: string,
  path: string,
): Promise<WorkspaceReadFileResult> {
  const qs = new URLSearchParams({ path }).toString();
  return client.get(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/files/read?${qs}`,
  );
}

export function fetchWorkspaceRepoMap(
  client: WorkspaceTransport,
  workspaceId: string,
): Promise<WorkspaceRepoMapResult> {
  return client.get(`/v1/workspaces/${encodeURIComponent(workspaceId)}/repo_map`);
}

export function registerWorkspace(
  client: WorkspaceTransport,
  body: CreateWorkspaceInput,
): Promise<Workspace> {
  return client.post<Workspace>('/v1/workspaces', createWorkspacePayload(body));
}

export function removeWorkspace(
  client: WorkspaceTransport,
  workspaceId: string,
): Promise<void> {
  return client.del(`/v1/workspaces/${encodeURIComponent(workspaceId)}`);
}

export function updateWorkspace(
  client: WorkspaceTransport,
  workspaceId: string,
  patch: PatchWorkspaceInput,
): Promise<Workspace> {
  return client.request<Workspace>(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}`,
    'PATCH',
    patch,
  );
}
