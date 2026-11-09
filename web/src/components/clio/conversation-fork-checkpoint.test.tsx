import type { Message } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TranscriptTestAppearance } from '@/test/transcript-test-appearance';
import { ClioConversation } from './conversation';

Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
afterEach(cleanup);
const origin = {
  session_id: 'parent',
  message_id: 'source',
  message_count: 2,
  title: 'Calibration baseline',
  created_at: '2026-10-11',
};
const message = (id: string, role: Message['role']): Message => ({
  id,
  role,
  session_id: 'child',
  created_at: '2026-10-11',
  blocks: [{ id: `${id}:text`, type: 'text', text: id }],
});
function transcript(messages: Message[], forkOrigin = origin) {
  return (
    <MemoryRouter>
      <TranscriptTestAppearance>
        <ClioConversation
          messages={messages}
          workspaceId="workspace"
          forkOrigin={forkOrigin}
          tools={{}}
          tasks={{}}
          artifacts={{}}
          subagents={{}}
          surfaces={{}}
        />
      </TranscriptTestAppearance>
    </MemoryRouter>
  );
}
describe('child transcript fork checkpoint', () => {
  it('keeps copied history and places one checkpoint after its last copied message', () => {
    render(
      transcript([
        message('first', 'user'),
        message('source', 'assistant'),
        message('continuation', 'user'),
      ]),
    );
    const marker = screen.getByRole('separator', { name: 'Conversation branched here' });
    expect(document.querySelector('[data-message-id="source"]')?.contains(marker)).toBe(true);
    expect(
      marker.compareDocumentPosition(screen.getByText('source')) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    expect(
      marker.compareDocumentPosition(screen.getByText('continuation')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Calibration baseline' })).toHaveAttribute(
      'href',
      '/workspaces/workspace/sessions/parent#message-source',
    );
    expect(marker).toHaveTextContent('Forked here from Calibration baseline');
    expect(marker).toHaveTextContent('Files remain shared.');
  });
  it('does not invent a visible boundary after a rewind removed the copied tail', () => {
    render(transcript([message('first', 'user')]));
    expect(
      screen.queryByRole('separator', { name: 'Conversation branched here' }),
    ).not.toBeInTheDocument();
  });
  it('shows the empty-fork checkpoint before its first prompt, and before any prompt exists', () => {
    const empty = { ...origin, message_id: '', message_count: 0 };
    const view = render(transcript([], empty));
    expect(screen.getByRole('separator', { name: 'Conversation branched here' })).toHaveTextContent(
      'Started from an empty conversation.',
    );
    view.rerender(transcript([message('new-prompt', 'user')], empty));
    expect(screen.getAllByRole('separator', { name: 'Conversation branched here' })).toHaveLength(
      1,
    );
    expect(
      screen
        .getByRole('separator', { name: 'Conversation branched here' })
        .compareDocumentPosition(screen.getByText('new-prompt')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
