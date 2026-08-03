import { cleanup, render, screen } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { ChatSecondaryChips } from '../../src/routes/ChatSecondaryChips.js';

afterEach(cleanup);

describe('ChatSecondaryChips', () => {
  it('does not render internal completed stop reasons as topbar chips', () => {
    render(() => (
      <ChatSecondaryChips
        sessionTokens={{ input: 1200, output: 300, total: 1500 }}
        streamStats={{ ttftMs: 1200, tokensPerSec: 18, streaming: false }}
      />
    ));

    expect(screen.queryByTestId('stop-reason-chip')).toBeNull();
    expect(screen.getByTestId('tokens-chip')).toBeTruthy();
    expect(screen.getByTestId('stream-stats-chip')).toBeTruthy();
  });
});
