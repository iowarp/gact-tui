/**
 * Wires the live-backend ChatScreen to the LiveTranscript handle: drives the
 * active session, transcript events, and command execution.
 */
import { createMemo } from 'solid-js';
import type { BackendHandle } from '../App.js';
import { chatBackendFeatureGates } from './ChatScreenModel.js';
import { createChatInspectorConversationWiring } from './chatInspectorConversationWiring.js';
import { createChatLiveCore } from './chatLiveCore.js';
import { createChatSessionOps } from './chatSessionOps.js';
import type { SettingsContext, SettingsSection } from './SettingsShell.js';

export interface ChatScreenLiveDrivenProps {
  backend: BackendHandle;
  // Accepts a section so error toasts can deep-link (e.g. 'providers'
  // when a send fails because no LM is configured).
  onOpenSettings?: (section?: SettingsSection, context?: SettingsContext) => void;
  onAddRemote?: () => void;
}

/**
 * Thin coordinator for the live chat screen. It builds the shared
 * {@link createChatLiveCore} primitives once, then composes four cohesive
 * concern factories:
 *
 *  - {@link createChatWorkspaceInspector} — workspace controls + per-session
 *    inspector data + the session list.
 *  - {@link createChatConversation} — transcript stream, runtime state, turn /
 *    message / model actions, slash commands.
 *  - {@link createChatSessionOps} — whole-session lifecycle actions.
 *
 * The only cross-group knot — the inspector reads the live message count off
 * the transcript while the transcript fans its refetch events back into the
 * inspector — is owned by {@link createChatInspectorConversationWiring}, so the
 * coordinator stays free of forward `let`s. The exported shape is the flat
 * record `ChatScreenLiveDriven` consumes — unchanged.
 */
export function createChatScreenLiveController(props: ChatScreenLiveDrivenProps) {
  const core = createChatLiveCore(props.backend);

  // (Previously had an "orphan detector" + focus refetch here. They
  // raced with the initial sessions resource load and flipped
  // activeId between the real id and '', which both tore down the
  // SSE transcript stream and swapped the composer draft key - so
  // every keystroke in the textarea got wiped a tick later. Removed.)

  const { sessionList, workspaceControls, inspectorData, conversation } =
    createChatInspectorConversationWiring({
      core,
      onOpenSettings: props.onOpenSettings,
    });

  const { sessionActions } = createChatSessionOps({
    core,
    rows: sessionList.rows,
    refetchTranscript: conversation.transcript.refetch,
  });

  const backendGates = createMemo(() => chatBackendFeatureGates(props.backend.capabilities));

  return {
    activeId: core.activeId,
    setActiveId: core.setActiveId,
    density: core.density,
    setDensity: core.setDensity,
    live: core.live,
    liveRuntime: conversation.liveRuntime,
    workspaceControls,
    turnActions: conversation.turnActions,
    sessionActions,
    sessionList,
    modelControls: conversation.modelControls,
    inspectorData,
    messageActions: conversation.messageActions,
    transcript: conversation.transcript,
    slashCommands: conversation.slashCommands,
    backendGates,
    renameFlash: core.renameFlash,
  };
}
