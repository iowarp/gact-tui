import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ResourceLoading } from './resource-states';

afterEach(cleanup);

describe('ResourceLoading', () => {
  it('is a busy status named by its label', () => {
    render(<ResourceLoading label="Loading preview" />);
    const status = screen.getByRole('status', { name: 'Loading preview' });
    expect(status).toHaveAttribute('aria-busy', 'true');
    const bars = status.querySelectorAll('[data-slot="skeleton"]');
    expect(bars).toHaveLength(3);
    for (const bar of bars) expect(bar).toHaveAttribute('aria-hidden', 'true');
    // Named, not worded: no bare "Loading…" text in the region.
    expect(status).toHaveTextContent('');
  });

  it('has a one-bar line variant for inline spots', () => {
    render(<ResourceLoading label="Loading folder" variant="line" />);
    const status = screen.getByRole('status', { name: 'Loading folder' });
    expect(status.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(1);
  });
});
