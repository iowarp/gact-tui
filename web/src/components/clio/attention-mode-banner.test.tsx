import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { AttentionModeState } from '@/hooks/use-attention-mode';
import { AttentionModeBanner } from './attention-mode-banner';

afterEach(cleanup);

const selection = {
  kind: 'agent-answer-text' as const,
  text: 'Ecm14',
  sessionId: 'sess_1',
  messageId: 'msg_1',
};

const renderBanner = (state: AttentionModeState) =>
  render(
    <TooltipProvider>
      <AttentionModeBanner onDismiss={vi.fn()} state={state} />
    </TooltipProvider>,
  );

it('says why no heat is shown when the tokenizer does not line up, as a warning', () => {
  renderBanner({
    status: 'unavailable',
    selection,
    reason: 'output_alignment_mismatch',
    message: 'The answer does not re-tokenize to the captured steps, so no heat can be shown.',
    detail: 'Likely cause: sampling (temperature > 0); use greedy decoding (temperature 0).',
  });
  const alert = screen.getByRole('alert');
  expect(alert).toHaveAttribute('data-reason', 'output_alignment_mismatch');
  expect(alert).toHaveTextContent('does not re-tokenize to the captured steps');
  expect(alert).toHaveTextContent('use greedy decoding (temperature 0)');
});

it('shows any other reason as plain information, not a warning', () => {
  renderBanner({
    status: 'unavailable',
    selection,
    reason: 'attention_capture_missing',
    message: 'This answer has no attention capture.',
  });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('This answer has no attention capture.');
});
