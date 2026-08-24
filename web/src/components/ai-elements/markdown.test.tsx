import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownText } from './markdown';

vi.mock('streamdown', () => ({
  Streamdown: () => (
    <div>
      <button title="Copy table" type="button">
        <svg aria-hidden="true" />
      </button>
      <button title="Download table as CSV" type="button">
        CSV
      </button>
    </div>
  ),
}));

describe('MarkdownText', () => {
  it('labels title-only controls from the reused renderer', async () => {
    render(<MarkdownText>Table content</MarkdownText>);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy table' })).toBeVisible());
    expect(screen.getByRole('button', { name: 'CSV' })).not.toHaveAttribute('aria-label');
  });
});
