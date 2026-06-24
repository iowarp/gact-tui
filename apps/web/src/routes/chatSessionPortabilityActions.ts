/**
 * Action factory for session import/export (portability). Exports
 * {@link createChatSessionPortabilityActions}.
 */
import type { Client } from '@clio/core';
import type { SessionRow } from '../components/SessionsColumn.js';
import type { ToastInput } from '../components/Toast.js';
import { sessionToMarkdown } from './chatSessionMarkdown.js';

export interface ChatSessionPortabilityActionsOptions {
  client: Pick<Client, 'exportSession' | 'forkSession' | 'importSession' | 'shareSession'>;
  backendUrl: string;
  rows: () => SessionRow[];
  setActiveId: (id: string) => void;
  refetchSessions: () => void;
  toastPush: (input: ToastInput) => number;
  failToast: (title: string, error: unknown, retry?: () => void) => void;
  createObjectUrl?: (blob: Blob) => string;
  revokeObjectUrl?: (url: string) => void;
  appendDownloadAnchor?: (anchor: HTMLAnchorElement) => void;
  clickDownloadAnchor?: (anchor: HTMLAnchorElement) => void;
  removeDownloadAnchor?: (anchor: HTMLAnchorElement) => void;
  writeClipboard?: (text: string) => Promise<unknown>;
}

export function createChatSessionPortabilityActions(options: ChatSessionPortabilityActionsOptions) {
  async function importSession(blob: Record<string, unknown>) {
    try {
      const created = await options.client.importSession(blob);
      options.refetchSessions();
      options.setActiveId(created.id);
      options.toastPush({
        tone: 'success',
        title: 'Session imported',
        body: created.title ?? created.id,
        duration: 3000,
      });
    } catch (error) {
      options.failToast('Import failed', error, () => void importSession(blob));
    }
  }

  async function exportSession(id: string, format: 'json' | 'md' = 'json') {
    try {
      const payload = await options.client.exportSession(id);
      const body = format === 'md' ? sessionToMarkdown(payload) : JSON.stringify(payload, null, 2);
      const mime = format === 'md' ? 'text/markdown' : 'application/json';
      const ext = format === 'md' ? 'md' : 'json';
      const blob = new Blob([body], { type: mime });
      const createObjectUrl =
        options.createObjectUrl ?? ((nextBlob: Blob) => URL.createObjectURL(nextBlob));
      const revokeObjectUrl =
        options.revokeObjectUrl ?? ((url: string) => URL.revokeObjectURL(url));
      const appendDownloadAnchor =
        options.appendDownloadAnchor ??
        ((anchor: HTMLAnchorElement) => document.body.appendChild(anchor));
      const clickDownloadAnchor =
        options.clickDownloadAnchor ?? ((anchor: HTMLAnchorElement) => anchor.click());
      const removeDownloadAnchor =
        options.removeDownloadAnchor ??
        ((anchor: HTMLAnchorElement) => document.body.removeChild(anchor));
      const url = createObjectUrl(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `clio-session-${id}.${ext}`;
      appendDownloadAnchor(anchor);
      clickDownloadAnchor(anchor);
      removeDownloadAnchor(anchor);
      revokeObjectUrl(url);
      options.toastPush({
        tone: 'success',
        title: 'Session exported',
        body: `clio-session-${id}.${ext}`,
        duration: 3000,
      });
    } catch (error) {
      options.failToast('Export failed', error, () => void exportSession(id, format));
    }
  }

  async function shareSession(id: string) {
    try {
      const { token, url: shareUrl } = await options.client.shareSession(id);
      const link = shareUrl ?? `${new URL(options.backendUrl).origin}/v1/shared/${token}`;
      const writeClipboard =
        options.writeClipboard ??
        ((text: string) =>
          typeof navigator !== 'undefined' && navigator.clipboard
            ? navigator.clipboard.writeText(text).catch(() => undefined)
            : Promise.resolve());
      await writeClipboard(link);
      options.toastPush({
        tone: 'success',
        title: 'Share link copied',
        body: link,
        duration: 5000,
      });
    } catch (error) {
      options.failToast('Share failed', error, () => void shareSession(id));
    }
  }

  async function forkSession(id: string) {
    try {
      const original = options.rows().find((row) => row.id === id);
      const created = await options.client.forkSession(id, {
        title: original ? `Fork of ${original.title}` : 'Forked session',
      });
      options.refetchSessions();
      options.setActiveId(created.id);
      options.toastPush({
        tone: 'success',
        title: 'Session forked',
        body: `New session: ${created.title}`,
        duration: 3000,
      });
    } catch (error) {
      options.failToast('Fork failed', error, () => void forkSession(id));
    }
  }

  return {
    importSession,
    exportSession,
    shareSession,
    forkSession,
  };
}
