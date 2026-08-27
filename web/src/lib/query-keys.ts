type QueryKeyPart = string | number | boolean | null | undefined;

export type ClioQueryNamespace =
  | 'agent-blueprint-sources'
  | 'agent-blueprints'
  | 'agents'
  | 'all-sessions'
  | 'artifact-attachment-image'
  | 'artifact-card-image'
  | 'artifact-card-text'
  | 'artifact-detail'
  | 'artifact-image'
  | 'artifact-lineage'
  | 'artifact-reviews'
  | 'artifact-table-preview'
  | 'artifact-text'
  | 'blueprint-files'
  | 'capabilities'
  | 'commands'
  | 'document-content'
  | 'document-editor-health'
  | 'document-manifest'
  | 'expert-pack'
  | 'expert-packs'
  | 'hook-inspection'
  | 'language-model-configuration'
  | 'mcp-server'
  | 'mcp-server-inventory'
  | 'mcp-servers'
  | 'memory-events'
  | 'memory-search'
  | 'memory-statistics'
  | 'pending-approvals'
  | 'pending-questions'
  | 'permissions'
  | 'permission-policies'
  | 'prompt'
  | 'prompts'
  | 'provider-models'
  | 'providers'
  | 'relay-status'
  | 'runs'
  | 'runtime-metrics'
  | 'service-health'
  | 'session-artifacts'
  | 'session-context'
  | 'session-defaults'
  | 'session-diffs'
  | 'session-observability'
  | 'sessions'
  | 'tools'
  | 'transcript'
  | 'workspace-file'
  | 'workspace-file-bytes'
  | 'workspace-files'
  | 'workspace-memory-search'
  | 'workspaces';

/** Canonical TanStack Query keys shared by reads, mutations, and live invalidation. */
export const queryKeys = {
  key: <const Parts extends readonly QueryKeyPart[]>(
    namespace: ClioQueryNamespace,
    ...parts: Parts
  ) => [namespace, ...parts] as const,
  agentBlueprints: (endpoint: string, scope?: string) =>
    scope
      ? (['agent-blueprints', endpoint, scope] as const)
      : (['agent-blueprints', endpoint] as const),
  capabilities: (endpoint: string) => ['capabilities', endpoint] as const,
  languageModelConfiguration: (endpoint: string) =>
    ['language-model-configuration', endpoint] as const,
  pendingApprovals: (endpoint: string, scope?: string) =>
    scope
      ? (['pending-approvals', endpoint, scope] as const)
      : (['pending-approvals', endpoint] as const),
  pendingQuestions: (endpoint: string, sessionId: string) =>
    ['pending-questions', endpoint, sessionId] as const,
  providerModels: (endpoint: string, providerId?: string) =>
    providerId
      ? (['provider-models', endpoint, providerId] as const)
      : (['provider-models', endpoint] as const),
  runs: (endpoint: string) => ['runs', endpoint] as const,
  sessionArtifacts: (endpoint: string, sessionId: string) =>
    ['session-artifacts', endpoint, sessionId] as const,
  sessionContext: (endpoint: string, sessionId: string) =>
    ['session-context', endpoint, sessionId] as const,
  sessionContextState: (endpoint: string, sessionId: string, scope: string) =>
    [...queryKeys.sessionContext(endpoint, sessionId), 'state', scope] as const,
  sessionObservability: (endpoint: string, sessionId: string) =>
    ['session-observability', endpoint, sessionId] as const,
  sessionObservabilityDetail: (
    endpoint: string,
    sessionId: string,
    detail: 'agent-iterations' | 'context-files' | 'context-frames' | 'diffs' | 'processes',
  ) => [...queryKeys.sessionObservability(endpoint, sessionId), detail] as const,
  sessions: (endpoint: string, scope: string) => ['sessions', endpoint, scope] as const,
  transcript: (endpoint: string, sessionId: string, view?: string) =>
    view
      ? (['transcript', endpoint, sessionId, view] as const)
      : (['transcript', endpoint, sessionId] as const),
  workspaceFile: (workspaceId: string, path: string) =>
    ['workspace-file', workspaceId, path] as const,
  workspaceFileBytes: (workspaceId: string, path: string) =>
    ['workspace-file-bytes', workspaceId, path] as const,
  workspaceFiles: (endpoint: string, workspaceId: string) =>
    ['workspace-files', endpoint, workspaceId] as const,
  workspaces: (endpoint: string, scope?: string) =>
    scope ? (['workspaces', endpoint, scope] as const) : (['workspaces', endpoint] as const),
} as const;

export type ClioQueryKey = ReturnType<(typeof queryKeys)[keyof typeof queryKeys]>;
