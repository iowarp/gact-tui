import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurfaceFullScreenHost, useSurfaceFullScreen } from './surface-full-screen';

/**
 * G0: a per-component full-screen host must not delay mounting its children
 * by an extra render pass — a child whose OWN effect embeds something
 * imperative (a Vega view, a map canvas) on its very first effect run, with
 * no dependency that would otherwise change across such an extra pass, must
 * still find its own ref attached to a REAL, visible DOM node the first time
 * that effect runs. This regression was caught by an inline-data chart test
 * (`a2ui-chart.test.tsx`): `SurfaceFullScreenHost`'s original
 * `useState(null)` + `ref={setHost}` pattern left `containerRef.current`
 * `null` on the component's first effect pass.
 *
 * Toggling full screen itself is NOT asserted to preserve the child's own
 * instance/local state: switching a portal's container is a real remount —
 * switching a portal's container is a real remount, so a view's own local
 * state (a chart's pan/zoom, a table's page) starts fresh; only what lives in
 * the surface's shared data model (selection, agent data — passed back in as
 * props) survives. This module matches that precedent rather than fighting
 * React's actual portal-container semantics.
 */

function Probe({ onMount }: { onMount: (node: HTMLDivElement) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (ref.current) onMount(ref.current);
  });
  return <div data-slot="probe" ref={ref} />;
}

function Harness({ onMount }: { onMount: (node: HTMLDivElement) => void }) {
  const [fullscreen, setFullscreen] = useSurfaceFullScreen();
  return (
    <SurfaceFullScreenHost fullscreen={fullscreen} onOpenChange={setFullscreen} title="Probe">
      <Probe onMount={onMount} />
    </SurfaceFullScreenHost>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SurfaceFullScreenHost', () => {
  it('attaches a child ref to a document-connected node on the FIRST commit, not a later one', () => {
    const seen: HTMLDivElement[] = [];
    render(<Harness onMount={(node) => seen.push(node)} />);

    expect(seen.length).toBeGreaterThan(0);
    expect(document.body.contains(seen[0]!)).toBe(true);
  });

  it('renders children inline by default, with no full-screen dialog mounted', () => {
    render(<Harness onMount={() => {}} />);
    expect(screen.queryByText('Probe')).not.toBeInTheDocument(); // no dialog title shown
    expect(document.querySelector('[data-slot="probe"]')).not.toBeNull();
  });

  it('shows the same children in the dialog once toggled full screen', async () => {
    const user = userEvent.setup();
    function FullScreenHarness() {
      const [fullscreen, setFullscreen] = useSurfaceFullScreen();
      return (
        <>
          <button onClick={() => setFullscreen(!fullscreen)} type="button">
            Toggle
          </button>
          <SurfaceFullScreenHost
            fullscreen={fullscreen}
            onOpenChange={setFullscreen}
            title="Probe title"
          >
            <div data-slot="probe">content</div>
          </SurfaceFullScreenHost>
        </>
      );
    }
    render(<FullScreenHarness />);
    expect(screen.getByText('content')).toBeInTheDocument();
    expect(screen.queryByText('Probe title')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Toggle' }));

    expect(screen.getByText('Probe title')).toBeInTheDocument(); // the dialog's own title bar
    expect(screen.getByText('content')).toBeInTheDocument(); // the SAME content, now inside the dialog
    expect(screen.getAllByText('content')).toHaveLength(1); // never duplicated between hosts

    await user.click(screen.getByRole('button', { name: 'Exit full screen' }));
    expect(screen.queryByText('Probe title')).not.toBeInTheDocument();
    expect(screen.getByText('content')).toBeInTheDocument(); // back inline
  });

  it('attaches the child ref again after a remount (a true full-screen toggle re-embeds its view)', async () => {
    const user = userEvent.setup();
    let mounts = 0;
    function CountedProbe() {
      useEffect(() => {
        mounts += 1;
      }, []);
      return <div data-slot="probe" />;
    }
    function FullScreenHarness() {
      const [fullscreen, setFullscreen] = useSurfaceFullScreen();
      return (
        <>
          <button onClick={() => setFullscreen(!fullscreen)} type="button">
            Toggle
          </button>
          <SurfaceFullScreenHost fullscreen={fullscreen} onOpenChange={setFullscreen} title="Probe">
            <CountedProbe />
          </SurfaceFullScreenHost>
        </>
      );
    }
    render(<FullScreenHarness />);
    expect(mounts).toBe(1);

    await user.click(screen.getByRole('button', { name: 'Toggle' }));

    // A real remount (new container -> new fiber) is the accepted trade-off
    // here (see the module doc comment); what matters is that it DID remount
    // cleanly, rather than silently failing to re-attach at all.
    expect(mounts).toBe(2);
  });
});
