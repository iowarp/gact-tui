import { describe, expect, it } from 'vitest';
import type { Message } from '@clio/core';
import {
  connectionToneForStatus,
  hasSessionInventory,
  inspectorTargetMessage,
  latestAssistantMessage,
  previewWorkspaceIdForSession,
  shouldShowSessionsColumn,
} from '../../src/routes/chatLayoutSelectionModel.js';

const user: Message = { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'hi' }] } as Message;
const firstAssistant: Message = {
  id: 'a1',
  role: 'assistant',
  parts: [{ type: 'text', text: 'one' }],
} as Message;
const secondAssistant: Message = {
  id: 'a2',
  role: 'assistant',
  parts: [{ type: 'text', text: 'two' }],
} as Message;

describe('chatLayoutSelectionModel', () => {
  it('finds the latest assistant message from the transcript', () => {
    expect(latestAssistantMessage([user])).toBeNull();
    expect(latestAssistantMessage([user, firstAssistant, secondAssistant])).toBe(secondAssistant);
  });

  it('uses an explicit inspector target before falling back to the latest assistant', () => {
    const messages = [user, firstAssistant, secondAssistant];
    expect(inspectorTargetMessage(messages, 'a1')).toBe(firstAssistant);
    expect(inspectorTargetMessage(messages, 'missing')).toBe(secondAssistant);
    expect(inspectorTargetMessage([user], '')).toBeNull();
  });

  it('maps stream status to the topbar connection tone', () => {
    expect(connectionToneForStatus('open')).toBe('ok');
    expect(connectionToneForStatus('connecting')).toBe('warn');
    expect(connectionToneForStatus('reconnecting')).toBe('warn');
    expect(connectionToneForStatus('error')).toBe('err');
    expect(connectionToneForStatus('closed')).toBe('idle');
    expect(connectionToneForStatus(undefined)).toBe('idle');
  });

  it('derives session inventory and sessions-column visibility', () => {
    expect(hasSessionInventory(false, 0, '')).toBe(false);
    expect(hasSessionInventory(true, 0, '')).toBe(true);
    expect(hasSessionInventory(false, 1, '')).toBe(true);
    expect(hasSessionInventory(false, 0, 'sid_1')).toBe(true);

    expect(
      shouldShowSessionsColumn({
        railRoute: 'sessions',
        sessionsOpen: true,
        sessionCount: 0,
        activeId: '',
      }),
    ).toBe(true);
    expect(
      shouldShowSessionsColumn({
        railRoute: 'plugins',
        sessionsOpen: true,
        sessionCount: 1,
        activeId: '',
      }),
    ).toBe(false);
    expect(
      shouldShowSessionsColumn({
        railRoute: 'sessions',
        sessionsOpen: false,
        sessionCount: 1,
        activeId: '',
      }),
    ).toBe(false);
  });

  it('scopes preview rail to the active session workspace before workspace filter fallback', () => {
    const sessions = [
      { id: 's1', workspace: 'workspace-a' },
      { id: 's2', workspace: 'workspace-b' },
    ];

    expect(
      previewWorkspaceIdForSession({
        sessions,
        activeId: 's2',
        selectedWorkspaceId: 'workspace-a',
      }),
    ).toBe('workspace-b');

    expect(
      previewWorkspaceIdForSession({
        sessions,
        activeId: 'missing',
        selectedWorkspaceId: 'workspace-a',
      }),
    ).toBe('workspace-a');

    expect(
      previewWorkspaceIdForSession({
        sessions,
        activeId: 'missing',
        selectedWorkspaceId: '__all',
      }),
    ).toBeUndefined();
  });
});
