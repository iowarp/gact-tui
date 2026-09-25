import { cleanup, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { WorkspaceHydrating, WorkspaceStatusStrip } from './workspace-route-surfaces';

const tauri = vi.hoisted(() => ({ inTauri: vi.fn(() => false) }));

vi.mock('./navigation-version-status', () => ({
  SystemVersionStatus: () => <button type="button">System version</button>,
}));
vi.mock('./live-connection-indicator', () => ({
  LiveConnectionIndicator: () => <span data-testid="live-connection-indicator">Live pill</span>,
}));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: tauri.inTauri }));

afterEach(cleanup);

function renderStrip(props: ComponentProps<typeof WorkspaceStatusStrip>) {
  return render(
    <TooltipProvider>
      <WorkspaceStatusStrip {...props} />
    </TooltipProvider>,
  );
}

describe('WorkspaceStatusStrip', () => {
  it('shows the live connection indicator once on web, with no "Up to date" pill', () => {
    tauri.inTauri.mockReturnValue(false);
    renderStrip({ activeWorkCount: 0, cursor: 'checkpoint-1849', stream: 'live' });

    expect(screen.getByTestId('live-connection-indicator')).toBeVisible();
    expect(screen.queryByText('Up to date')).not.toBeInTheDocument();
    expect(screen.queryByText(/cursor|checkpoint/u)).not.toBeInTheDocument();
  });

  it('drops the live connection indicator on desktop -- the title bar already shows it once', () => {
    tauri.inTauri.mockReturnValue(true);
    renderStrip({ activeWorkCount: 0, stream: 'live' });

    expect(screen.queryByTestId('live-connection-indicator')).not.toBeInTheDocument();
  });

  it('reports 0 tokens (never "Unavailable") before any turn has run', () => {
    renderStrip({ activeWorkCount: 0, stream: 'live' });

    expect(screen.getByText('No active work')).toBeVisible();
    expect(screen.getByText('Tokens: 0')).toBeVisible();
    expect(screen.queryByText(/unavailable/iu)).not.toBeInTheDocument();
  });

  it('shows a real token count and cost once the session has usage', () => {
    renderStrip({ activeWorkCount: 0, cost: 0.0032, stream: 'live', tokens: 150 });

    expect(screen.getByText('Tokens: 150')).toBeVisible();
    expect(screen.getByText('Cost: $0.0032')).toBeVisible();
  });

  it('shows a muted dash, never "Unavailable", when the provider reports no cost', () => {
    renderStrip({ activeWorkCount: 0, stream: 'live', tokens: 300 });

    expect(screen.getByText('—')).toBeVisible();
    expect(screen.queryByText(/unavailable/iu)).not.toBeInTheDocument();
  });

  it('places the single system-version control in the bottom status strip', () => {
    renderStrip({ activeWorkCount: 0, stream: 'live' });

    expect(screen.getByRole('button', { name: 'System version' })).toBeVisible();
  });

  it('describes recovery in user terms while retaining the checkpoint as metadata', () => {
    renderStrip({ activeWorkCount: 2, cursor: 'checkpoint-1849', stream: 'reconnecting' });

    expect(screen.getByText('Resuming updates')).toHaveAttribute(
      'title',
      'Recovery checkpoint point-1849',
    );
    expect(screen.getByText('2 active items')).toBeVisible();
  });
});

describe('WorkspaceHydrating', () => {
  it('keeps loading state inside the conversation pane', () => {
    render(<WorkspaceHydrating />);

    const surface = screen.getByRole('region', { name: 'Conversation loading' });
    expect(surface).toBeVisible();
    expect(surface).toHaveClass('h-full', 'min-h-0');
    expect(surface).not.toHaveClass('min-h-dvh');
    expect(screen.getByText(/messages will appear as they arrive/iu)).toBeVisible();
  });
});
