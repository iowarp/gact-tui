import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  it('offers drag selection plus compact keyboard navigation for dense series', async () => {
    const user = userEvent.setup();
    render(
      <ClioTimeSeriesPlot
        rows={Array.from({ length: 30 }, (_, index) => ({ time: index, east: index / 10 }))}
        title="GNSS displacement"
        xKey="time"
        yKeys={['east']}
      />,
    );

    expect(screen.getByText('30 rows')).toBeVisible();
    expect(
      screen.getByRole('img', {
        name: 'GNSS displacement plot. Drag across the chart to select a range.',
      }),
    ).toBeVisible();
    expect(screen.getByText('Drag across the chart to select a range')).toBeVisible();
    expect(screen.queryAllByRole('slider')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Focus chart selection' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'More chart navigation' }));
    expect(screen.getByRole('menuitem', { name: 'Zoom in' })).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Pan left' })).toHaveAttribute('data-disabled');
  });
});
