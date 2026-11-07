import type { Message } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ConversationDisplayProvider } from '@/providers/conversation-display-provider';
import { TranscriptTestAppearance as AppearanceProvider } from '@/test/transcript-test-appearance';
import { ConversationMessageRow } from './conversation-message-row';

afterEach(cleanup);

function renderRow(message: Message) {
  return render(
    <AppearanceProvider>
      <ConversationDisplayProvider>
        <ConversationMessageRow
          message={message}
          active
          index={0}
          recent
          displayMode="chain"
          onDisplayModeChange={vi.fn()}
          artifacts={{}}
          subagents={{}}
          surfaces={{}}
          tasks={{}}
          tools={{}}
        />
      </ConversationDisplayProvider>
    </AppearanceProvider>,
  );
}

const live: Message = {
  id: 'diffusing',
  session_id: 's',
  role: 'assistant',
  created_at: '2026-10-10T01:12:00Z',
  blocks: [],
};

it('shows the live diffusion canvas in place of an empty response', () => {
  const view = renderRow({ ...live, canvas: { text: 'The quick br%wn fox', step: 3 } });
  expect(screen.getByTestId('diffusion-canvas')).toHaveTextContent('The quick br%wn fox');
  expect(screen.getByText('Diffusing · step 3')).toBeInTheDocument();
  expect(screen.queryByText('Response unavailable')).not.toBeInTheDocument();

  view.rerender(
    <AppearanceProvider>
      <ConversationDisplayProvider>
        <ConversationMessageRow
          message={{ ...live, canvas: { text: 'The quick brown fox', step: 4 } }}
          active
          index={0}
          recent
          displayMode="chain"
          onDisplayModeChange={vi.fn()}
          artifacts={{}}
          subagents={{}}
          surfaces={{}}
          tasks={{}}
          tools={{}}
        />
      </ConversationDisplayProvider>
    </AppearanceProvider>,
  );
  // Each frame overwrites the bubble; earlier frames are not kept.
  expect(screen.getAllByTestId('diffusion-canvas')).toHaveLength(1);
  expect(screen.getByTestId('diffusion-canvas')).toHaveTextContent('The quick brown fox');
  expect(screen.queryByText(/br%wn/u)).not.toBeInTheDocument();
});

it('renders the recorded answer, not a canvas, once the message has text', () => {
  renderRow({
    ...live,
    blocks: [{ id: 'final', type: 'text', text: 'The quick brown fox.' }],
  });
  expect(screen.queryByTestId('diffusion-canvas')).not.toBeInTheDocument();
});
