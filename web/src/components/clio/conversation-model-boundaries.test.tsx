import type { Message } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranscriptTestAppearance as AppearanceProvider } from '@/test/transcript-test-appearance';
import { ClioConversation } from './conversation';
import { conversationModelBoundaries } from './conversation-model-boundaries';

const luna = { provider_id: 'codex', model_id: 'gpt-6-luna' };
const claude = { provider_id: 'claude_code', model_id: 'claude-sonnet-5' };

function message(id: string, model?: Message['model'], role: Message['role'] = 'user'): Message {
  return {
    id,
    model,
    role,
    session_id: 'model_segments',
    created_at: '2026-10-06T12:00:00Z',
    blocks: [{ id: `${id}_text`, type: 'text', text: `Content for ${id}.` }],
  };
}

Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('recorded model segments', () => {
  it('marks initial identity, both kinds of change and switching back without duplicating a model', () => {
    const sol = { ...luna, model_id: 'gpt-6-sol' };
    const otherProvider = { ...sol, provider_id: 'openai' };
    const boundaries = conversationModelBoundaries([
      message('first', luna),
      message('answer', undefined, 'assistant'),
      message('repeat', { ...luna }),
      message('model_change', sol),
      message('provider_change', otherProvider),
      message('back', luna),
    ]);
    expect([...boundaries.keys()]).toEqual(['first', 'model_change', 'provider_change', 'back']);
    expect(boundaries.get('provider_change')).toEqual({ model: otherProvider, previous: sol });
    expect(boundaries.get('back')).toEqual({ model: luna, previous: otherProvider });
  });

  it('ends attribution at an unknown prompt and ignores resume and app transport envelopes', () => {
    const boundaries = conversationModelBoundaries([
      message('old'),
      message('known', luna),
      { ...message('resume'), metadata: { ask_user_resume: true } },
      { ...message('plan'), metadata: { plan_exit_resume: true } },
      { ...message('app'), metadata: { mcp_app_response: { app_instance_id: 'app' } } },
      message('unknown'),
      message('unknown_answer', undefined, 'assistant'),
      message('known_again', claude),
    ]);
    expect([...boundaries.keys()]).toEqual(['known', 'unknown', 'known_again']);
    expect(boundaries.get('unknown')).toEqual({ model: undefined, previous: luna });
    expect(boundaries.get('known_again')).toEqual({ model: claude, previous: undefined });
  });

  it('keeps boundaries stable through streaming, reload and unrelated neighbor updates', () => {
    const messages = [
      message('first', luna),
      message('answer', undefined, 'assistant'),
      message('next', claude),
    ];
    const original = conversationModelBoundaries(messages);
    const streamed = conversationModelBoundaries(
      messages.map((row) =>
        row.id === 'answer'
          ? {
              ...row,
              blocks: [
                { id: 'answer_text', type: 'text', text: 'Growing response', streaming: true },
              ],
            }
          : row,
      ),
    );
    expect(streamed).toEqual(original);
    expect(conversationModelBoundaries(JSON.parse(JSON.stringify(messages)))).toEqual(original);
  });

  it('draws a divider where the model changed, not before the first model', () => {
    render(
      <AppearanceProvider>
        <ClioConversation
          messages={[
            message('first', luna),
            message('answer', undefined, 'assistant'),
            message('next', claude),
            message('reply', undefined, 'assistant'),
          ]}
          tools={{}}
          tasks={{}}
          subagents={{}}
          artifacts={{}}
          surfaces={{}}
        />
      </AppearanceProvider>,
    );
    const lines = document.querySelectorAll('[data-slot="model-checkpoint"]');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toHaveAttribute('role', 'separator');
    expect(lines[0]).toHaveTextContent(/^Switched to .+, claude-sonnet-5$/);
    expect(lines[0].getAttribute('aria-label')).toMatch(/Previous model: .+, gpt-6-luna$/);
    expect(document.getElementById('message-next')).toContainElement(lines[0] as HTMLElement);
    expect(screen.getByText('Content for answer.')).toBeInTheDocument();
    expect(screen.getByText('Content for reply.')).toBeInTheDocument();
  });
});
