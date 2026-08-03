/**
 * Owns the circular knot between the workspace inspector and the conversation
 * for the live chat screen. Exports {@link createChatInspectorConversationWiring}.
 */
import { createChatConversation } from './chatConversation.js';
import { createChatWorkspaceInspector } from './chatWorkspaceInspector.js';
import type { ChatLiveCore } from './chatLiveCore.js';
import type { SettingsContext, SettingsSection } from './SettingsShell.js';

export interface ChatInspectorConversationWiringOptions {
  core: ChatLiveCore;
  onOpenSettings?: (section?: SettingsSection, context?: SettingsContext) => void;
}

/**
 * Builds the workspace inspector and the conversation, wiring up the single
 * circular dependency between them in one place:
 *
 *  - the inspector gates on the live message count, which only exists once the
 *    conversation's transcript stream is built;
 *  - the conversation fans its refetch events back into the inspector.
 *
 * The inspector is constructed first with a late-bound message-count source
 * (a mutable holder), then the conversation is built and the holder is filled
 * in. Keeping the knot in this dedicated factory makes the ordering explicit
 * and the message-count source independently testable, instead of leaking a
 * raw forward `let` into the coordinator.
 */
export function createChatInspectorConversationWiring(
  options: ChatInspectorConversationWiringOptions,
) {
  const { core } = options;

  // Late-binding seam: the inspector needs the conversation's live message
  // count, but the conversation is built after the inspector. Read through this
  // holder, which is filled in below once the conversation exists.
  let liveMessageCount: () => number = () => 0;

  const { sessionList, workspaceControls, inspectorData } = createChatWorkspaceInspector({
    core,
    messageCount: () => liveMessageCount(),
    onOpenSettings: options.onOpenSettings,
  });

  const conversation = createChatConversation({
    core,
    sessionList,
    workspaceControls,
    refetchFrames: () => inspectorData.refetchFrames(),
    refetchContextFiles: () => inspectorData.refetchContextFiles(),
    refetchSessionDiffs: () => inspectorData.refetchSessionDiffs(),
    onOpenSettings: options.onOpenSettings,
  });

  // Close the knot: now that the conversation exists, point the inspector's
  // message-count source at its transcript.
  liveMessageCount = () => conversation.transcript.messages().length;

  return { sessionList, workspaceControls, inspectorData, conversation };
}
