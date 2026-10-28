import { messageBlockSchema } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { MessageBlockSequence } from './conversation-message-blocks';

afterEach(cleanup);

const blocks = [
  { id: 'answer', type: 'text', text: 'The mean is 289.91 K.' },
  {
    id: 'revised',
    type: 'notice',
    source: 'answer_hook',
    code: 'revised',
    text: 'added the source',
    metadata: { hook: 'review.cite', revises: 'answer' },
  },
  { id: 'revision', type: 'text', text: 'The mean is 289.91 K (from data.csv).' },
  {
    id: 'note',
    type: 'notice',
    source: 'answer_hook',
    code: 'note',
    text: 'Checked against data.csv.',
    metadata: { hook: 'review.cite' },
  },
  {
    id: 'passed',
    type: 'notice',
    source: 'answer_hook',
    code: 'check_passed',
    text: 'Units are kelvin.',
    metadata: { hook: 'units' },
  },
  {
    id: 'failed',
    type: 'notice',
    source: 'answer_hook',
    code: 'check_failed',
    text: 'No uncertainty is given.',
    metadata: { hook: 'units' },
  },
].map((block) => messageBlockSchema.parse(block));

function renderBlocks() {
  render(
    <MessageBlockSequence
      artifacts={{}}
      blocks={blocks}
      subagents={{}}
      surfaces={{}}
      tasks={{}}
      tools={{}}
    />,
  );
}

describe('answer hook notices', () => {
  it('shows the revision in place of the answer, with the original one click away', async () => {
    const user = userEvent.setup();
    renderBlocks();
    expect(screen.getByText('The mean is 289.91 K (from data.csv).')).toBeVisible();
    expect(screen.queryByText('The mean is 289.91 K.')).toBeNull();
    expect(screen.getByText('added the source')).toBeVisible();
    expect(screen.getAllByText('review.cite')[0]?.parentElement).toHaveTextContent(
      'Revised by review.cite:',
    );
    await user.click(screen.getByRole('button', { name: 'Show the original answer' }));
    expect(screen.getByText('The mean is 289.91 K.')).toBeVisible();
  });

  it('says in words whether each check passed or failed, and who wrote each note', () => {
    renderBlocks();
    const [note, passed, failed] = ['note', 'check_passed', 'check_failed'].map((code) =>
      document.querySelector(`[data-slot="answer-hook-notice"][data-code="${code}"]`),
    );
    expect(note).toHaveTextContent('Note from review.cite: Checked against data.csv.');
    expect(passed).toHaveTextContent('Check passed, by units: Units are kelvin.');
    expect(failed).toHaveTextContent('Check failed, by units: No uncertainty is given.');
  });
});
