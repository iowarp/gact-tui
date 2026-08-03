/**
 * Action factory for the session diff workflow (apply/reject hunks). Exports
 * {@link createChatSessionDiffActions}.
 */
import type { Accessor } from 'solid-js';
import type { Client } from '@clio/core';
import type { ToastInput } from '../components/Toast.js';

export interface ChatSessionDiffActionsOptions {
  activeId: Accessor<string>;
  client: Pick<Client, 'applySessionDiffs' | 'rejectSessionDiffs'>;
  toastPush: (input: ToastInput) => number;
  failToast: (title: string, error: unknown, retry?: () => void) => void;
  refetchSessionDiffs: () => unknown;
  confirmReject?: (message: string) => boolean;
}

export function createChatSessionDiffActions(options: ChatSessionDiffActionsOptions) {
  async function applyAllDiffs() {
    const sid = options.activeId();
    if (!sid) return;
    try {
      const result = await options.client.applySessionDiffs(sid);
      options.toastPush({
        tone: 'success',
        title: 'Diffs applied',
        body: `${result.applied.length} file${result.applied.length === 1 ? '' : 's'}`,
        duration: 3000,
      });
      if (result.write_errors) {
        for (const [path, err] of Object.entries(result.write_errors)) {
          options.toastPush({
            tone: 'error',
            title: `Write failed: ${path}`,
            body: err,
            duration: 6000,
          });
        }
      }
      void options.refetchSessionDiffs();
    } catch (error) {
      options.failToast('Apply failed', error);
    }
  }

  async function rejectAllDiffs() {
    const sid = options.activeId();
    if (!sid) return;
    const confirmReject = options.confirmReject ?? ((message: string) => confirm(message));
    if (!confirmReject('Reject all pending diffs in this session?')) return;
    try {
      const result = await options.client.rejectSessionDiffs(sid);
      options.toastPush({
        tone: 'info',
        title: 'Diffs rejected',
        body: `${result.rejected.length} file${result.rejected.length === 1 ? '' : 's'}`,
        duration: 3000,
      });
      void options.refetchSessionDiffs();
    } catch (error) {
      options.failToast('Reject failed', error);
    }
  }

  return {
    applyAllDiffs,
    rejectAllDiffs,
  };
}
