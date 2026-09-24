import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  openExternalUrl: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/tauri/external-url', () => ({ openExternalUrl: mocks.openExternalUrl }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));

import { ExternalLink } from './external-link';

beforeEach(() => {
  mocks.openExternalUrl.mockReset();
  mocks.toastError.mockReset();
});

afterEach(cleanup);

describe('ExternalLink', () => {
  it('prevents default navigation and opens the href through the external-url bridge', () => {
    mocks.openExternalUrl.mockResolvedValue(undefined);
    render(<ExternalLink href="https://example.com/docs">Docs</ExternalLink>);

    const link = screen.getByRole('link', { name: 'Docs' });
    const event = fireEvent.click(link);

    expect(event).toBe(false);
    expect(mocks.openExternalUrl).toHaveBeenCalledWith('https://example.com/docs');
  });

  it('renders as a real anchor with target and rel set for the browser fallback path', () => {
    render(<ExternalLink href="https://example.com">Example</ExternalLink>);

    const link = screen.getByRole('link', { name: 'Example' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('shows a toast when the open is rejected', async () => {
    mocks.openExternalUrl.mockRejectedValue(new Error('The browser blocked the link.'));
    render(<ExternalLink href="https://example.com">Example</ExternalLink>);

    fireEvent.click(screen.getByRole('link', { name: 'Example' }));

    await vi.waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('The browser blocked the link.'),
    );
  });

  it('reports a rejection through onOpenError instead of the toast when provided', async () => {
    mocks.openExternalUrl.mockRejectedValue(new Error('Could not open Globus sign-in.'));
    const onOpenError = vi.fn();
    render(
      <ExternalLink href="https://example.com" onOpenError={onOpenError}>
        Example
      </ExternalLink>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Example' }));

    await vi.waitFor(() => expect(onOpenError).toHaveBeenCalledWith(expect.any(Error)));
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('runs a caller-supplied onClick before opening, and honors preventDefault from it', () => {
    const onClick = vi.fn((event: React.MouseEvent) => event.preventDefault());
    render(
      <ExternalLink href="https://example.com" onClick={onClick}>
        Example
      </ExternalLink>,
    );

    fireEvent.click(screen.getByRole('link', { name: 'Example' }));

    expect(onClick).toHaveBeenCalledOnce();
    expect(mocks.openExternalUrl).not.toHaveBeenCalled();
  });
});
