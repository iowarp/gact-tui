import type { Message } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppearanceProvider } from '@/providers/appearance-provider';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
import { ClioConversation } from './conversation';
import {
  isProjectedQuestionResumeEnvelope,
  mcpAppResponseForMessage,
} from './conversation-message-projection';

vi.mock('@tanstack/react-virtual', () => ({
  defaultRangeExtractor: () => [],
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 180,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        end: (index + 1) * 180,
        index,
        key: index,
        size: 180,
        start: index * 180,
      })),
    measureElement: () => undefined,
    measure: () => undefined,
    scrollToIndex: vi.fn(),
  }),
}));

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  value: vi.fn(),
});

afterEach(cleanup);

describe('conversation message projections', () => {
  it('recognizes a native answer envelope already owned by a projected interaction', () => {
    const envelope: Message = {
      id: 'message_resume',
      session_id: 'session_1',
      role: 'user',
      created_at: '2026-09-04T00:00:00Z',
      blocks: [{ id: 'resume_text', type: 'text', text: '[Answer to agent question]' }],
      metadata: { ask_user_resume: true, ask_user_question_id: 'ques_1' },
    };
    const interaction = {
      id: 'question:ques_1',
      kind: 'question' as const,
      owner_session_id: 'session_1',
      attended_session_id: 'session_1',
      status: 'answered' as const,
      title: 'Question from agent',
      prompt: 'Which physical system should I simulate?',
      answered_by: 'human' as const,
      source: { protocol: 'native' as const, tool_name: 'ask_user', invocation_id: 'call_1' },
      created_at: '2026-09-04T00:00:00Z',
      payload: { question_id: 'ques_1', answer_metadata: { answer: 'A cantilever beam' } },
      requires_human_response: false,
      actions: [],
    };

    expect(isProjectedQuestionResumeEnvelope(envelope, [interaction])).toBe(true);
    expect(isProjectedQuestionResumeEnvelope(envelope, [])).toBe(false);
  });

  it('renders an MCP App response as its own causal ledger entry', () => {
    const appBlock = {
      id: 'app_block',
      type: 'mcp_app' as const,
      app_instance_id: 'app_1',
      resource_uri: 'ui://v2ex/panel',
      source_server: 'v2ex',
      tool_name: 'v2ex_ui_echo',
      data_ref: 'opaque',
      mime_type: 'text/html;profile=mcp-app',
    };
    const response: Message = {
      id: 'message_app_response',
      session_id: 'session_1',
      role: 'user',
      created_at: '2026-09-04T00:01:00Z',
      blocks: [{ id: 'response_text', type: 'text', text: 'Continue with this result' }],
      metadata: { mcp_app_response: { app_instance_id: 'app_1', state: 'delivered' } },
    };
    const apps = new Map([[appBlock.app_instance_id, appBlock]]);

    expect(mcpAppResponseForMessage(response, apps)).toMatchObject({
      appInstanceId: 'app_1',
      sourceServer: 'v2ex',
      state: 'delivered',
      text: 'Continue with this result',
      toolName: 'v2ex_ui_echo',
    });

    render(
      <AppearanceProvider>
        <ConversationDisplayProvider>
          <ClioConversation
            artifacts={{}}
            messages={[
              {
                id: 'message_app',
                session_id: 'session_1',
                role: 'assistant',
                created_at: '2026-09-04T00:00:00Z',
                blocks: [appBlock],
              },
              response,
            ]}
            subagents={{}}
            surfaces={{}}
            tasks={{}}
            tools={{}}
          />
        </ConversationDisplayProvider>
      </AppearanceProvider>,
    );

    expect(screen.queryByText('You', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText('You responded through V2ex ui echo')).toBeInTheDocument();
    expect(screen.getByText('Continue with this result')).toBeInTheDocument();
    expect(screen.getByText('Sent to the agent')).toBeInTheDocument();
    expect(
      document.querySelector('[data-turn-activity="mcp-app-response:message_app_response"]'),
    ).toBeInTheDocument();
  });
});
