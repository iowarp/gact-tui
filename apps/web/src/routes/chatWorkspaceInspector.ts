/**
 * Owns the workspace-inspector data/actions for ChatLayout. Exports
 * {@link createChatWorkspaceInspector}.
 */
import type { SettingsContext, SettingsSection } from './SettingsShell.js';
import { createSignal } from 'solid-js';
import type { ChatLiveCore } from './chatLiveCore.js';
import { createChatSessionInspectorData } from './chatSessionInspectorData.js';
import { createChatSessionListState } from './chatSessionListState.js';
import { createChatWorkspaceSemantics } from './chatWorkspaceSemantics.js';

/**
 * Workspace controls + the per-session inspector data, grouped because they are
 * mutually dependent: creating a session through the workspace semantics needs
 * to refetch the inspector's bindings, and the inspector reads the active
 * workspace id resolved by the workspace controls. They also share the session
 * list, so this factory owns that too and hands it back to the coordinator.
 */
export interface ChatWorkspaceInspectorOptions {
  core: ChatLiveCore;
  /** Live message count for the active session (drives inspector gating). */
  messageCount: () => number;
  onOpenSettings?: (section?: SettingsSection, context?: SettingsContext) => void;
}

export function createChatWorkspaceInspector(options: ChatWorkspaceInspectorOptions) {
  const { core } = options;
  const [blueprintLabels, setBlueprintLabels] = createSignal<Record<string, string>>({});

  const sessionList = createChatSessionListState({
    backendUrl: core.backendUrl,
    sessions: () => core.live.sessions() ?? [],
    blueprintLabels,
    activeId: core.activeId,
    setActiveId: core.setActiveId,
    patchSessionMetadata: (id, pinned) =>
      core.live.client.patchSession(id, { metadata: { pinned } }),
    toastPush: core.toastPush,
  });

  // Forward declaration: the workspace controls created below reference the
  // inspector's `refetchBindings` lazily, while the inspector reads the
  // workspace's `activeWorkspaceId`. Tie the knot via this holder.
  let inspectorData: ReturnType<typeof createChatSessionInspectorData>;

  const workspaceControls = createChatWorkspaceSemantics({
    client: core.live.client,
    rows: sessionList.rows,
    activeId: core.activeId,
    setActiveId: core.setActiveId,
    refetchSessions: core.live.refetch,
    setSessionBlueprintLabel: (sessionId, label) =>
      setBlueprintLabels((prev) => ({ ...prev, [sessionId]: label })),
    onSessionCreated: () => void inspectorData.refetchBindings(),
    onOpenSettings: options.onOpenSettings,
    failToast: core.failToast,
  });

  inspectorData = createChatSessionInspectorData({
    activeId: core.activeId,
    messageCount: options.messageCount,
    activeWorkspaceId: workspaceControls.activeWorkspaceId,
    client: core.live.client,
    toastPush: core.toastPush,
    failToast: core.failToast,
  });

  return { sessionList, workspaceControls, inspectorData };
}
