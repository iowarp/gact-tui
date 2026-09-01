import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ClioContextMeter } from './context-meter';

describe('ClioContextMeter', () => {
  it('does not round measured positive usage down to zero', () => {
    render(<ClioContextMeter limit={1_050_000} used={1_700} />);

    expect(screen.getByText('<1%')).toBeVisible();
    expect(
      screen.getByRole('progressbar', {
        name: '1,700 of 1,050,000 context tokens used, <1%',
      }),
    ).toHaveAttribute('aria-valuenow', '1700');
  });

  it('reports a measured zero as zero', () => {
    render(<ClioContextMeter limit={1_050_000} used={0} />);

    expect(screen.getByText('0%')).toBeVisible();
  });
});
