import { useQuery } from '@tanstack/react-query';
import { emptyAgentDelta, type AgentDelta, type WorkspaceReference } from '@clio/core/v3';
import { toast } from 'sonner';
import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { connectionScope } from '@/lib/connection-scope';
import { ConnectedSourcePicker } from '@/components/clio/connected-source-picker';
import type { ObsidianChoice } from '@/components/clio/obsidian-source-form';
import { DraftAgentCompositionView } from '@/components/clio/agent-composition-view';
import { ClioAppShell } from '@/components/clio/app-shell';
import { ClioComposer } from '@/components/clio/composer';
import {
  DraftAgentChip,
  DraftCustomizeChip,
  DraftWorkspaceChip,
} from '@/components/clio/new-conversation-chips';
import {
  NewConversationBreadcrumb,
  NewConversationDraft,
} from '@/components/clio/new-conversation-draft';
import { ClioNavigation } from '@/components/clio/navigation';
import { ClioDraftActions } from '@/components/clio/draft-actions';
import { ClioDownloadsButton } from '@/components/clio/downloads-button';
import { ClioWorkbench } from '@/components/clio/workbench';
import {
  WorkspaceActionAlerts,
  WorkspaceUnavailable,
  WorkspaceStatusStrip,
} from '@/components/clio/workspace-route-surfaces';
import {
  canUploadWorkspaceResources,
  canUseContextReferences,
} from '@/components/clio/workspace-route-state';
import { useComposerDraft, useComposerDraftValue } from '@/hooks/use-composer-draft';
import { useConnectionIndicatorState } from '@/hooks/use-connection-indicator-state';
import { useDesktopTitleSync } from '@/hooks/use-desktop-title-sync';
import { useRepository } from '@/hooks/use-repository';
import { useAgentPluginsSupported } from '@/hooks/use-session-agent';
import { useSessionMutations } from '@/hooks/use-session-mutations';
import { useSessionDiffActions } from '@/hooks/use-session-diff-actions';
import { useWorkbenchNavigation } from '@/hooks/use-workbench-navigation';
import { useWorkspaceTerminalActions } from '@/hooks/use-workspace-terminal-actions';
import { useWorkspaceData } from '@/hooks/use-workspace-data';
import { useModelCatalogStatus } from '@/hooks/use-model-catalog-status';
import { useQueryFetching } from '@/lib/query-notify';
import { useWorkspaceNavigationActions } from '@/hooks/use-workspace-navigation-actions';
import { useWorkspaceWarmup } from '@/hooks/use-workspace-warmup';
import { newConversationRoute } from '@/lib/workspace-route-memory';
import { queryKeys } from '@/lib/query-keys';
import { buildSessionAttentionMap } from '@/lib/session-attention';
import { useConnectionSettings } from '@/providers/connection-provider';
import { navigateComposerReference } from '@/lib/composer-reference-navigation';
import { openExternalUrlOrToast } from '@/tauri/external-url';

/** An entry composer has no session identity, persistence, or session stream. */
export function NewConversationPage() {
  const { workspaceId = '' } = useParams();
  const { settings } = useConnectionSettings();
  return <WorkspaceDraft key={`${settings.endpoint}:${workspaceId}`} workspaceId={workspaceId} />;
}

function WorkspaceDraft({ workspaceId }: { workspaceId: string }) {
  const { settings } = useConnectionSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const intent = (
    location.state as {
      sourceConnection?: { scope: string; providerId: string; choice?: ObsidianChoice };
    } | null
  )?.sourceConnection;
  const connectSource = intent?.scope === connectionScope(settings) ? intent : undefined;
  const connection = useConnectionIndicatorState();
  const repository = useRepository();
  const draft = useComposerDraft(workspaceId, { persist: false });
  const draftValue = useComposerDraftValue(draft);
  const [filesViewActive, setFilesViewActive] = useState(false);
  const data = useWorkspaceData({
    contextTargetId: '',
    sessionId: '',
    workspaceId,
    filesViewActive,
  });
  const filesFetching = useQueryFetching(data.workspaceFilesKey);
  const modelCatalogStatus = useModelCatalogStatus(data.modelCatalogStatus);
  const diffActions = useSessionDiffActions();
  const defaults = useQuery({
    queryKey: queryKeys.key('session-defaults', settings.endpoint),
    queryFn: ({ signal }) => repository.sessionDefaults(signal),
  });
  const provider =
    defaults.data?.provider_id ||
    data.activeProvider ||
    data.capabilities.data?.active_model?.provider_id;
  const model =
    defaults.data?.model_id || data.activeModel || data.capabilities.data?.active_model?.model_id;
  const [agentChoice, setAgentChoice] = useState<string>();
  // Plugin changes made to the agent before the first message (the Agent tab).
  const [draftDelta, setDraftDelta] = useState<AgentDelta>(emptyAgentDelta);
  const draftChanges = draftDelta.add.length + draftDelta.remove.length;
  const { send, prepareFiles, discardFiles } = useSessionMutations({
    activeProvider: provider,
    activeModel: model,
    sessionId: '',
    workspaceId,
    createOnSend: true,
    draftAgentRef: agentChoice || undefined,
    draftAgentDelta: draftDelta,
  });
  const { navigationActions } = useWorkspaceNavigationActions(workspaceId, '');
  const sessions = data.allSessions.data ?? data.sessions.data ?? [];
  const workspace = data.workspaces.data?.find((item) => item.id === workspaceId);
  const {
    requests,
    revealWorkbench,
    openSubagent,
    openWorkspaceFile,
    openWorkspaceResource,
    openArtifact,
    openDiff,
  } = useWorkbenchNavigation({
    allSessions: sessions,
    workspaceId,
  });
  const openReference = async (reference: WorkspaceReference): Promise<void> => {
    try {
      const outcome = await navigateComposerReference({
        artifacts: [],
        diffs: [],
        openArtifact,
        openDiff,
        openExternal: openExternalUrlOrToast,
        openSession: (targetWorkspaceId, targetSessionId) =>
          void navigate(
            `/workspaces/${encodeURIComponent(targetWorkspaceId)}/sessions/${encodeURIComponent(targetSessionId)}`,
          ),
        openWorkspaceFile,
        openWorkspaceResource,
        reference,
        repository,
        resources: Object.fromEntries(
          (data.workspaceResources.data ?? []).map((item) => [item.id, item]),
        ),
        revealSession: () => revealWorkbench({ kind: 'session' }),
        sessionId: '',
        workspaceId,
      });
      if (outcome.status === 'unresolved')
        toast.error('Could not open reference', { description: outcome.reason });
    } catch (error) {
      toast.error('Could not open reference', {
        description:
          error instanceof Error ? error.message : 'Refresh the reference and try again.',
      });
    }
  };
  const terminalActions = useWorkspaceTerminalActions(workspace?.path, revealWorkbench);
  const warmup = useWorkspaceWarmup(
    workspaceId,
    Boolean(
      workspace &&
        defaults.isSuccess &&
        data.capabilities.data?.capabilities.x_clio_workspace_warmup,
    ),
    defaults.data?.agent_ref,
  );
  const defaultRef = defaults.data?.default_agent_ref || defaults.data?.agent_ref || undefined;
  const draftRef = agentChoice || defaultRef || '';
  const openAgent = () => revealWorkbench({ kind: 'resources', section: 'agent' });
  const agentsSupported = useAgentPluginsSupported();
  useDesktopTitleSync({ workspace: workspace?.display_name, session: 'New conversation' });
  const error = data.workspaces.error ?? data.capabilities.error ?? defaults.error;
  if (error || (!data.workspaces.isPending && !workspace)) {
    return (
      <WorkspaceUnavailable
        error={error?.message ?? 'This workspace is unavailable.'}
        onRetry={() => {
          void data.workspaces.refetch();
          void data.capabilities.refetch();
          void defaults.refetch();
        }}
      />
    );
  }
  return (
    <ClioAppShell
      navigation={
        <ClioNavigation
          activeSessionId=""
          activeWorkspaceId={workspaceId}
          actions={navigationActions}
          attentions={buildSessionAttentionMap(sessions, data.attentionInteractions)}
          agents={data.installedAgents.data ?? []}
          endpoint={settings.endpoint}
          onOpenWorkspaceFiles={() => revealWorkbench({ kind: 'resources', section: 'files' })}
          sessions={sessions}
          workspaces={data.workspaces.data ?? []}
        />
      }
      contextBar={
        <div className="flex min-w-0 items-center gap-2">
          <div className="min-w-0 flex-1">
            <NewConversationBreadcrumb workspaceLabel={workspace?.display_name} />
          </div>
          <ClioDraftActions
            disabled={!workspace || send.isPending}
            onOpen={(section) => revealWorkbench({ kind: 'resources', section })}
            onOpenSystemTerminal={terminalActions.onOpenSystemTerminal}
          />
          <ClioDownloadsButton />
        </div>
      }
      statusStrip={<WorkspaceStatusStrip activeWorkCount={0} stream={connection} />}
      workbenchReveal={requests}
      workbench={
        <ClioWorkbench
          workspaceId={workspaceId}
          sessionId=""
          files={data.workspaceFiles.data?.entries ?? []}
          filesError={data.workspaceFiles.error?.message}
          filesPending={data.workspaceFiles.isPending}
          filesFetching={filesFetching}
          filesTruncated={data.workspaceFiles.data?.truncated ?? false}
          filesNextOffset={data.workspaceFiles.data?.next_offset}
          onFilesViewActiveChange={setFilesViewActive}
          onRefreshFiles={() => void data.workspaceFiles.refetch()}
          resources={data.workspaceResources.data ?? []}
          resourcesError={data.workspaceResources.error?.message}
          resourcesPending={data.workspaceResources.isPending}
          artifacts={[]}
          diffs={[]}
          sessionView={
            <p className="p-6 text-sm text-muted-foreground">
              Session activity appears after you send your first message.
            </p>
          }
          agentView={
            draftRef ? (
              <DraftAgentCompositionView
                draft={{ ref: draftRef, delta: draftDelta }}
                onChange={(next) => {
                  if (next.ref !== draftRef) setAgentChoice(next.ref);
                  setDraftDelta(next.delta);
                }}
              />
            ) : (
              <p className="p-6 text-sm text-muted-foreground">
                The default agent has nothing to change here. Choose an agent next to “with” to
                customize its plugins, prompt and tools.
              </p>
            )
          }
          onUndoDiff={(sessionId, workspaceId, changeId) =>
            diffActions.undo.mutateAsync({ sessionId, workspaceId, changeId })
          }
          diffActionError={diffActions.undo.error?.message}
          diffActionPending={diffActions.undo.isPending}
          onOpenSubagent={openSubagent}
          onOpenTerminal={terminalActions.onOpenTerminal}
          requests={requests}
        />
      }
    >
      <div className="flex h-full min-h-0 flex-col justify-center overflow-y-auto px-4 py-8 sm:px-8">
        <WorkspaceActionAlerts
          actionError={
            send.error?.message ??
            (warmup.error
              ? `Tools could not be prepared in advance: ${warmup.error.message}. You can still send a message.`
              : undefined)
          }
        />
        <NewConversationDraft
          setup={
            <>
              <span>In</span>
              <DraftWorkspaceChip
                workspaces={data.workspaces.data ?? []}
                workspaceId={workspaceId}
                disabled={send.isPending}
                onSelect={(id) => void navigate(newConversationRoute(id), { replace: true })}
              />
              <span>with</span>
              <DraftAgentChip
                agents={data.installedAgents.data}
                agentsError={data.installedAgents.error?.message}
                pending={data.installedAgents.isPending && agentsSupported !== false}
                agentRef={draftRef}
                defaultRef={defaultRef}
                changes={draftChanges}
                disabled={send.isPending}
                onSelect={(ref) => {
                  setAgentChoice(ref);
                  setDraftDelta(emptyAgentDelta);
                }}
                onManageAgents={openAgent}
              />
              {agentsSupported !== false ? (
                <DraftCustomizeChip
                  changes={draftChanges}
                  disabled={send.isPending}
                  onCustomize={openAgent}
                />
              ) : null}
            </>
          }
        >
          <ClioComposer
            attachments={canUploadWorkspaceResources(data.capabilities.data?.capabilities)}
            contextReferences={canUseContextReferences(data.capabilities.data?.capabilities)}
            disabled={send.isPending}
            connecting={!workspace || defaults.isPending}
            state={send.isPending ? 'queued' : 'completed'}
            provider={provider}
            model={model}
            modelOptions={data.modelOptions}
            modelCatalogStatus={modelCatalogStatus}
            configuredEffort={data.configuredEffort}
            effort={defaults.data?.effort}
            executionMode={
              defaults.data?.mode === 'plan'
                ? 'plan'
                : defaults.data?.mode === 'architect'
                  ? 'deep_research'
                  : 'execute'
            }
            confirmationPolicy={
              defaults.data?.approval_mode === 'unknown' ? 'ask' : defaults.data?.approval_mode
            }
            onRetryModelCatalog={() => void data.providerCatalog.refetch()}
            onPrepareFiles={prepareFiles}
            onDiscardFiles={discardFiles}
            onOpenReference={(reference) => void openReference(reference)}
            onOpenResource={openWorkspaceResource}
            onSubmit={async (value) => {
              await send.mutateAsync(value);
            }}
            resources={data.workspaceResources.data ?? []}
            value={draftValue}
            onValueChange={draft.onValueChange}
            references={draft.references}
            onReferencesChange={draft.onReferencesChange}
            variant="welcome"
            workspaceId={workspaceId}
          />
        </NewConversationDraft>
      </div>
      {connectSource && workspace && (
        <ConnectedSourcePicker
          workspaceId={workspaceId}
          open
          initialProviderId={connectSource.providerId}
          initialObsidianChoice={connectSource.choice}
          onOpenChange={(open) => {
            if (!open) void navigate(location.pathname, { replace: true, state: null });
          }}
        />
      )}
    </ClioAppShell>
  );
}
