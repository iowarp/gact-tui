import { createRoot } from 'solid-js';
import { describe, expect, it, vi } from 'vitest';
import type { Message } from '@clio/core';
import type { ChatLayoutProps } from '../../src/routes/ChatLayoutTypes.js';
import { createChatLayoutDerivedState } from '../../src/routes/chatLayoutDerivedState.js';

const assistantMessage: Message = {
  id: 'a1',
  role: 'assistant',
  parts: [{ type: 'text', text: 'hello' }],
} as Message;

function minimalProps(overrides: Partial<ChatLayoutProps> = {}): ChatLayoutProps {
  return {
    backendUrl: 'http://localhost:17800',
    voiceCapable: false,
    sessions: [
      {
        id: 's1',
        title: 'First session',
        status: 'idle',
        updatedAt: 'just now',
        workspace: 'workspace-a',
      },
    ],
    activeId: 's1',
    onSelect: vi.fn(),
    density: 'normal',
    setDensity: vi.fn(),
    messages: [assistantMessage],
    pendingPermission: null,
    pendingQuestion: null,
    composerDisabled: false,
    selectedWorkspaceId: 'workspace-fallback',
    ...overrides,
  } as ChatLayoutProps;
}

describe('createChatLayoutDerivedState', () => {
  it('derives layout selectors from chat props and UI state', () => {
    createRoot((dispose) => {
      let railRoute: 'sessions' | 'agents' = 'sessions';
      let sessionsOpen = true;
      const props = minimalProps({ sseStatus: 'open' });

      const state = createChatLayoutDerivedState({
        props,
        railRoute: () => railRoute,
        sessionsOpen: () => sessionsOpen,
        selectedMessageId: () => '',
        setSessionsOpen: (next) => {
          sessionsOpen = typeof next === 'function' ? next(sessionsOpen) : next;
          return sessionsOpen;
        },
      });

      expect(state.activeRow()?.title).toBe('First session');
      expect(state.inspectorTarget()).toBe(assistantMessage);
      expect(state.connectionTone()).toBe('ok');
      expect(state.onChat()).toBe(true);
      expect(state.showSessionsColumn()).toBe(true);
      expect(state.previewWorkspaceId()).toBe('workspace-a');
      expect(state.emptyTranscript()).toBe(false);

      railRoute = 'agents';
      expect(state.onChat()).toBe(false);
      expect(state.showSessionsColumn()).toBe(false);

      dispose();
    });
  });

  it('selects a session and closes the sessions column on narrow viewports', () => {
    createRoot((dispose) => {
      const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue({
        matches: true,
        media: '(max-width: 760px)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      });
      let sessionsOpen = true;
      const onSelect = vi.fn();
      const props = minimalProps({ onSelect });
      const state = createChatLayoutDerivedState({
        props,
        railRoute: () => 'sessions',
        sessionsOpen: () => sessionsOpen,
        selectedMessageId: () => '',
        setSessionsOpen: (next) => {
          sessionsOpen = typeof next === 'function' ? next(sessionsOpen) : next;
          return sessionsOpen;
        },
      });

      state.selectFromSessionsColumn('s2');

      expect(onSelect).toHaveBeenCalledWith('s2');
      expect(sessionsOpen).toBe(false);

      matchMedia.mockRestore();
      dispose();
    });
  });
});
