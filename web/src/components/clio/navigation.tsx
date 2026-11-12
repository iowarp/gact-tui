import type { AgentEntry, Session, Workspace } from '@clio/core/v3';
import { useShortcut } from '@/lib/shortcuts/hooks';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useMatch, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Sidebar, SidebarContent, SidebarRail, useSidebar } from '@/components/ui/sidebar';
import { useClioMenuConnections } from '@/hooks/use-clio-menu-connections';
import { LeftBarDialogContext } from '@/hooks/use-left-bar-dialog';
import { useRailKeyboard } from '@/hooks/use-rail-keyboard';
import { useArchivedSessions } from '@/hooks/use-rail-sessions';
import type { ListState } from '@/lib/list-state';
import { useMenuAction } from '@/tauri/menu-actions';
import { ClioArchivedSessionsDialog } from './archived-sessions-dialog';
import { ClioAttentionCenter, ClioAttentionNotifier } from './attention-center';
import { NavigationFooter } from './navigation-footer';
import { NavigationHeader } from './navigation-header';
import { StableInput } from './primitives/stable-input';
import { holdPreviews } from './row-preview-hold';
import { ClioResourceDialogs, type ResourceActions, type ResourceTarget } from './resource-dialogs';
import { WorkspaceEditorDialog } from './workspace-editor-dialog';
import { WorkspaceNavigation } from './workspace-navigation';
import { downloadSessionExport } from './session-export-download';
import { newConversationRoute } from '@/lib/workspace-route-memory';
import type { SessionAttention } from '@/lib/session-attention';
import { tourAnchor } from '@/lib/onboarding/tour-anchors';

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
  /** The workspace list's loading or failure, while it lists none. */
  workspacesState?: ListState;
  /** The conversation an unsent draft already became (it owns source work); the draft row stands for it. */
  draftSessionId?: string;
}

const NO_ITEMS: readonly never[] = [];

/**
 * The left bar. Its pages re-render on every keystroke in the draft and every
 * streamed update; the bar renders only when what it lists changes. Callbacks
 * and the list state's retry are read at call time, so inline ones from the
 * page don't count as a change.
 */
export function ClioNavigation(props: ClioNavigationProps) {
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const openWorkspaceFiles = useCallback(() => latest.current.onOpenWorkspaceFiles?.(), []);
  const retryWorkspaces = useCallback(() => latest.current.workspacesState?.retry(), []);
  const listed = props.workspacesState !== undefined;
  const loading = props.workspacesState?.loading ?? false;
  const error = props.workspacesState?.error;
  const workspacesState = useMemo(
    () => (listed ? { loading, error, retry: retryWorkspaces } : undefined),
    [listed, loading, error, retryWorkspaces],
  );
  return (
    <ClioNavigationView
      {...props}
      agents={props.agents.length ? props.agents : NO_ITEMS}
      onOpenWorkspaceFiles={props.onOpenWorkspaceFiles ? openWorkspaceFiles : undefined}
      sessions={props.sessions.length ? props.sessions : NO_ITEMS}
      workspaces={props.workspaces.length ? props.workspaces : NO_ITEMS}
      workspacesState={workspacesState}
    />
  );
}

const ClioNavigationView = memo(function ClioNavigationView({
  endpoint,
  workspaces,
  sessions,
  activeWorkspaceId,
  activeSessionId,
  actions,
  agents,
  onOpenWorkspaceFiles,
  attentions,
  workspacesState,
  draftSessionId,
}: ClioNavigationProps) {
  const location = useLocation();
  const {
    settings,
    connections: knownConnections,
    connectionAvailabilities,
    onConnect: switchService,
  } = useClioMenuConnections(endpoint);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ResourceTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ResourceTarget | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const archived = useArchivedSessions(sessions, archivedOpen);
  const [workspaceEditorId, setWorkspaceEditorId] = useState<string>();
  // On a phone the left bar is a sheet; a dialog opened from it closes the sheet first.
  const { isMobile, setOpenMobile } = useSidebar();
  const closeSheet = useCallback(() => {
    if (isMobile) setOpenMobile(false);
  }, [isMobile, setOpenMobile]);
  const withSheetClosed =
    <T,>(open: (value: T) => void) =>
    (value: T) => {
      closeSheet();
      open(value);
    };
  const [rowDialog, setRowDialog] = useState<ReactNode>(null);
  const presentRowDialog = useCallback(
    (dialog: ReactNode) => {
      if (dialog) closeSheet();
      setRowDialog(dialog);
    },
    [closeSheet],
  );
  const importInputRef = useRef<HTMLInputElement>(null);
  const navRef = useRef<HTMLElement>(null);
  useRailKeyboard(navRef);
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
      <LeftBarDialogContext.Provider value={presentRowDialog}>
        <Sidebar collapsible="icon" contained>
          <nav
            aria-label="Workspace navigation"
            data-keyboard-region=""
            // Wheeling moves rows under a still pointer; their previews wait for it to move.
            onWheel={(event) => holdPreviews(event.clientX, event.clientY)}
            ref={navRef}
            {...tourAnchor('workspace-navigation')}
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
                draftSessionId={draftMatch ? draftSessionId : undefined}
                onAction={runNavigationAction}
                onCreateSession={openNewSession}
                onDelete={withSheetClosed(setDeleteTarget)}
                onDownloadSession={downloadSession}
                onEditWorkspace={withSheetClosed(setWorkspaceEditorId)}
                onImportSession={importSession}
                onNewWorkspace={() => withSheetClosed(setCreateWorkspaceOpen)(true)}
                onOpenWorkspaceFiles={onOpenWorkspaceFiles}
                onRename={withSheetClosed(setRenameTarget)}
                sessions={sessions}
                workspaces={workspaces}
                workspacesState={workspacesState}
              />
            </SidebarContent>
            <NavigationFooter
              availability={connectionAvailabilities[endpoint]}
              endpoint={endpoint}
              from={location.pathname}
              onOpenArchived={() => withSheetClosed(setArchivedOpen)(true)}
            />
          </nav>
          <SidebarRail />
        </Sidebar>
      </LeftBarDialogContext.Provider>
      {rowDialog}
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
              // A file that isn't JSON is the person's choice, not a parser fault.
              toast.error(`Couldn't import ${file.name}`, {
                description:
                  error instanceof SyntaxError
                    ? "This file isn't a conversation export. Choose a .json file exported from a conversation."
                    : error instanceof Error && error.message
                      ? error.message
                      : 'The session could not be imported.',
              }),
            );
        }}
        ref={importInputRef}
        type="file"
      />
      <ClioResourceDialogs
        actions={actions}
        createWorkspaceOpen={createWorkspaceOpen}
        deleteTarget={deleteTarget}
        onCreateWorkspaceOpenChange={setCreateWorkspaceOpen}
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
        sessions={archived.sessions}
        state={archived.state}
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
});

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
