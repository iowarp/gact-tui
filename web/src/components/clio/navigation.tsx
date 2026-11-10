import type { AgentEntry, Session, Workspace } from '@clio/core/v3';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useMatch, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Sidebar, SidebarContent, SidebarRail } from '@/components/ui/sidebar';
import { useSwitchConnection } from '@/hooks/use-switch-connection';
import { useConnectionAvailabilities } from '@/hooks/use-connection-availability';
import { useKnownConnections } from '@/hooks/use-known-connections';
import type { ConnectionSettings } from '@/lib/connection';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useMenuAction } from '@/tauri/menu-actions';
import { ClioArchivedSessionsDialog } from './archived-sessions-dialog';
import { ClioAttentionCenter, ClioAttentionNotifier } from './attention-center';
import { NavigationFooter } from './navigation-footer';
import { NavigationHeader } from './navigation-header';
import { StableInput } from './primitives/stable-input';
import { ClioResourceDialogs, type ResourceActions, type ResourceTarget } from './resource-dialogs';
import { WorkspaceEditorDialog } from './workspace-editor-dialog';
import { WorkspaceNavigation } from './workspace-navigation';
import { downloadSessionExport } from './session-export-download';
import { newConversationRoute } from '@/lib/workspace-route-memory';
import type { SessionAttention } from '@/lib/session-attention';

export interface ClioNavigationProps {
  endpoint: string;
  workspaces: readonly Workspace[];
  sessions: readonly Session[];
  activeWorkspaceId: string;
  activeSessionId: string;
  actions: ResourceActions;
  /** Installed agents, to name the agent each conversation runs. */
  agents: readonly AgentEntry[];
  onOpenWorkspaceFiles?: () => void;
  attentions: Readonly<Record<string, SessionAttention>>;
}

export function ClioNavigation({
  endpoint,
  workspaces,
  sessions,
  activeWorkspaceId,
  activeSessionId,
  actions,
  agents,
  onOpenWorkspaceFiles,
  attentions,
}: ClioNavigationProps) {
  const location = useLocation();
  const { settings } = useConnectionSettings();
  const knownConnections = useKnownConnections();
  const activeConnection = useMemo(() => [{ ...settings, endpoint }], [endpoint, settings]);
  const activeAvailability = useConnectionAvailabilities(activeConnection);
  const connectionAvailabilities = useMemo(
    () => ({
      ...Object.fromEntries(
        knownConnections.map((connection) => [connection.endpoint, connection.availability]),
      ),
      ...activeAvailability,
    }),
    [activeAvailability, knownConnections],
  );
  const switchConnection = useSwitchConnection();
  const [createKind, setCreateKind] = useState<'workspace' | 'session' | null>(null);
  const [renameTarget, setRenameTarget] = useState<ResourceTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResourceTarget | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [workspaceEditorId, setWorkspaceEditorId] = useState<string>();
  const importInputRef = useRef<HTMLInputElement>(null);
  // The workspace chosen by "Import conversation here"; the service files the
  // import there when the blob names an existing workspace.
  const importWorkspaceRef = useRef<string | undefined>(undefined);

  const navigate = useNavigate();
  const draftMatch = useMatch('/workspaces/:workspaceId/new');
  // A new conversation is a draft in place; it becomes a row once it is sent.
  const openNewSession = (workspaceId = activeWorkspaceId) => {
    void navigate(newConversationRoute(workspaceId || 'ws_default'));
  };
  const downloadSession = async (
    sessionId: string,
    title: string,
    mode: import('@clio/core/v3').SessionExportMode,
  ) => downloadSessionExport(actions, settings.endpoint, sessionId, title, mode);
  const runNavigationAction = (action: () => Promise<void>, success: string) => {
    void action()
      .then(() => toast.success(success))
      .catch((reason: unknown) => {
        console.error('Navigation action failed', reason);
        toast.error(reason instanceof Error ? reason.message : String(reason), {
          duration: Infinity,
          closeButton: true,
        });
      });
  };
  const switchService = async (connection: ConnectionSettings) => {
    try {
      await switchConnection(connection);
    } catch (error) {
      toast.error('Could not switch agent service', {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // 'import-session' and 'export-session' used to also be reachable via the
  // native File menu (removed — see menu_spec.rs's application-menu trim);
  // the direct paths below (the header's import button, per-session export)
  // already cover them, so no useMenuAction registration is needed for
  // either.
  const importSession = (workspaceId?: string) => {
    importWorkspaceRef.current = workspaceId;
    importInputRef.current?.click();
  };
  useMenuAction('new-session', () => openNewSession());
  useShortcut('new-conversation-browser', () => openNewSession(), { allowInTextField: true });
  useShortcut('import-conversation', () => importSession(), {
    allowInTextField: true,
  });
  useShortcut('previous-conversation', () => stepConversation(-1), { allowInTextField: true });
  useShortcut('next-conversation', () => stepConversation(1), { allowInTextField: true });
  useEffect(() => {
    const open = () => openNewSession();
    window.addEventListener('clio:new-session', open);
    return () => window.removeEventListener('clio:new-session', open);
  });

  return (
    <>
      <ClioAttentionNotifier
        activeSessionId={activeSessionId}
        attentions={attentions}
        sessions={sessions}
      />
      <Sidebar collapsible="icon" contained>
        <nav
          aria-label="Workspace navigation"
          data-keyboard-region=""
          className="flex h-full min-w-0 flex-1 flex-col"
        >
          <NavigationHeader
            activeLabel={settings.label}
            activeLocation={settings.location}
            attentionControl={
              <li className="shrink-0">
                <ClioAttentionCenter
                  activeSessionId={activeSessionId}
                  attentions={attentions}
                  sessions={sessions}
                  workspaces={workspaces}
                />
              </li>
            }
            currentPath={location.pathname}
            connectionAvailabilities={connectionAvailabilities}
            endpoint={endpoint}
            onConnect={switchService}
            onImportSession={() => importSession()}
            onNewSession={() => openNewSession()}
            connections={knownConnections}
          />
          <SidebarContent className="gap-0">
            <WorkspaceNavigation
              actions={actions}
              attentions={attentions}
              activeSessionId={activeSessionId}
              activeWorkspaceId={activeWorkspaceId}
              agents={agents}
              draftWorkspaceId={draftMatch?.params.workspaceId}
              onAction={runNavigationAction}
              onCreateSession={openNewSession}
              onDelete={setDeleteTarget}
              onDownloadSession={downloadSession}
              onEditWorkspace={setWorkspaceEditorId}
              onImportSession={importSession}
              onNewWorkspace={() => setCreateKind('workspace')}
              onOpenWorkspaceFiles={onOpenWorkspaceFiles}
              onRename={setRenameTarget}
              sessions={sessions}
              workspaces={workspaces}
            />
          </SidebarContent>
          <NavigationFooter
            availability={activeAvailability[endpoint]}
            endpoint={endpoint}
            from={location.pathname}
            onOpenArchived={() => setArchivedOpen(true)}
          />
        </nav>
        <SidebarRail />
      </Sidebar>
      <StableInput
        accept="application/json,.json"
        aria-label="Import session file"
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          const workspaceId = importWorkspaceRef.current;
          event.currentTarget.value = '';
          importWorkspaceRef.current = undefined;
          if (!file) return;
          void file
            .text()
            .then((text) => JSON.parse(text) as unknown)
            .then((value) => actions.importSession(importBlobInto(value, workspaceId)))
            .then(() => toast.success('Session imported'))
            .catch((error: unknown) =>
              toast.error(error instanceof Error ? error.message : 'Session import failed'),
            );
        }}
        ref={importInputRef}
        type="file"
      />
      <ClioResourceDialogs
        actions={actions}
        activeWorkspaceId={activeWorkspaceId}
        agents={agents}
        createKind={createKind}
        deleteTarget={deleteTarget}
        onCreateKindChange={setCreateKind}
        onDeleteTargetChange={setDeleteTarget}
        onRenameTargetChange={setRenameTarget}
        renameTarget={renameTarget}
        workspaces={workspaces}
      />
      <ClioArchivedSessionsDialog
        onDelete={actions.deleteSession}
        onOpenChange={setArchivedOpen}
        onRestore={actions.restoreSession}
        open={archivedOpen}
        sessions={sessions}
        workspaces={workspaces}
      />
      {workspaceEditorId && workspaces.find((workspace) => workspace.id === workspaceEditorId) ? (
        <WorkspaceEditorDialog
          actions={actions}
          onClose={() => setWorkspaceEditorId(undefined)}
          workspace={workspaces.find((workspace) => workspace.id === workspaceEditorId)!}
        />
      ) : null}
    </>
  );
}

/** Opens the conversation above or below the current one, in the left bar's visible order. */
function stepConversation(step: -1 | 1) {
  const links = [
    ...document.querySelectorAll<HTMLAnchorElement>('[data-session-row] a[data-active]'),
  ];
  const current = links.findIndex((link) => link.dataset.active === 'true');
  const target = current < 0 ? links[step < 0 ? links.length - 1 : 0] : links[current + step];
  target?.click();
}

/** Points an export blob at the chosen workspace, keeping its other fields. */
function importBlobInto(value: unknown, workspaceId: string | undefined): unknown {
  if (!workspaceId || typeof value !== 'object' || value === null || Array.isArray(value)) {
    return value;
  }
  const blob = value as Record<string, unknown>;
  const workspace =
    typeof blob.workspace === 'object' && blob.workspace !== null ? blob.workspace : {};
  return { ...blob, workspace: { ...workspace, id: workspaceId } };
}
