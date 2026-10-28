import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { SurfaceFullScreenHost, useSurfaceFullScreen } from './surface-full-screen';
import { ClioWorkbench, type ClioWorkbenchHandle } from './workbench';

// This regression concerns the portal and tab identity; payload rendering is
// covered by the real viewers' tests and the browser review.
vi.mock('./resource-viewers', () => ({
  ArtifactView: ({ artifact }: { artifact: { name: string } }) => (
    <article aria-label={`Artifact view: ${artifact.name}`}>{artifact.name}</article>
  ),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

it.each(['desktop', 'sheet'] as const)(
  'maximizes over the shell and restores with Escape in %s',
  async (host) => {
    const user = userEvent.setup();
    const handle = createRef<ClioWorkbenchHandle>();
    render(
      <div data-slot={host === 'sheet' ? 'sheet-content' : undefined} data-testid="canvas-host">
        <ClioWorkbench
          artifacts={[]}
          diffs={[]}
          files={[]}
          onOpenSubagent={vi.fn()}
          onUndoDiff={vi.fn()}
          ref={handle}
          requestedOpen={{ key: 'earlier-open', request: { kind: 'session' } }}
          sessionId="session_parent"
          sessionView={<p>Session intelligence</p>}
          workspaceId="workspace_1"
        />
      </div>,
    );
    act(() =>
      handle.current?.open({
        kind: 'artifact',
        artifact: {
          id: 'figure',
          session_id: 'session_parent',
          name: 'Growth curves.png',
          media_type: 'image/png',
          uri: 'artifact://figure',
        },
      }),
    );
    await screen.findByRole('article', { name: 'Artifact view: Growth curves.png' });

    await user.click(screen.getByRole('button', { name: 'Maximize canvas' }));
    expect(screen.getByRole('tab', { name: 'Growth curves.png' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(
      screen.getByRole('button', { name: 'Restore canvas beside conversation' }),
    ).toBeVisible();
    expect(screen.getByRole('complementary', { name: 'Workspace canvas' })).toHaveClass('fixed');
    expect(screen.getByRole('complementary', { name: 'Workspace canvas' }).parentElement).toBe(
      host === 'sheet' ? screen.getByTestId('canvas-host') : document.body,
    );

    const restoreEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    act(() =>
      screen.getByRole('complementary', { name: 'Workspace canvas' }).dispatchEvent(restoreEvent),
    );
    expect(restoreEvent.defaultPrevented).toBe(true);
    expect(screen.getByRole('button', { name: 'Maximize canvas' })).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Growth curves.png' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  },
);

function DiagramPreview() {
  const [fullscreen, setFullscreen] = useSurfaceFullScreen();
  return (
    <>
      <button onClick={() => setFullscreen(true)}>Expand diagram</button>
      <SurfaceFullScreenHost
        fullscreen={fullscreen}
        onOpenChange={setFullscreen}
        title="Architecture diagram"
        headerExtra={
          <DropdownMenu>
            <DropdownMenuTrigger>Diagram actions</DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Copy source</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        <input aria-label="Diagram notes" defaultValue="Keep this note" />
      </SurfaceFullScreenHost>
    </>
  );
}

it.each(['desktop', 'sheet'] as const)(
  'Escape dismisses the menu, full-screen view, canvas, and sheet one at a time in %s',
  async (host) => {
    const user = userEvent.setup();
    const canvas = (
      <ClioWorkbench
        artifacts={[]}
        diffs={[]}
        files={[]}
        onOpenSubagent={vi.fn()}
        onUndoDiff={vi.fn()}
        requestedOpen={{ key: 'session', request: { kind: 'session' } }}
        sessionId="escape_session"
        sessionView={<DiagramPreview />}
        workspaceId="escape_workspace"
      />
    );
    render(
      host === 'sheet' ? (
        <Sheet defaultOpen>
          <SheetContent aria-describedby={undefined}>
            <SheetTitle>Workspace files</SheetTitle>
            {canvas}
          </SheetContent>
        </Sheet>
      ) : canvas,
    );
    await user.click(screen.getByRole('button', { name: 'Maximize canvas' }));
    await user.click(screen.getByRole('button', { name: 'Expand diagram' }));
    await user.click(screen.getByRole('button', { name: 'Diagram actions' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Architecture diagram' })).toBeVisible();
    expect(document.querySelector('[data-maximized=true]')).not.toBeNull();

    await user.click(screen.getByRole('textbox', { name: 'Diagram notes' }));
    expect(screen.getByRole('dialog', { name: 'Architecture diagram' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Architecture diagram' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Diagram notes' })).toHaveValue('Keep this note');
    expect(document.querySelector('[data-maximized=true]')).not.toBeNull();

    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Maximize canvas' })).toBeVisible();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Maximize canvas' })).toHaveFocus(),
    );
    if (host === 'sheet') {
      expect(screen.getByRole('dialog', { name: 'Workspace files' })).toBeVisible();
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    }
  },
);
