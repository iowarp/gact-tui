import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClioTimeSeriesPlot } from './time-series-plot';

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    bottom: 260,
    height: 260,
    left: 0,
    right: 720,
    top: 0,
    width: 720,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
});

afterEach(() => vi.restoreAllMocks());

describe('ClioTimeSeriesPlot', () => {
  it('adds a labeled two-handle window control for dense series', () => {
    render(
      <ClioTimeSeriesPlot
        rows={Array.from({ length: 30 }, (_, index) => ({ time: index, east: index / 10 }))}
        title="GNSS displacement"
        xKey="time"
        yKeys={['east']}
      />,
    );

    expect(screen.getByText('30 observations')).toBeVisible();
    expect(screen.getByText('Visible rows 1–30')).toBeVisible();
    expect(screen.getAllByRole('slider')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Reset window' })).toBeDisabled();
  });
});
