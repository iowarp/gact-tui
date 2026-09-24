import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentType } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ openExternalUrl: vi.fn() }));

vi.mock('@/tauri/external-url', () => ({ openExternalUrl: mocks.openExternalUrl }));

vi.mock('streamdown', () => ({
  // A thin stand-in for the real renderer: it still resolves `components.a`
  // the same way Streamdown does, so a test can prove links render through
  // whatever component MarkdownText passes, not just that a prop is set.
  Streamdown: ({ components }: { components?: { a?: ComponentType<Record<string, unknown>> } }) => {
    const Anchor = components?.a ?? 'a';
    return (
      <div>
        <button title="Copy table" type="button">
          <svg aria-hidden="true" />
        </button>
        <button title="Download table as CSV" type="button">
          CSV
        </button>
        <Anchor href="https://docs.example.com/guide">Guide</Anchor>
      </div>
    );
  },
}));

import { MarkdownText } from './markdown';

afterEach(cleanup);

describe('MarkdownText', () => {
  it('labels title-only controls from the reused renderer', async () => {
    render(<MarkdownText>Table content</MarkdownText>);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Copy table' })).toBeVisible());
    expect(screen.getByRole('button', { name: 'CSV' })).not.toHaveAttribute('aria-label');
  });

  it('renders markdown links through the ExternalLink bridge', async () => {
    mocks.openExternalUrl.mockResolvedValue(undefined);
    render(<MarkdownText>[Guide](https://docs.example.com/guide)</MarkdownText>);

    const link = await screen.findByRole('link', { name: 'Guide' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');

    fireEvent.click(link);

    expect(mocks.openExternalUrl).toHaveBeenCalledWith('https://docs.example.com/guide');
  });
});
