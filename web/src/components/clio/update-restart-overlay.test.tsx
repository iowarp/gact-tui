import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vocab } from '@/lib/brand-vocabulary';
import { useUpdateFlowStore } from '@/store/update-flow-store';
import { UpdateRestartOverlay } from './update-restart-overlay';

beforeEach(() => {
  useUpdateFlowStore.getState().reset();
});

afterEach(cleanup);

describe('UpdateRestartOverlay', () => {
  it('renders nothing while idle', () => {
    render(<UpdateRestartOverlay />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('renders nothing once the update has settled as done', () => {
    useUpdateFlowStore.getState().resume('agent', '0.9.5.0');
    useUpdateFlowStore.getState().finish('0.9.5.0');
    render(<UpdateRestartOverlay />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('blocks full-screen while installing, and shows the streamed log lines', () => {
    const store = useUpdateFlowStore.getState();
    store.start('agent', '0.9.5.0');
    store.setStep('installing');
    store.appendLine('Installing clio-agent...');
    store.appendLine('Successfully installed clio-agent-0.9.5.0');

    render(<UpdateRestartOverlay />);

    expect(screen.getByRole('status', { name: `Installing ${vocab.agent}` })).toBeVisible();
    expect(screen.getByText(/Successfully installed clio-agent-0.9.5.0/)).toBeVisible();
  });

  it('shows byte-based download progress from real DownloadEvent counts', () => {
    const store = useUpdateFlowStore.getState();
    store.start('desktop');
    store.setStep('downloading');
    store.setProgress({ downloadedBytes: 512_000, totalBytes: 1_024_000 });

    render(<UpdateRestartOverlay />);

    expect(screen.getByText(/50%/)).toBeVisible();
  });

  it('shows the reconnecting phase after a resumed restart', () => {
    useUpdateFlowStore.getState().resume('both', '0.9.5.0');

    render(<UpdateRestartOverlay />);

    expect(screen.getByRole('status', { name: 'Reconnecting' })).toBeVisible();
  });

  it('shows the typed failure reason and lets the person dismiss it', async () => {
    const user = userEvent.setup();
    const store = useUpdateFlowStore.getState();
    store.start('agent', '0.9.5.0');
    store.setStep('installing');
    store.fail('The managed CLIO agent service did not become ready in time.');

    render(<UpdateRestartOverlay />);

    expect(screen.getByRole('alertdialog')).toBeVisible();
    expect(
      screen.getByText('The managed CLIO agent service did not become ready in time.'),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(useUpdateFlowStore.getState().step).toBe('idle');
  });
});
