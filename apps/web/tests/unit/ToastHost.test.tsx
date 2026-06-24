import { render, screen, cleanup, fireEvent } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastHost, type VisibleToast } from '../../src/components/ToastHost.js';

afterEach(cleanup);

describe('ToastHost', () => {
  it('renders visible toasts and dismisses through the close button', () => {
    const onDismiss = vi.fn();
    const toasts: VisibleToast[] = [
      {
        id: 12,
        title: 'Saved',
        body: 'Changes persisted',
        tone: 'success',
      },
    ];

    render(() => <ToastHost toasts={toasts} onDismiss={onDismiss} />);

    expect(screen.getByText('Saved')).toBeTruthy();
    expect(screen.getByText('Changes persisted')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(onDismiss).toHaveBeenCalledWith(12);
  });

  it('runs an action and dismisses the toast', () => {
    const onDismiss = vi.fn();
    const onAction = vi.fn();
    const toasts: VisibleToast[] = [
      {
        id: 7,
        title: 'Send failed',
        tone: 'error',
        action: {
          label: 'Retry',
          onClick: onAction,
        },
      },
    ];

    render(() => <ToastHost toasts={toasts} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByTestId('toast-action-7'));
    expect(onAction).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledWith(7);
  });
});
