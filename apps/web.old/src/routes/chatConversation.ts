/**
 * Conversation state/actions container for the chat pane: owns the message
 * feed wiring and submit/regenerate plumbing. Exports {@link createChatConversation}.
 */
import { createMemo, createResource } from 'solid-js';
import type { SlashCommandDef } from '@clio/core';
import { createLiveTranscript } from '../live.js';
import type { SettingsSection } from './SettingsShell.js';
import type { ChatLiveCore } from './chatLiveCore.js';
import { createChatLiveRuntimeState } from './chatLiveRuntimeState.js';
import { createChatLiveTranscriptEvents } from './chatLiveTranscriptEvents.js';
import { createChatMessageActions } from './chatMessageActions.js';
import { createChatModelControls } from './chatModelControls.js';
import { createChatSessionListState } from './chatSessionListState.js';
import { createChatTurnActions } from './chatTurnActions.js';
import { createChatWorkspaceSemantics } from './chatWorkspaceSemantics.js';

/**
 * Everything that drives the live conversation pane: the SSE transcript stream,
 * the derived runtime state (streaming flag, completion toasts), the turn
 * actions (send / permission / question / stop), per-message actions
 * (copy / regenerate / edit …), model + permission-mode controls, and the live
 * slash-command list. These all hang off the transcript stream, so they are
 * built together once its cross-group refetch callbacks are wired.
 */
export interface ChatConversationOptions {
  core: ChatLiveCore;
  sessionList: ReturnType<typeof createChatSessionListState>;
  workspaceControls: ReturnType<typeof createChatWorkspaceSemantics>;
  /** Inspector refetch hooks the transcript stream fans out to on relevant events. */
  refetchFrames: () => void;
  refetchContextFiles: () => void;
  refetchSessionDiffs: () => void;
  onOpenSettings?: (section?: SettingsSection) => void;
}

export function createChatConversation(options: ChatConversationOptions) {
  const { core, sessionList, workspaceControls } = options;

  const transcript = createLiveTranscript(
    core.live.client,
    core.activeId,
    createChatLiveTranscriptEvents({
      sessionEvents: {
        patch: core.live.patch,
        setRaw: core.live.setRaw,
        refetch: core.live.refetch,
        onTitleChanged: core.renameFlash.onTitleChanged,
      },
      refetchFrames: options.refetchFrames,
      refetchContextFiles: options.refetchContextFiles,
      refetchSessionDiffs: options.refetchSessionDiffs,
      toastPush: core.toastPush,
    }),
  );

  const liveRuntime = createChatLiveRuntimeState({
    brandName: core.brandName,
    activeId: core.activeId,
    rows: sessionList.rows,
    transcript,
    toastPush: core.toastPush,
  });

  const modelControls = createChatModelControls({
    activeId: core.activeId,
    client: core.live.client,
  });

  const turnActions = createChatTurnActions({
    client: core.live.client,
    activeId: core.activeId,
    createSessionWithSemantics: workspaceControls.createSessionWithSemantics,
    selectedModel: modelControls.selectedModel,
    permMode: modelControls.permMode,
    pendingPermission: transcript.pendingPermission,
    clearPendingPermission: transcript.clearPendingPermission,
    pendingQuestion: transcript.pendingQuestion,
    refetchTranscript: transcript.refetch,
    refetchSessions: core.live.refetch,
    toastPush: core.toastPush,
    failToast: core.failToast,
    onOpenSettings: options.onOpenSettings,
  });

  const messageActions = createChatMessageActions({
    activeId: core.activeId,
    streaming: liveRuntime.streaming,
    client: core.live.client,
    refetchTranscript: transcript.refetch,
    toastPush: core.toastPush,
    failToast: core.failToast,
  });

  // Live slash commands (powers Cmd+K palette dynamic list).
  const [commandsData] = createResource(() => core.live.client.commands());
  const slashCommands = createMemo<SlashCommandDef[]>(() => commandsData()?.commands ?? []);

  return { transcript, liveRuntime, turnActions, modelControls, messageActions, slashCommands };
}
