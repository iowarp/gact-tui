/**
 * Per-session runtime UI state for the live chat (e.g. the rename flash).
 * Exports small Solid signal factories like {@link createChatRenameFlash}.
 */
import { createEffect, createSignal, onCleanup, type Accessor } from 'solid-js';
import type { Message } from '@clio/core';
import { notifPrefs } from '../notif-prefs.js';
import type { SessionRow } from '../components/SessionsColumn.js';
import type { ToastInput } from '../components/Toast.js';
import type { LiveTranscriptHandle } from '../live.js';
import { completionToastBody } from './chatScreenUtils.js';

type ToastPush = (input: ToastInput) => number;

export function createChatRenameFlash() {
  const [recentlyRenamed, setRecentlyRenamed] = createSignal<{
    sid: string;
    expiry: number;
  } | null>(null);
  let renameTimer: ReturnType<typeof setTimeout> | undefined;

  function onTitleChanged(sessionId: string) {
    const expiry = Date.now() + 4500;
    setRecentlyRenamed({ sid: sessionId, expiry });
    if (renameTimer) clearTimeout(renameTimer);
    renameTimer = setTimeout(() => {
      const current = recentlyRenamed();
      if (current && Date.now() >= current.expiry) setRecentlyRenamed(null);
    }, 4600);
  }

  onCleanup(() => {
    if (renameTimer) clearTimeout(renameTimer);
  });

  return {
    onTitleChanged,
    renamedSessionId: () => recentlyRenamed()?.sid ?? null,
  };
}

export interface ChatLiveRuntimeStateOptions {
  brandName: string;
  activeId: Accessor<string>;
  rows: Accessor<SessionRow[]>;
  transcript: Pick<LiveTranscriptHandle, 'messages' | 'status' | 'lastCompletion' | 'reconnectNow'>;
  toastPush: ToastPush;
}

export function createChatLiveRuntimeState(options: ChatLiveRuntimeStateOptions) {
  const [streaming, setStreaming] = createSignal(false);

  createEffect(() => {
    const current = options.rows().find((row) => row.id === options.activeId());
    const latestAssistant = latestAssistantMessage(options.transcript.messages());
    const assistantSettled = Boolean(latestAssistant?.stop_reason || latestAssistant?.error_info);
    setStreaming(current?.status === 'running' && !assistantSettled);
  });

  let lastSseStatus: ReturnType<LiveTranscriptHandle['status']> = 'closed';
  createEffect(() => {
    const status = options.transcript.status();
    if (status === lastSseStatus) return;
    if (notifPrefs().connectionStatus) {
      if (status === 'error' && lastSseStatus !== 'error' && lastSseStatus !== 'reconnecting') {
        options.toastPush({
          tone: 'error',
          title: 'SSE disconnected',
          body: 'Lost the stream from the backend — auto-reconnect is counting down.',
          duration: 8000,
          action: {
            label: 'Reconnect now',
            onClick: () => options.transcript.reconnectNow(),
          },
        });
      }
      if (status === 'open' && lastSseStatus === 'error') {
        options.toastPush({
          tone: 'success',
          title: 'SSE reconnected',
          duration: 2500,
        });
      }
    }
    lastSseStatus = status;
  });

  let lastCompletionId: string | undefined;
  createEffect(() => {
    const completion = options.transcript.lastCompletion();
    if (!completion || completion.message_id === lastCompletionId) return;
    lastCompletionId = completion.message_id;
    const isError = completion.stop_reason === 'error';
    if (!isError && !notifPrefs().turnCompletions) return;
    options.toastPush({
      tone: isError ? 'error' : 'success',
      title: isError ? 'Turn ended in error' : `${options.brandName} responded`,
      body: isError ? 'See the message error pill for detail.' : completionToastBody(completion),
      duration: 3500,
    });
  });

  return {
    streaming,
  };
}

function latestAssistantMessage(messages: Message[]): Message | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'assistant') return message;
  }
  return undefined;
}
