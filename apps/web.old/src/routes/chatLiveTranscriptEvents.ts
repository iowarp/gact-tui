/**
 * Bridges live transcript SSE signals (notifications, refresh hooks) into
 * ChatLayout side effects. Exports {@link createChatLiveTranscriptEvents}.
 */
import type { NotificationSink, SessionEventSink } from '../live.js';
import type { ToastInput } from '../components/Toast.js';
import { toastInputForLiveNotification } from './chatNotificationToasts.js';

type ToastPush = (input: ToastInput) => number;

export interface ChatLiveTranscriptEventsOptions {
  sessionEvents: SessionEventSink;
  refetchFrames: () => unknown;
  refetchContextFiles: () => unknown;
  refetchSessionDiffs: () => unknown;
  toastPush: ToastPush;
}

export function createChatLiveTranscriptEvents(
  options: ChatLiveTranscriptEventsOptions,
): SessionEventSink & Partial<NotificationSink> {
  return {
    ...options.sessionEvents,
    onFrameChanged: () => {
      void options.refetchFrames();
    },
    onContextFilesChanged: () => {
      void options.refetchContextFiles();
    },
    onDiffChanged: () => {
      void options.refetchSessionDiffs();
    },
    onMemoryChanged: () => undefined,
    onNotification: (notification) =>
      options.toastPush(toastInputForLiveNotification(notification)),
  };
}
