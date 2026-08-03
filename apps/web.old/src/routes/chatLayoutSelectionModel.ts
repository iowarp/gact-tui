/**
 * Selection and connection-status types/helpers for the ChatLayout (active
 * session/message selection and SSE connection tone).
 */
import type { Message } from '@clio/core';
import type { RailRoute } from '../components/LeftRail.js';

export type ConnectionTone = 'ok' | 'warn' | 'err' | 'idle';
export type SseConnectionStatus = 'connecting' | 'open' | 'closed' | 'error' | 'reconnecting';

export function latestAssistantMessage(messages: readonly Message[]): Message | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message && message.role === 'assistant') return message;
  }
  return null;
}

export function inspectorTargetMessage(
  messages: readonly Message[],
  selectedMessageId: string,
): Message | null {
  if (selectedMessageId) {
    const message = messages.find((candidate) => candidate.id === selectedMessageId);
    if (message) return message;
  }
  return latestAssistantMessage(messages);
}

export function connectionToneForStatus(status: SseConnectionStatus | undefined): ConnectionTone {
  switch (status) {
    case 'open':
      return 'ok';
    case 'connecting':
    case 'reconnecting':
      return 'warn';
    case 'error':
      return 'err';
    case 'closed':
    default:
      return 'idle';
  }
}

export function hasSessionInventory(
  sessionsLoading: boolean | undefined,
  sessionCount: number,
  activeId: string,
): boolean {
  return sessionsLoading === true || sessionCount > 0 || activeId.length > 0;
}

export function shouldShowSessionsColumn(input: {
  railRoute: RailRoute;
  sessionsOpen: boolean;
  sessionsLoading?: boolean;
  sessionCount: number;
  activeId: string;
}): boolean {
  void input.sessionsLoading;
  void input.sessionCount;
  void input.activeId;
  return input.railRoute === 'sessions' && input.sessionsOpen;
}

export function previewWorkspaceIdForSession(input: {
  sessions: readonly { id: string; workspace?: string }[];
  activeId: string;
  selectedWorkspaceId?: string;
}): string | undefined {
  const activeWorkspaceId = input.sessions.find(
    (session) => session.id === input.activeId,
  )?.workspace;
  if (activeWorkspaceId) return activeWorkspaceId;
  return input.selectedWorkspaceId === '__all' ? undefined : input.selectedWorkspaceId;
}
