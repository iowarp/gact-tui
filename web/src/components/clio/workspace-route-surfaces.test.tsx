import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createRef, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useUpdateFlowStore } from '@/store/update-flow-store';
import type { ResourceActions } from './resource-dialogs';
import {
  WorkspaceHydrating,
  WorkspaceStatusStrip,
  WorkspaceTranscriptAlerts,
  TranscriptPresenceSurface,
} from './workspace-route-surfaces';

it('gives the transition its DOM node so an exiting welcome can leave the flex layout', () => {
  const ref = createRef<HTMLDivElement>();
  render(
    <TranscriptPresenceSurface ref={ref} className="min-h-0 flex-1">
      Welcome
    </TranscriptPresenceSurface>,
  );
  expect(ref.current).toBe(screen.getByText('Welcome'));
});

// The usage readout reads the fleet for a session; it stays pending here.
vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({ fleet: () => new Promise(() => undefined) }),
}));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://test' } }),
}));

beforeEach(() => {
  useUpdateFlowStore.getState().reset();
});

afterEach(cleanup);

function renderStrip(props: ComponentProps<typeof WorkspaceStatusStrip>) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <WorkspaceStatusStrip {...props} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('WorkspaceStatusStrip', () => {
  it('opens unresolved work instead of reporting an idle workspace as empty', () => {
    const open = vi.fn();
    const openGoals = vi.fn();
    renderStrip({
      activeWorkCount: 0,
      unresolvedWorkCount: 1,
      sessionId: 'lost-visibility',
      sessionState: 'interrupted',
      onOpenWork: openGoals,
      onInspectTasks: open,
      stream: 'live',
    });
    const inspection = screen.getByRole('button', { name: 'Inspect unresolved tasks' });
    expect(inspection).toHaveTextContent('1 task needs inspection');
    expect(screen.queryByText('No active work')).not.toBeInTheDocument();
    fireEvent.click(inspection);
    expect(open).toHaveBeenCalledOnce();
    expect(openGoals).not.toHaveBeenCalled();
  });

  it('keeps inspection visible alongside model execution and clears it after settlement', () => {
    const view = renderStrip({
      activeWorkCount: 2,
      unresolvedWorkCount: 2,
      sessionState: 'running',
      stream: 'live',
      onInspectTasks: vi.fn(),
    });
    expect(screen.getByRole('button', { name: 'Inspect unresolved tasks' })).toHaveTextContent(
      /2 to inspect.*running; 2 tasks need inspection/u,
    );
    view.rerender(
      <TooltipProvider>
        <WorkspaceStatusStrip activeWorkCount={0} unresolvedWorkCount={0} stream="live" />
      </TooltipProvider>,
    );
    expect(screen.queryByText(/inspect/u)).not.toBeInTheDocument();
  });

  it('leaves connection and version to the agent menu, and says nothing while idle', () => {
    renderStrip({ activeWorkCount: 0, cursor: 'checkpoint-1849', stream: 'live' });

    expect(screen.queryByTestId('live-connection-indicator')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'System version' })).not.toBeInTheDocument();
    expect(screen.queryByText('No active work')).not.toBeInTheDocument();
    expect(screen.queryByText(/cursor|checkpoint/u)).not.toBeInTheDocument();
  });

  it('describes recovery in user terms while retaining the checkpoint as metadata', () => {
    renderStrip({ activeWorkCount: 2, cursor: 'checkpoint-1849', stream: 'reconnecting' });

    expect(screen.getByText('Resuming updates').parentElement).toHaveAttribute(
      'title',
      'Recovery checkpoint point-1849',
    );
  });
});

describe('WorkspaceTranscriptAlerts', () => {
  it('offers removal only for a damaged conversation, behind a confirmation', async () => {
    const deleteSession = vi.fn(async () => undefined);
    const actions = { deleteSession } as unknown as ResourceActions;
    const { rerender } = render(
      <WorkspaceTranscriptAlerts transcriptError="Cannot be read right now. Retry shortly." />,
    );
    expect(screen.queryByRole('button', { name: 'Remove conversation' })).not.toBeInTheDocument();

    rerender(
      <WorkspaceTranscriptAlerts
        removal={{ actions, session: { id: 'sess_1', title: 'Spotter run' } }}
        transcriptError="This conversation's stored messages are damaged and cannot be read."
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove conversation' }));
    expect(deleteSession).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete permanently' }));

    await waitFor(() => expect(deleteSession).toHaveBeenCalledWith('sess_1'));
  });

  it('shows a stream error under ordinary conditions', () => {
    render(<WorkspaceTranscriptAlerts streamError="The stream disconnected unexpectedly." />);

    expect(screen.getByText('Some updates may be missing')).toBeVisible();
  });

  it('suppresses the stream-error row while an update is in flight', () => {
    useUpdateFlowStore.getState().start('agent', '0.9.5.0');
    useUpdateFlowStore.getState().setStep('installing');

    render(<WorkspaceTranscriptAlerts streamError="The stream disconnected unexpectedly." />);

    expect(screen.queryByText('Some updates may be missing')).not.toBeInTheDocument();
  });

  it('suppresses the stream-error row while reconnecting after an expected restart', () => {
    useUpdateFlowStore.getState().resume('both', '0.9.5.0');

    render(<WorkspaceTranscriptAlerts streamError="The stream disconnected unexpectedly." />);

    expect(screen.queryByText('Some updates may be missing')).not.toBeInTheDocument();
  });

  it('still shows an unrelated transcript-fetch error during an in-flight update', () => {
    useUpdateFlowStore.getState().start('agent', '0.9.5.0');
    useUpdateFlowStore.getState().setStep('installing');

    render(
      <WorkspaceTranscriptAlerts
        streamError="The stream disconnected unexpectedly."
        transcriptError="Could not load older messages."
      />,
    );

    expect(screen.queryByText('Some updates may be missing')).not.toBeInTheDocument();
    expect(screen.getByText('The latest messages could not be loaded')).toBeVisible();
  });

  it('resumes showing stream errors once the update settles back to idle', () => {
    useUpdateFlowStore.getState().start('agent', '0.9.5.0');
    useUpdateFlowStore.getState().setStep('installing');
    useUpdateFlowStore.getState().reset();

    render(<WorkspaceTranscriptAlerts streamError="The stream disconnected unexpectedly." />);

    expect(screen.getByText('Some updates may be missing')).toBeVisible();
  });
});

describe('WorkspaceHydrating', () => {
  it('keeps loading state inside the conversation pane', () => {
    render(<WorkspaceHydrating />);

    const surface = screen.getByRole('region', { name: 'Conversation loading' });
    expect(surface).toBeVisible();
    expect(surface).toHaveClass('h-full', 'min-h-0');
    expect(surface).not.toHaveClass('min-h-dvh');
    expect(screen.getByRole('status')).toHaveTextContent('Opening conversation');
  });
});
