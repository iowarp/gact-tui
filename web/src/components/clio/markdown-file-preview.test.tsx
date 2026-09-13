import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { MarkdownFilePreview } from './markdown-file-preview';

afterEach(cleanup);
it('renders the document by default and preserves the complete source including metadata', async () => {
  const content = '---\nname: Evidence\n---\n# Rendered evidence\n\nReadable **body**.';
  render(<MarkdownFilePreview name="evidence.md" content={content} />);
  expect(
    await screen.findByRole('heading', { name: 'Rendered evidence' }, { timeout: 5000 }),
  ).toBeVisible();
  expect(screen.getByText('Document metadata')).toBeVisible();
  await userEvent.setup().click(screen.getByRole('tab', { name: /^Source$/ }));
  expect(screen.getByRole('tabpanel', { name: 'Source' })).toHaveTextContent('name: Evidence');
  expect(screen.getByRole('button', { name: 'Copy evidence.md' })).toBeVisible();
});
