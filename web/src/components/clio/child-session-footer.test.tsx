import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ClioChildSessionFooter } from './child-session-footer';

describe('ClioChildSessionFooter', () => {
  it('presents completed child work as read-only evidence with parent navigation', async () => {
    const user = userEvent.setup();
    const onReturnToParent = vi.fn();
    render(
      <ClioChildSessionFooter
        parentTitle="Single child investigation"
        state="completed"
        onReturnToParent={onReturnToParent}
      />,
    );

    expect(screen.getByText('Delegated conversation')).toBeVisible();
    expect(screen.getByText(/read-only record of delegated work/i)).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'Return to parent conversation Single child investigation',
      }),
    );
    expect(onReturnToParent).toHaveBeenCalledOnce();
  });

  it('keeps structured child interactions available while direct messages stay unavailable', () => {
    render(
      <ClioChildSessionFooter
        parentTitle="Single child investigation"
        pendingInteractions={<button type="button">Answer child question</button>}
        state="running"
        onReturnToParent={vi.fn()}
      />,
    );

    expect(screen.getByText(/send added constraints from the parent conversation/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Answer child question' })).toBeVisible();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
