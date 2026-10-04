import type { AttentionProfile } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttentionProfileEditor } from './attention-profile-editor';

const profile: AttentionProfile = {
  schema_version: 1,
  version: 1,
  name: 'uniform-mean',
  metric: 'mean',
  weighting: 'uniform',
  direction: 'forward',
  decay_base: 0.5,
  weight_normalization: 'sum',
  block_reduction: 'sum',
  display_scaling: 'max',
  content_steps: 'all_selected_captured_steps',
};

afterEach(cleanup);

describe('AttentionProfileEditor', () => {
  it('applies an explicit versioned preset only after confirmation', () => {
    const apply = vi.fn();
    render(<AttentionProfileEditor profile={profile} onApply={apply} />);
    fireEvent.click(screen.getByRole('button', { name: /Heat profile/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Decayed maximum' }));
    expect(apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply profile' }));
    expect(apply).toHaveBeenCalledWith({
      ...profile,
      name: 'decayed-max',
      metric: 'max',
      weighting: 'exponential',
      block_reduction: 'max',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('refuses invalid decay and discards unapplied edits when reopened', () => {
    const apply = vi.fn();
    render(<AttentionProfileEditor profile={profile} onApply={apply} />);
    fireEvent.click(screen.getByRole('button', { name: /Heat profile/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Decayed maximum' }));
    fireEvent.change(screen.getByLabelText('Decay base'), { target: { value: '0' } });
    expect(screen.getByRole('button', { name: 'Apply profile' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: /Heat profile/ }));
    expect(screen.getByLabelText('Decay base')).toHaveValue(0.5);
    expect(screen.getByLabelText('Decay base')).toBeDisabled();
    expect(apply).not.toHaveBeenCalled();
  });
});
