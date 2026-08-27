import { queryKeys } from '@/lib/query-keys';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import * as workspaceRouteState from '@/components/clio/workspace-route-state';
import { resolveActiveBlueprint } from '@/lib/active-blueprint';
import { buildContextTargets, resolveContextSession } from '@/lib/context-targets';
import { recordById } from '@/lib/entities';
import { buildModelOptions } from '@/lib/model-options';
import { sessionArtifactEntities } from '@/lib/session-artifacts';
import { rememberValidatedWorkspaceRoute } from '@/lib/workspace-route-memory';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';
import { useRepository } from './use-repository';
import { useSessionContext } from './use-session-context';
import { useExecutionProvenance } from './use-execution-provenance';
import { useSessionLiveStream } from './use-session-live-stream';
import { useSessionObservability } from './use-session-observability';
import { useWorkspaceCapabilities } from './use-workspace-capabilities';

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
      entitySubagents,
      entityTasks,
      entityTools,
      entityWorkspaces,
    ],
  );
  const replaceSnapshots = useLiveStore((state) => state.replaceSnapshots);
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
      return current &&
        ['queued', 'running', 'waiting_permission', 'waiting_user'].includes(current.state)
        ? 1_500
        : false;
    },
  });
  const allSessions = useQuery({
    queryKey: queryKeys.key('sessions', settings.endpoint, 'all'),
    queryFn: ({ signal }) => repository.allSessions(signal),
  });
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
  const approvals = useQuery({
    queryKey: queryKeys.key('pending-approvals', settings.endpoint, 'all-active'),
    queryFn: ({ signal }) => repository.pendingApprovals(undefined, signal),
    enabled: Boolean(sessionId),
    refetchInterval: 1_500,
  });
  const questions = useQuery({
    queryKey: queryKeys.key('pending-questions', settings.endpoint, sessionId),
    queryFn: ({ signal }) => repository.questions(sessionId, signal, 'pending'),
    enabled: Boolean(sessionId),
  });

  useEffect(() => {
    if (workspaces.data) replaceSnapshots({ workspaces: recordById(workspaces.data) });
  }, [replaceSnapshots, workspaces.data]);
  useEffect(() => {
    if (sessions.data) replaceSnapshots({ sessions: recordById(sessions.data) });
  }, [replaceSnapshots, sessions.data]);
  useEffect(() => {
    if (!transcript.data) return;
    replaceSnapshots({
      messages: recordById(transcript.data.messages),
      tools: recordById(transcript.data.tools),
      tasks: recordById(transcript.data.tasks),
      subagents: recordById(transcript.data.subagents),
      artifacts: recordById(transcript.data.artifacts),
      surfaces: recordById(transcript.data.surfaces),
    });
  }, [replaceSnapshots, transcript.data]);

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
  const visibleApprovals = useMemo(
    () =>
      (approvals.data ?? []).filter((approval) => interactionSessionIds.has(approval.session_id)),
    [approvals.data, interactionSessionIds],
  );
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
  const modelOptions = buildModelOptions({
    activeCatalogProvider,
    activeModel,
    activeProvider,
    catalogModels: modelCatalog.data?.models,
    presets: modelConfiguration.data?.presets ?? [],
  });

  return {
    activeBlueprint,
    activeEffort,
    activeModel,
    activeProvider,
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
    modelConfiguration,
    modelOptions,
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
    workspaces,
  };
}
