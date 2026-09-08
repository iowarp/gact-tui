import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioToolInvocation } from './tool-invocation';

afterEach(cleanup);

describe('todo status explanations', () => {
  it.each([
    ['pending', 'Pending'],
    ['in_progress', 'In progress'],
    ['completed', 'Completed'],
  ] as const)(
    'explains %s on hover and keyboard focus without toggling the task',
    async (state, label) => {
      Range.prototype.getClientRects = vi.fn(() => [] as unknown as DOMRectList);
      const user = userEvent.setup();
      render(
        <ClioToolInvocation
          tool={{
            id: 'todos',
            session_id: 's',
            name: 'arbitrary',
            state: 'succeeded',
            presentation: {
              summary: '',
              blocks: [{ id: 'task', type: 'check', state, text: 'Read evidence' }],
            },
          }}
        />,
      );
      const icon = screen.getByRole('img', { name: label });
      expect(icon).toHaveAttribute('tabindex', '0');
      await user.hover(icon);
      expect(await screen.findByRole('tooltip')).toHaveTextContent(label);
      await user.unhover(icon);
      await user.tab(); // Technical details icon precedes the task.
      await user.tab();
      expect(icon).toHaveFocus();
      expect(await screen.findByRole('tooltip')).toHaveTextContent(label);
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      expect(icon).toHaveFocus();
      expect(icon).toHaveAccessibleName(label);
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    },
  );
});
