import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { DEFAULT_ATTENTION_HEAT_VIEW } from '@/lib/attention-line-heat';
import { AttentionHeatViewControls } from './attention-heat-view-controls';

afterEach(cleanup);

const renderControls = (view = DEFAULT_ATTENTION_HEAT_VIEW, onChange = vi.fn()) => {
  render(
    <TooltipProvider>
      <AttentionHeatViewControls view={view} onChange={onChange} />
    </TooltipProvider>,
  );
  return onChange;
};

it('defaults to lines valued by their hottest token', () => {
  renderControls();
  expect(screen.getByRole('radio', { name: 'Lines' })).toHaveAttribute('data-state', 'on');
  expect(screen.getByRole('radio', { name: 'Max' })).toHaveAttribute('data-state', 'on');
});

it('switches to tokens and hides the line value choice there', () => {
  const onChange = renderControls();
  fireEvent.click(screen.getByRole('radio', { name: 'Tokens' }));
  expect(onChange).toHaveBeenCalledWith({ unit: 'token', reduction: 'max' });
  cleanup();
  renderControls({ unit: 'token', reduction: 'max' });
  expect(screen.queryByRole('radio', { name: 'Mean' })).not.toBeInTheDocument();
});

it('switches the line value to the mean', () => {
  const onChange = renderControls();
  fireEvent.click(screen.getByRole('radio', { name: 'Mean' }));
  expect(onChange).toHaveBeenCalledWith({ unit: 'line', reduction: 'mean' });
});
