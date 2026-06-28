/**
 * Owns the workspace semantic-selection state/actions (blueprint + expert
 * pack) for the active workspace. Exports {@link createChatWorkspaceSemantics}.
 */
import { createEffect, createMemo, createResource, type Accessor } from 'solid-js';
import type { Client } from '@clio/core';
import type { SessionRow, WorkspaceOption } from '../components/SessionsColumn.js';
import { createPersistedString } from '../persisted.js';
import {
  loadSessionSemanticsDefaults,
  sanitizeSessionSemantics,
  type SessionSemanticsSelection,
} from '../session-semantics.js';
import type { SettingsContext, SettingsSection } from './SettingsShell.js';
import {
  activeWorkspaceIdForRows,
  filterRowsForWorkspace,
  semanticOptionsFromResult,
  semanticsCatalogScope,
  workspaceOptionsFromRows,
} from './chatWorkspaceSemanticsModel.js';

export interface ChatWorkspaceSemanticsOptions {
  client: Client;
  rows: Accessor<SessionRow[]>;
  activeId: Accessor<string>;
  setActiveId: (id: string) => void;
  refetchSessions: () => void;
  onSessionCreated?: () => void;
  onOpenSettings?: (section?: SettingsSection, context?: SettingsContext) => void;
  failToast: (title: string, error: unknown, retry?: () => void) => void;
}

export function createChatWorkspaceSemantics(options: ChatWorkspaceSemanticsOptions) {
  const [workspacesData] = createResource(() => options.client.workspaces());
  const workspaces = createMemo<WorkspaceOption[]>(() => {
    return workspaceOptionsFromRows(workspacesData()?.workspaces ?? []);
  });
  const [selectedWorkspaceId, setSelectedWorkspaceId] = createPersistedString(
    'clio.selected-workspace.v1',
    '__all',
  );

  createEffect(() => {
    const selected = selectedWorkspaceId();
    if (selected === '__all' || workspacesData.loading) return;
    const available = workspaces();
    if (available.length === 0) return;
    if (!available.some((workspace) => workspace.id === selected)) {
      setSelectedWorkspaceId('__all');
    }
  });

  const [sessionSemanticsData, { refetch: refetchSessionSemantics }] = createResource(
    () => selectedWorkspaceId(),
    async (workspaceId) => {
      const scope = semanticsCatalogScope(workspaceId);
      const [blueprints, expertPacks] = await Promise.allSettled([
        options.client.agentBlueprints(scope),
        options.client.expertPacks(scope),
      ]);
      return {
        blueprints: semanticOptionsFromResult(blueprints, 'blueprints'),
        expertPacks: semanticOptionsFromResult(expertPacks, 'packs'),
      };
    },
  );
  const sessionSemanticsOptions = createMemo(() => sessionSemanticsData());

  const filteredRows = createMemo(() => {
    return filterRowsForWorkspace(options.rows(), selectedWorkspaceId());
  });

  const activeWorkspaceId = () =>
    activeWorkspaceIdForRows(options.rows(), options.activeId(), selectedWorkspaceId());

  async function workspaceIdForNewSession(): Promise<string | undefined> {
    const selected = selectedWorkspaceId();
    if (selected !== '__all') return selected;
    const activeWorkspace = options
      .rows()
      .find((session) => session.id === options.activeId())?.workspace;
    if (activeWorkspace) return activeWorkspace;
    const cached = workspaces()[0]?.id;
    if (cached) return cached;
    try {
      const fresh = await options.client.workspaces();
      return fresh.workspaces[0]?.id;
    } catch {
      return undefined;
    }
  }

  async function applySessionSemantics(sessionId: string, selection: SessionSemanticsSelection) {
    if (selection.blueprintId) {
      await options.client.setSessionBlueprint(sessionId, {
        blueprint_id: selection.blueprintId,
      });
    }
    if (selection.expertPackId) {
      await options.client.setSessionExpertPack(sessionId, {
        pack_id: selection.expertPackId,
      });
    }
  }

  function defaultSessionSemantics(): SessionSemanticsSelection {
    const defaults = loadSessionSemanticsDefaults();
    const available = sessionSemanticsOptions();
    if (!available) return defaults;
    return sanitizeSessionSemantics(defaults, available.blueprints, available.expertPacks);
  }

  async function createSessionWithSemantics(title: string, selection = defaultSessionSemantics()) {
    const workspaceId = await workspaceIdForNewSession();
    const created = await options.client.createSession({
      title,
      ...(workspaceId ? { workspace_id: workspaceId } : {}),
    });
    await applySessionSemantics(created.id, selection);
    options.refetchSessions();
    options.setActiveId(created.id);
    options.onSessionCreated?.();
    return created;
  }

  async function newEmptySession(selection?: SessionSemanticsSelection, title = 'New session') {
    try {
      await createSessionWithSemantics(title, selection);
    } catch (error) {
      options.failToast('Could not create session', error, () => void newEmptySession(selection, title));
      throw error;
    }
  }

  const settingsContext = (): SettingsContext => {
    const sessionId = options.activeId();
    const workspaceId = activeWorkspaceId();
    return {
      ...(sessionId ? { sessionId } : {}),
      ...(workspaceId ? { workspaceId } : {}),
    };
  };

  const openSettings = (section?: SettingsSection) => {
    options.onOpenSettings?.(section, settingsContext());
  };

  return {
    workspaces,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
    filteredRows,
    activeWorkspaceId,
    sessionSemanticsOptions,
    sessionSemanticsLoading: () => sessionSemanticsData.loading,
    refetchSessionSemantics,
    createSessionWithSemantics,
    newEmptySession,
    openSettings,
  };
}
