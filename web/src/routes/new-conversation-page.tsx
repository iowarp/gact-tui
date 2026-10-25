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
import { ClioConversationWelcome } from '@/components/clio/conversation-welcome';
import { ClioNavigation } from '@/components/clio/navigation';
import { ClioDraftActions } from '@/components/clio/draft-actions';
import { ClioDownloadsButton } from '@/components/clio/downloads-button';
import { ClioWorkbench } from '@/components/clio/workbench';
import { Button } from '@/components/ui/button';
import {
  WorkspaceActionAlerts,
  WorkspaceUnavailable,
  WorkspaceStatusStrip,
} from '@/components/clio/workspace-route-surfaces';
import {
  canUploadWorkspaceResources,
  canUseContextReferences,
} from '@/components/clio/workspace-route-state';
import { useComposerDraft } from '@/hooks/use-composer-draft';
import { useConnectionIndicatorState } from '@/hooks/use-connection-indicator-state';
import { useDesktopTitleSync } from '@/hooks/use-desktop-title-sync';
import { useRepository } from '@/hooks/use-repository';
import { useSessionMutations } from '@/hooks/use-session-mutations';
import { useSessionDiffActions } from '@/hooks/use-session-diff-actions';
import { useWorkbenchNavigation } from '@/hooks/use-workbench-navigation';
import { useWorkspaceTerminalActions } from '@/hooks/use-workspace-terminal-actions';
import { useWorkspaceData } from '@/hooks/use-workspace-data';
import { useWorkspaceNavigationActions } from '@/hooks/use-workspace-navigation-actions';
import { useWorkspaceWarmup } from '@/hooks/use-workspace-warmup';
import { ConfigureIcon } from '@/lib/icon-vocabulary';
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
  const [filesViewActive, setFilesViewActive] = useState(false);
  const data = useWorkspaceData({
    contextTargetId: '',
    sessionId: '',
    workspaceId,
    filesViewActive,
  });
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
    activeRequest,
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
  const agents = data.installedAgents.data ?? [];
  const defaultRef = defaults.data?.default_agent_ref || defaults.data?.agent_ref || undefined;
  const defaultListed = Boolean(defaultRef && agents.some((agent) => agent.ref === defaultRef));
  const yourAgents = agents.filter((agent) => agent.kind === 'user');
  const installedAgents = agents.filter((agent) => agent.kind !== 'user');
  const draftRef = agentChoice || defaultRef || '';
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
          <label className="flex min-w-0 items-center gap-2 text-sm">
            <span className="max-sm:sr-only">New conversation in</span>
            <select
              aria-label="Conversation workspace"
              className="min-w-0 rounded-md border border-border bg-background px-2 py-1"
              value={workspaceId}
              disabled={send.isPending}
              onChange={(event) =>
                void navigate(newConversationRoute(event.target.value), { replace: true })
              }
            >
              {(data.workspaces.data ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.display_name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 items-center gap-2 text-sm">
            <span className="max-sm:sr-only">with</span>
            <select
              aria-label="Conversation agent"
              className="min-w-0 max-w-36 rounded-md border border-border bg-background px-2 py-1 sm:max-w-48"
              disabled={send.isPending}
              onChange={(event) => {
                setAgentChoice(event.target.value);
                setDraftDelta(emptyAgentDelta);
              }}
              value={agentChoice ?? defaultRef ?? ''}
            >
              {/* Until the agents load, say so; once loaded the default reads "<name> (default)". */}
              {defaultListed ? null : (
                <option value="">
                  {data.installedAgents.isPending ? 'Loading agents…' : 'Default agent'}
                </option>
              )}
              {yourAgents.length ? (
                <optgroup label="Your agents">
                  {yourAgents.map((agent) => (
                    <option
                      key={agent.ref}
                      title={agent.description || undefined}
                      value={agent.ref}
                    >
                      {agent.name || agent.id}
                    </option>
                  ))}
                </optgroup>
              ) : null}
              <optgroup label="Installed agents">
                {installedAgents.map((agent) => (
                  <option key={agent.ref} title={agent.description || undefined} value={agent.ref}>
                    {agent.name || agent.id}
                    {agent.ref === defaultRef ? ' (default)' : ''}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          {draftRef ? (
            <Button
              aria-label={
                draftChanges
                  ? `Customize the agent (${draftChanges} ${draftChanges === 1 ? 'change' : 'changes'})`
                  : 'Customize the agent'
              }
              disabled={send.isPending}
              onClick={() => revealWorkbench({ kind: 'resources', section: 'agent' })}
              size="sm"
              variant="ghost"
            >
              <ConfigureIcon aria-hidden="true" />
              <span className="max-sm:sr-only">
                {draftChanges ? `Customized (${draftChanges})` : 'Customize'}
              </span>
              {/* Narrow screens keep the count visible beside the icon; the label is above. */}
              {draftChanges ? (
                <span aria-hidden="true" className="text-xs sm:hidden">
                  {draftChanges}
                </span>
              ) : null}
            </Button>
          ) : null}
          <ClioDraftActions
            disabled={!workspace || send.isPending}
            onOpen={(section) => revealWorkbench({ kind: 'resources', section })}
            onOpenSystemTerminal={terminalActions.onOpenSystemTerminal}
          />
          <ClioDownloadsButton />
        </div>
      }
      statusStrip={<WorkspaceStatusStrip activeWorkCount={0} stream={connection} tokens={0} />}
      workbenchRevealKey={activeRequest?.key}
      workbench={
        <ClioWorkbench
          workspaceId={workspaceId}
          sessionId=""
          files={data.workspaceFiles.data?.entries ?? []}
          filesError={data.workspaceFiles.error?.message}
          filesPending={data.workspaceFiles.isPending}
          filesFetching={data.workspaceFiles.isFetching}
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
            ) : undefined
          }
          onUndoDiff={(sessionId, workspaceId, changeId) =>
            diffActions.undo.mutateAsync({ sessionId, workspaceId, changeId })
          }
          diffActionError={diffActions.undo.error?.message}
          diffActionPending={diffActions.undo.isPending}
          onOpenSubagent={openSubagent}
          onOpenTerminal={terminalActions.onOpenTerminal}
          requestedOpen={activeRequest}
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
        <ClioConversationWelcome disabled={send.isPending} onSelectPrompt={draft.onValueChange}>
          <ClioComposer
            attachments={canUploadWorkspaceResources(data.capabilities.data?.capabilities)}
            contextReferences={canUseContextReferences(data.capabilities.data?.capabilities)}
            disabled={!workspace || defaults.isPending || send.isPending}
            state={send.isPending ? 'queued' : 'completed'}
            provider={provider}
            model={model}
            modelOptions={data.modelOptions}
            modelCatalogStatus={data.modelCatalogStatus}
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
            value={draft.value}
            onValueChange={draft.onValueChange}
            references={draft.references}
            onReferencesChange={draft.onReferencesChange}
            variant="welcome"
            workspaceId={workspaceId}
          />
        </ClioConversationWelcome>
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
