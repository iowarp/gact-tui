/**
 * W3 Tier-1 — actionable error states.
 *
 * Covers the two structural enablers:
 *  1. Toast action buttons (the thing that turns an error toast from a
 *     dead-end into a recovery path).
 *  2. DiscoveryPage error-state Retry (shared by every discovery page).
 */
import { render, screen, cleanup, fireEvent } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { ToastProvider, useToast } from '../../src/components/Toast.js';
import { DiscoveryPage } from '../../src/components/DiscoveryPage.js';

afterEach(cleanup);

/** Mounts inside ToastProvider and pushes one toast on mount. */
function PushOnMount(props: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const toast = useToast();
  toast.push({
    title: props.title,
    tone: 'error',
    ...(props.actionLabel
      ? {
          action: {
            label: props.actionLabel,
            onClick: () => props.onAction?.(),
          },
        }
      : {}),
  });
  return <div />;
}

describe('Toast action buttons', () => {
  it('renders an action button when the toast has an action', () => {
    render(() => (
      <ToastProvider>
        <PushOnMount title="Send failed" actionLabel="Retry" />
      </ToastProvider>
    ));
    expect(screen.getByText('Send failed')).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
  });

  it('clicking the action runs the callback and dismisses the toast', () => {
    let clicked = false;
    render(() => (
      <ToastProvider>
        <PushOnMount
          title="SSE disconnected"
          actionLabel="Reconnect now"
          onAction={() => {
            clicked = true;
          }}
        />
      </ToastProvider>
    ));
    fireEvent.click(screen.getByText('Reconnect now'));
    expect(clicked).toBe(true);
    // The toast goes away after the action is taken.
    expect(screen.queryByText('SSE disconnected')).toBeNull();
  });

  it('renders no action button for plain toasts', () => {
    render(() => (
      <ToastProvider>
        <PushOnMount title="Just info" />
      </ToastProvider>
    ));
    expect(screen.getByText('Just info')).toBeTruthy();
    expect(screen.queryByText('Retry')).toBeNull();
  });
});

describe('DiscoveryPage error Retry', () => {
  it('shows a Retry button when onRetry is provided', () => {
    let retried = false;
    render(() => (
      <DiscoveryPage
        icon="agents"
        title="Agents"
        error="fetch failed: connection refused"
        onRetry={() => {
          retried = true;
        }}
      />
    ));
    expect(screen.getByTestId('dp-error')).toBeTruthy();
    const retry = screen.getByTestId('dp-error-retry');
    fireEvent.click(retry);
    expect(retried).toBe(true);
  });

  it('omits the Retry button when no onRetry handler is given', () => {
    render(() => (
      <DiscoveryPage icon="agents" title="Agents" error="some error" />
    ));
    expect(screen.getByTestId('dp-error')).toBeTruthy();
    expect(screen.queryByTestId('dp-error-retry')).toBeNull();
  });
});
