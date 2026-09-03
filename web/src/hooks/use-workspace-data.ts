import { queryKeys } from '@/lib/query-keys';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import * as workspaceRouteState from '@/components/clio/workspace-route-state';
import { resolveActiveBlueprint } from '@/lib/active-blueprint';
import { buildContextTargets, resolveContextSession } from '@/lib/context-targets';
import { recordById } from '@/lib/entities';
import { buildModelOptions } from '@/lib/model-options';
import {
  ACTIVE_SESSION_POLL_MS,
  PENDING_INTERACTIONS_FANOUT_CAP,
  PENDING_INTERACTIONS_FANOUT_STALE_TIME_MS,
  PROVIDER_CATALOG_STALE_TIME_MS,
} from '@/lib/runtime-limits';
import { sessionArtifactEntities } from '@/lib/session-artifacts';
import { isSessionActive } from '@/lib/session-state';
import { rememberValidatedWorkspaceRoute } from '@/lib/workspace-route-memory';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';
import { useRepository } from './use-repository';
import { useSessionContext } from './use-session-context';
import { useExecutionProvenance } from './use-execution-provenance';
import { useSessionLiveStream } from './use-session-live-stream';
import { useSessionObservability } from './use-session-observability';
import { useWorkspaceCapabilities } from './use-workspace-capabilities';
import {
  hasUnifiedInteractionCapability,
  interactionRootSessionId,
  legacyPendingInteractions,
} from '@/lib/pending-interaction-contract';

interface UseWorkspaceDataInput {
  contextTargetId: string;
  sessionId: string;
  workspaceId: string;
}

/** Owns authoritative workspace/session reads and their normalized live projections. */
export function useWorkspaceData({
  contextTargetId,
  sessionId,
  workspaceId,
}: UseWorkspaceDataInput) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const entityArtifacts = useLiveStore((state) => state.entities.artifacts);
  const entityContext = useLiveStore((state) => state.entities.context);
  const entityRuns = useLiveStore((state) => state.entities.runs);
  const entitySessions = useLiveStore((state) => state.entities.sessions);
  const entitySurfaces = useLiveStore((state) => state.entities.surfaces);
  const entitySubagents = useLiveStore((state) => state.entities.subagents);
  const entityTasks = useLiveStore((state) => state.entities.tasks);
  const entityTools = useLiveStore((state) => state.entities.tools);
  const entityWorkspaces = useLiveStore((state) => state.entities.workspaces);
  const entities = useMemo(
    () => ({
      artifacts: entityArtifacts,
      context: entityContext,
      runs: entityRuns,
      sessions: entitySessions,
      surfaces: entitySurfaces,
      subagents: entitySubagents,
      tasks: entityTasks,
      tools: entityTools,
      workspaces: entityWorkspaces,
    }),
    [
      entityArtifacts,
      entityContext,
      entityRuns,
      entitySessions,
      entitySurfaces,
      entitySubagents,
      entityTasks,
      entityTools,
      entityWorkspaces,
    ],
  );
  const mergeSnapshots = useLiveStore((state) => state.mergeSnapshots);
  const { capabilities, modelConfiguration } = useWorkspaceCapabilities();

  const workspaces = useQuery({
    queryKey: queryKeys.key('workspaces', settings.endpoint),
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  const sessions = useQuery({
    queryKey: queryKeys.key('sessions', settings.endpoint, workspaceId),
    queryFn: ({ signal }) => repository.sessions(workspaceId, signal),
    enabled: Boolean(workspaceId),
    refetchInterval: (query) => {
      const current = query.state.data?.find((item) => item.id === sessionId);
      return current && isSessionActive(current.state) ? ACTIVE_SESSION_POLL_MS : false;
    },
  });
  const allSessions = useQuery({
    queryKey: queryKeys.key('sessions', settings.endpoint, 'all'),
    queryFn: ({ signal }) => repository.allSessions(signal),
  });
  const hierarchySessions = useMemo(
    () => allSessions.data ?? sessions.data ?? [],
    [allSessions.data, sessions.data],
  );
  const attendedSessionRoot = useMemo(
    () => interactionRootSessionId(sessionId, hierarchySessions),
    [hierarchySessions, sessionId],
  );
  const attendedSessionId = attendedSessionRoot.id;
  const transcript = useQuery({
    queryKey: queryKeys.key('transcript', settings.endpoint, sessionId),
    queryFn: ({ signal }) => repository.transcript(sessionId, signal),
    enabled: Boolean(sessionId),
  });
  const sessionArtifacts = useQuery({
    queryKey: queryKeys.key('session-artifacts', settings.endpoint, sessionId),
    queryFn: ({ signal }) => repository.sessionArtifacts(sessionId, signal),
    enabled: Boolean(sessionId),
  });
  const streamError = useSessionLiveStream({
    enabled: workspaceRouteState.canOpenSessionStream(capabilities.data?.gact_versions, sessionId),
    initialCursor: transcript.data?.cursor,
    sessionId,
    workspaceId,
  });
  const supportsUnifiedInteractions = hasUnifiedInteractionCapability(
    capabilities.data?.capabilities,
  );
  // Capability detection may only ADD the normalized read; it may never subtract
  // the legacy ledgers. Gating these on a resolved capability read made a failing
  // or still-pending `/v1/capabilities` blank the whole interaction surface — a
  // blocked agent with nothing on screen to unblock it. Unresolved means legacy,
  // which is what every backend answered before the capability existed.
  const useLegacyInteractions = !supportsUnifiedInteractions;
  const approvals = useQuery({
    queryKey: queryKeys.key('pending-approvals', settings.endpoint, 'all-active'),
    queryFn: ({ signal }) => repository.pendingApprovals(undefined, signal),
    enabled: Boolean(sessionId) && useLegacyInteractions,
    refetchInterval: ACTIVE_SESSION_POLL_MS,
  });
  // Read unscoped (`/v1/questions?status=pending`, no `session_id`), mirroring
  // pendingApprovals just above: a background session's question must reach
  // this attention feed too, not only the currently active session's. Like
  // approvals, that means polling rather than relying on the live stream,
  // which only opens for the active session.
  const questions = useQuery({
    queryKey: queryKeys.key('pending-questions', settings.endpoint, 'all-active'),
    queryFn: ({ signal }) => repository.pendingQuestions(undefined, signal),
    enabled: Boolean(sessionId) && useLegacyInteractions,
    refetchInterval: ACTIVE_SESSION_POLL_MS,
  });
  const normalizedInteractions = useQuery({
    queryKey: queryKeys.pendingInteractions(settings.endpoint, attendedSessionId),
    queryFn: ({ signal }) => repository.pendingInteractions(attendedSessionId, true, signal),
    enabled:
      Boolean(attendedSessionId) &&
      (allSessions.data !== undefined || sessions.data !== undefined) &&
      supportsUnifiedInteractions,
    refetchInterval: ACTIVE_SESSION_POLL_MS,
  });
  const attentionRootSessionIds = useMemo(() => {
    if (!supportsUnifiedInteractions) return [];
    // A busy workspace with many background sessions cannot open one request
    // per root session on every render — capped, not unbounded fan-out.
    return [
      ...new Set(
        hierarchySessions
          .filter((candidate) => !candidate.archived)
          .map((candidate) => interactionRootSessionId(candidate.id, hierarchySessions).id)
          .filter((candidateId) => candidateId !== attendedSessionId),
      ),
    ].slice(0, PENDING_INTERACTIONS_FANOUT_CAP);
  }, [attendedSessionId, hierarchySessions, supportsUnifiedInteractions]);
  const attentionInteractionQueries = useQueries({
    queries: attentionRootSessionIds.map((rootSessionId) => ({
      queryKey: queryKeys.pendingInteractions(settings.endpoint, rootSessionId),
      queryFn: ({ signal }) => repository.pendingInteractions(rootSessionId, true, signal),
      staleTime: PENDING_INTERACTIONS_FANOUT_STALE_TIME_MS,
    })),
  });
  const attentionInteractionsError = attentionInteractionQueries.find(
    (query) => query.error,
  )?.error;
  const interactions = useMemo(
    () =>
      supportsUnifiedInteractions
        ? (normalizedInteractions.data ?? [])
        : legacyPendingInteractions(hierarchySessions, approvals.data ?? [], questions.data ?? []),
    [
      approvals.data,
      hierarchySessions,
      normalizedInteractions.data,
      questions.data,
      supportsUnifiedInteractions,
    ],
  );
  const attentionInteractions = supportsUnifiedInteractions
    ? [...interactions, ...attentionInteractionQueries.flatMap((query) => query.data ?? [])]
    : interactions;
  const a2uiOwnerIds = useMemo(
    () => [
      ...new Set(
        interactions
          .filter((interaction) => interaction.kind === 'a2ui')
          .map((interaction) => interaction.owner_session_id),
      ),
    ],
    [interactions],
  );
  const interactionSurfaceSnapshots = useQueries({
    queries: a2uiOwnerIds.map((ownerSessionId) => ({
      queryKey: queryKeys.transcript(settings.endpoint, ownerSessionId, 'pending-a2ui'),
      queryFn: ({ signal }) => repository.transcript(ownerSessionId, signal),
    })),
  });
  const interactionSurfaces = {
    ...entities.surfaces,
    ...Object.fromEntries(
      interactionSurfaceSnapshots
        .flatMap((snapshot) => snapshot.data?.surfaces ?? [])
        .map((surface) => [`${surface.session_id}:${surface.id}`, surface]),
    ),
  };
  // A one-shot read: a card left waiting on a surface that missed its live
  // event (rather than one that never existed) has no other path to recover
  // without this — a poll interval is not wired for these snapshots.
  const refetchInteractionSurfaces = useCallback(() => {
    void Promise.all(interactionSurfaceSnapshots.map((snapshot) => snapshot.refetch()));
  }, [interactionSurfaceSnapshots]);

  useEffect(() => {
    if (workspaces.data) mergeSnapshots({ workspaces: recordById(workspaces.data) });
  }, [mergeSnapshots, workspaces.data]);
  useEffect(() => {
    if (sessions.data) mergeSnapshots({ sessions: recordById(sessions.data) });
  }, [mergeSnapshots, sessions.data]);
  useEffect(() => {
    if (!transcript.data) return;
    mergeSnapshots({
      messages: recordById(transcript.data.messages),
      tools: recordById(transcript.data.tools),
      tasks: recordById(transcript.data.tasks),
      subagents: recordById(transcript.data.subagents),
      artifacts: recordById(transcript.data.artifacts),
      surfaces: recordById(transcript.data.surfaces),
    });
  }, [mergeSnapshots, transcript.data]);

  const sessionCandidate =
    entities.sessions[sessionId] ?? sessions.data?.find((item) => item.id === sessionId);
  const session = sessionCandidate?.workspace_id === workspaceId ? sessionCandidate : undefined;
  const workspace =
    entities.workspaces[workspaceId] ?? workspaces.data?.find((item) => item.id === workspaceId);
  useEffect(() => {
    if (workspace?.id !== workspaceId) return;
    rememberValidatedWorkspaceRoute(settings.endpoint, workspaceId, session);
  }, [session, settings.endpoint, workspace?.id, workspaceId]);

  const parentSession = session?.parent_session_id
    ? allSessions.data?.find((item) => item.id === session.parent_session_id)
    : undefined;
  const transcriptError = workspaceRouteState.conversationUnavailableMessage(transcript.error);
  const contextTargetSession = resolveContextSession(
    contextTargetId,
    session,
    allSessions.data ?? [],
  );
  const sessionContext = useSessionContext(
    contextTargetId,
    contextTargetSession?.agent_id ?? 'main',
    Boolean(session && contextTargetSession),
  );
  const sessionObservability = useSessionObservability(sessionId);
  const executionProvenance = useExecutionProvenance(sessionId);
  const contextObservability = useSessionObservability(contextTargetId);
  const workspaceFiles = useQuery({
    queryKey: queryKeys.key('workspace-files', settings.endpoint, workspaceId),
    queryFn: ({ signal }) => repository.workspaceFiles(workspaceId, signal),
    enabled: Boolean(workspaceId),
  });
  const workspaceResources = useQuery({
    queryKey: queryKeys.workspaceResources(settings.endpoint, workspaceId),
    queryFn: ({ signal }) => repository.resources(workspaceId, signal),
    enabled: Boolean(workspaceId),
    refetchInterval: (query) =>
      (query.state.data ?? []).some((resource) =>
        ['submitted', 'processing'].includes(resource.processing?.state ?? ''),
      )
        ? ACTIVE_SESSION_POLL_MS
        : false,
  });
  const agentBlueprints = useQuery({
    queryKey: queryKeys.key('agent-blueprints', settings.endpoint, workspaceId),
    queryFn: ({ signal }) => repository.agentBlueprints(workspaceId, signal),
    enabled: Boolean(workspaceId),
  });
  const tasks = Object.values(entities.tasks).filter((task) => task.session_id === sessionId);
  const tools = Object.values(entities.tools).filter((tool) => tool.session_id === sessionId);
  const transcriptArtifacts = useMemo(
    () => Object.values(entities.artifacts).filter((artifact) => artifact.session_id === sessionId),
    [entities.artifacts, sessionId],
  );
  const artifacts = useMemo(
    () => sessionArtifactEntities(sessionArtifacts.data, transcriptArtifacts, sessionId),
    [sessionArtifacts.data, sessionId, transcriptArtifacts],
  );
  const subagents = useMemo(
    () => Object.values(entities.subagents).filter((subagent) => subagent.session_id === sessionId),
    [entities.subagents, sessionId],
  );
  const processes = sessionObservability.processes.data ?? [];
  const interactionSessionIds = useMemo(() => {
    const related = new Set([sessionId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const subagent of Object.values(entities.subagents)) {
        if (
          subagent.child_session_id &&
          related.has(subagent.session_id) &&
          !related.has(subagent.child_session_id)
        ) {
          related.add(subagent.child_session_id);
          changed = true;
        }
      }
      for (const candidate of allSessions.data ?? []) {
        if (
          candidate.parent_session_id &&
          related.has(candidate.parent_session_id) &&
          !related.has(candidate.id)
        ) {
          related.add(candidate.id);
          changed = true;
        }
      }
    }
    return related;
  }, [allSessions.data, entities.subagents, sessionId]);
  // Every pending approval is rendered. A blocked descendant this view has not
  // discovered yet is labelled by the interaction surface, never hidden.
  const visibleApprovals = approvals.data ?? [];
  const runs = Object.values(entities.runs).filter((run) => run.session_id === sessionId);
  const context = sessionContext.state.data ?? entities.context[contextTargetId];
  const activeProvider =
    session?.provider_id ??
    modelConfiguration.data?.provider ??
    capabilities.data?.active_model?.provider_id;
  const activeModel =
    session?.model_id ??
    modelConfiguration.data?.model ??
    capabilities.data?.active_model?.model_id;
  const activeEffort =
    session?.effort ??
    modelConfiguration.data?.thinking_level ??
    capabilities.data?.active_model?.effort;
  const activeBlueprint = resolveActiveBlueprint(session, agentBlueprints.data);
  const contextAgentLabel = activeBlueprint?.display_name ?? session?.agent_id;
  const contextTargetOptions = buildContextTargets(sessionId, contextAgentLabel, subagents);
  const activePreset = modelConfiguration.data?.presets.find(
    (preset) => preset.id === activeProvider || preset.provider === activeProvider,
  );
  const activeCatalogProvider = activePreset?.id ?? activeProvider ?? '';
  const modelCatalog = useQuery({
    queryKey: queryKeys.key('provider-models', settings.endpoint, activeCatalogProvider),
    queryFn: ({ signal }) => repository.providerModels(activeCatalogProvider, signal),
    enabled: Boolean(activeCatalogProvider),
  });
  const providerCatalog = useQuery({
    queryKey: queryKeys.providerCatalog(settings.endpoint),
    queryFn: ({ signal }) => repository.providerCatalog(false, signal),
    staleTime: PROVIDER_CATALOG_STALE_TIME_MS,
  });
  const modelOptions = buildModelOptions({
    activeCatalogProvider,
    activeModel,
    activeProvider,
    catalogModels: modelCatalog.data?.models,
    providerCatalog: providerCatalog.data,
    presets: modelConfiguration.data?.presets ?? [],
  });
  const modelCatalogStatus: 'error' | 'loading' | 'ready' = providerCatalog.isFetching
    ? 'loading'
    : providerCatalog.isError
      ? 'error'
      : 'ready';

  return {
    activeBlueprint,
    activeEffort,
    activeModel,
    activeProvider,
    attentionInteractions,
    agentBlueprints,
    allSessions,
    approvals,
    artifacts,
    capabilities,
    context,
    contextObservability,
    contextTargetOptions,
    entities,
    executionProvenance,
    interactionSessionIds,
    interactions,
    // Reads that actually failed to list responses. The per-root fan-out errors
    // join it — a blocked background session the reader cannot see is still an
    // interaction the reader was not told about.
    interactionsError:
      normalizedInteractions.error ??
      approvals.error ??
      questions.error ??
      attentionInteractionsError ??
      undefined,
    // `capabilities` failing is a degradation, not a failed response read: the
    // legacy ledgers above still run and still answer, so every pending
    // response was listed. It is reported on its own channel so the composer
    // can say the route is degraded without claiming responses are missing —
    // and so it never reaches only the full-page unavailable state, which is
    // skipped once a session is on screen.
    interactionCapabilityError: capabilities.error ?? undefined,
    interactionRootSessionId: attendedSessionId,
    // True when the attended session's true root could not be confirmed from
    // locally known sessions (an unknown ancestor, or a hierarchy cycle) —
    // `interactionRootSessionId` is then a best-effort id, not a proven root.
    interactionRootUnresolved: !attendedSessionRoot.resolved,
    interactionSurfaces,
    refetchInteractionSurfaces,
    supportsUnifiedInteractions,
    modelConfiguration,
    modelCatalogStatus,
    modelOptions,
    providerCatalog,
    parentSession,
    processes,
    questions,
    runs,
    session,
    sessionArtifacts,
    sessionContext,
    sessionObservability,
    sessions,
    streamError,
    subagents,
    tasks,
    tools,
    transcript,
    transcriptError,
    visibleApprovals,
    workspaceFiles,
    workspaceResources,
    workspaces,
  };
}
