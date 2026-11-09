import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { vocab } from '@/lib/brand-vocabulary';
import { useUpdateFlowStore } from '@/store/update-flow-store';
import { useUpdatePane } from './update-page-host';
import { UpdatePage, UpdateRestartOverlay } from './update-restart-overlay';

beforeEach(() => {
  useUpdateFlowStore.getState().reset();
});

afterEach(cleanup);

function currentStep() {
  return screen.getAllByRole('listitem').find((item) => item.getAttribute('aria-current'));
}

function PaneHost() {
  return useUpdatePane() ? <UpdatePage /> : null;
}

describe('UpdateRestartOverlay', () => {
  it('renders nothing while idle', () => {
    render(<UpdateRestartOverlay />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders nothing once the update has settled as done', () => {
    useUpdateFlowStore.getState().resume('agent', '0.9.5.0');
    useUpdateFlowStore.getState().finish('0.9.5.0');
    render(<UpdateRestartOverlay />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('lists the steps with the current one and its latest log line', () => {
    const store = useUpdateFlowStore.getState();
    store.start('agent', '0.9.5.0');
    store.setStep('installing');
    store.appendLine('Installing clio-agent...');
    store.appendLine('Successfully installed clio-agent-0.9.5.0');

    render(<UpdateRestartOverlay />);

    expect(screen.getByRole('status')).toHaveTextContent(`Updating ${vocab.product} to 0.9.5.0`);
    // An agent-only update downloads nothing of its own.
    expect(screen.queryByText(/^Downloading/)).not.toBeInTheDocument();
    expect(within(currentStep()!).getByText('Installing')).toBeVisible();
    expect(screen.getByText('Successfully installed clio-agent-0.9.5.0')).toBeVisible();
  });

  it('shows byte-based download progress from real DownloadEvent counts', () => {
    const store = useUpdateFlowStore.getState();
    store.start('desktop');
    store.setStep('downloading');
    store.setProgress({ downloadedBytes: 512_000, totalBytes: 1_024_000 });

    render(<UpdateRestartOverlay />);

    expect(within(currentStep()!).getByText('50%')).toBeVisible();
  });

  it('resumes on the restart step after a process-replacing restart', () => {
    useUpdateFlowStore.getState().resume('both', '0.9.5.0');

    render(<UpdateRestartOverlay />);

    expect(within(currentStep()!).getByText('Restarting and reconnecting')).toBeVisible();
  });

  it('leaves the window to a mounted pane host', () => {
    useUpdateFlowStore.getState().start('agent', '0.9.5.0');

    render(
      <>
        <PaneHost />
        <UpdateRestartOverlay />
      </>,
    );

    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('keeps the failure reason behind Details and lets the person dismiss it', async () => {
    const user = userEvent.setup();
    const store = useUpdateFlowStore.getState();
    store.start('agent', '0.9.5.0');
    store.setStep('installing');
    store.fail('The managed CLIO agent service did not become ready in time.');

    render(<UpdateRestartOverlay />);

    expect(screen.getByRole('alert')).toHaveTextContent('Update did not finish');
    await user.click(screen.getByRole('button', { name: 'Details' }));
    expect(
      within(screen.getByRole('dialog')).getByText(
        'The managed CLIO agent service did not become ready in time.',
      ),
    ).toBeVisible();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(useUpdateFlowStore.getState().step).toBe('idle');
  });
});
