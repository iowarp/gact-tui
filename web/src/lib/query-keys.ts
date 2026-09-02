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
  | 'execution-provenance'
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
  | 'provider-catalog'
  | 'provenance-providers'
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
  | 'pending-steers'
  | 'queued-messages'
  | 'tools'
  | 'transcript'
  | 'workspace-file'
  | 'workspace-file-bytes'
  | 'workspace-files'
  | 'workspace-resources'
  | 'workspace-resource-derivatives'
  | 'workspace-resource-derivative-content'
  | 'workspace-resource-deliveries'
  | 'workspace-resource-preview'
  | 'workspace-resource-structure'
  | 'workspace-resource-structure-node'
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
  providerCatalog: (endpoint: string) => ['provider-catalog', endpoint] as const,
  pendingSteers: (endpoint: string, sessionId: string) =>
    ['pending-steers', endpoint, sessionId] as const,
  queuedMessages: (endpoint: string, sessionId: string) =>
    ['queued-messages', endpoint, sessionId] as const,
  provenanceProviders: (endpoint: string) => ['provenance-providers', endpoint] as const,
  executionProvenance: (endpoint: string, sessionId: string, provider: string) =>
    ['execution-provenance', endpoint, sessionId, provider] as const,
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
  workspaceFile: (endpoint: string, workspaceId: string, path: string) =>
    ['workspace-file', endpoint, workspaceId, path] as const,
  workspaceFileBytes: (endpoint: string, workspaceId: string, path: string) =>
    ['workspace-file-bytes', endpoint, workspaceId, path] as const,
  workspaceFiles: (endpoint: string, workspaceId: string) =>
    ['workspace-files', endpoint, workspaceId] as const,
  workspaceResources: (endpoint: string, workspaceId: string) =>
    ['workspace-resources', endpoint, workspaceId] as const,
  workspaceResourceDeliveries: (endpoint: string, workspaceId: string) =>
    ['workspace-resource-deliveries', endpoint, workspaceId] as const,
  // Each shorter form is the prefix an invalidation uses: without a revision it
  // matches every revision of one resource (what a reprocess changes), and
  // without a resource it matches every resource in one workspace (what a
  // workspace-scoped stream event changes).
  workspaceResourceDerivatives: (
    endpoint: string,
    workspaceId: string,
    resourceId?: string,
    revision?: number,
  ) =>
    resourceId === undefined
      ? (['workspace-resource-derivatives', endpoint, workspaceId] as const)
      : revision === undefined
        ? (['workspace-resource-derivatives', endpoint, workspaceId, resourceId] as const)
        : ([
            'workspace-resource-derivatives',
            endpoint,
            workspaceId,
            resourceId,
            revision,
          ] as const),
  workspaceResourceDerivativeContent: (
    endpoint: string,
    workspaceId: string,
    resourceId: string,
    derivativeId: string,
  ) =>
    ['workspace-resource-derivative-content', endpoint, workspaceId, resourceId, derivativeId] as const,
  workspaceResourcePreview: (
    endpoint: string,
    workspaceId: string,
    resourceId: string,
    revision?: number,
  ) =>
    revision === undefined
      ? (['workspace-resource-preview', endpoint, workspaceId, resourceId] as const)
      : (['workspace-resource-preview', endpoint, workspaceId, resourceId, revision] as const),
  workspaceResourceStructure: (
    endpoint: string,
    workspaceId: string,
    resourceId?: string,
    revision?: number,
  ) =>
    resourceId === undefined
      ? (['workspace-resource-structure', endpoint, workspaceId] as const)
      : revision === undefined
        ? (['workspace-resource-structure', endpoint, workspaceId, resourceId] as const)
        : (['workspace-resource-structure', endpoint, workspaceId, resourceId, revision] as const),
  workspaceResourceStructureNode: (
    endpoint: string,
    workspaceId: string,
    resourceId?: string,
    collection?: string,
    index?: number,
  ) =>
    resourceId === undefined
      ? (['workspace-resource-structure-node', endpoint, workspaceId] as const)
      : collection === undefined
        ? (['workspace-resource-structure-node', endpoint, workspaceId, resourceId] as const)
        : ([
            'workspace-resource-structure-node',
            endpoint,
            workspaceId,
            resourceId,
            collection,
            index,
          ] as const),
  workspaces: (endpoint: string, scope?: string) =>
    scope ? (['workspaces', endpoint, scope] as const) : (['workspaces', endpoint] as const),
} as const;

export type ClioQueryKey = ReturnType<(typeof queryKeys)[keyof typeof queryKeys]>;
