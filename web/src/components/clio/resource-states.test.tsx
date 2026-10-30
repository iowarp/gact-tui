import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ResourceLoading } from './resource-states';

afterEach(cleanup);

describe('ResourceLoading', () => {
  it('is a busy status named and labelled by its label', () => {
    render(<ResourceLoading label="Loading preview" />);
    const status = screen.getByRole('status', { name: 'Loading preview' });
    expect(status).toHaveAttribute('aria-busy', 'true');
    // The wait is worded, not shown only as a pulse.
    expect(status).toHaveTextContent('Loading preview');
    const bars = status.querySelectorAll('[data-slot="skeleton"]');
    expect(bars).toHaveLength(3);
    for (const bar of bars) expect(bar.closest('[aria-hidden="true"]')).not.toBeNull();
  });

  it('has a compact line variant for inline spots', () => {
    render(<ResourceLoading label="Loading folder" variant="line" />);
    const status = screen.getByRole('status', { name: 'Loading folder' });
    expect(status).toHaveTextContent('Loading folder');
    expect(status.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(0);
  });
});
