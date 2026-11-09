import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { ClioEvidenceView } from './observability-evidence';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

it.each([false, true])(
  'keeps task history in Work and out of Data (compact=%s)',
  async (compact) => {
    const props = {
      artifacts: [],
      contextFiles: [],
      diffs: [],
      messages: [],
      processes: [],
      compact,
      workPages: {
        hasMore: false,
        pending: false,
        loadMore: vi.fn(async () => {}),
        history: {
          loaded: false,
          visible: false,
          toggle: vi.fn(),
          items: [],
          hasMore: false,
          pending: false,
          loadMore: vi.fn(async () => {}),
          error: '',
        },
      },
    };
    const view = render(<ClioEvidenceView {...props} section="data" />);
    expect(screen.queryByRole('button', { name: 'Completed work' })).toBeNull();
    const workGroup = compact ? /^Running,/ : /^Background (work|tasks),/;
    expect(screen.queryByRole('button', { name: workGroup })).toBeNull();
    view.rerender(<ClioEvidenceView {...props} section="work" />);
    const group = screen.getByRole('button', {
      name: compact ? 'Running, none running' : /^Background (work|tasks), none running$/,
    });
    if (group.getAttribute('aria-expanded') === 'false') await userEvent.click(group);
    expect(screen.getByRole('button', { name: 'Completed work' })).toBeVisible();
    expect(screen.queryByText('No session evidence or recorded activity is available.')).toBeNull();
  },
);
