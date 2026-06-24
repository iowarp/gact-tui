/**
 * Composes the lower-level session action factories into one session-ops
 * service for ChatLayout. Exports {@link createChatSessionOps}.
 */
import type { LiveTranscriptHandle } from '../live.js';
import type { ChatLiveCore } from './chatLiveCore.js';
import { createChatSessionActions } from './chatSessionActions.js';
import { createChatSessionListState } from './chatSessionListState.js';

/**
 * Whole-session lifecycle actions: import, rename, delete, fork, export, share,
 * summarize, undo, compact, extract-agent and slash-command runs. These mutate
 * the session list and the active transcript, so the factory wires them onto
 * the live session resource (patch / remove rows) and the transcript refetch.
 */
export interface ChatSessionOpsOptions {
  core: ChatLiveCore;
  rows: ReturnType<typeof createChatSessionListState>['rows'];
  refetchTranscript: LiveTranscriptHandle['refetch'];
}

export function createChatSessionOps(options: ChatSessionOpsOptions) {
  const { core } = options;

  const sessionActions = createChatSessionActions({
    client: core.live.client,
    backendUrl: core.backendUrl,
    brandName: core.brandName,
    activeId: core.activeId,
    setActiveId: core.setActiveId,
    rows: options.rows,
    refetchSessions: core.live.refetch,
    patchSessionRow: core.live.patch,
    removeSessionRow: (id) => core.live.setRaw((prev) => prev.filter((row) => row.id !== id)),
    refetchTranscript: options.refetchTranscript,
    toastPush: core.toastPush,
    failToast: core.failToast,
  });

  return { sessionActions };
}
