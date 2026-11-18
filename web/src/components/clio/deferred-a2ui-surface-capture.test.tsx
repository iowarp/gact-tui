import { useRef, useState } from 'react';
import { MessageProcessor, Catalog, type A2uiMessage } from '@a2ui/web_core/v0_9';
import type { A2uiViewerReport, A2UISurface } from '@clio/core/v3';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import * as regionCapture from './a2ui-region-capture';
import { useA2uiVisualViewer } from './a2ui-visual-viewer';
import { DeferredA2UISurface } from './conversation-message-blocks';

const repository = vi.hoisted(() => ({ reportA2uiViewer: vi.fn(), completeA2uiCapture: vi.fn() }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));

// The real renderer and its viewer hook, over a model with no components to load.
vi.mock('./a2ui-surface', () => ({
  ClioA2UISurface: ({ surface }: { surface: A2UISurface }) => {
    const root = useRef<HTMLDivElement>(null);
    const [model] = useState(() => {
      const processor = new MessageProcessor(
        [new Catalog('test://transcript', [], [])],
        async () => {},
        { version: 'v0.9.1' },
      );
      processor.processMessages(surface.messages as A2uiMessage[]);
      return processor.model.getSurface(surface.id);
    });
    useA2uiVisualViewer(root, surface, model);
    return (
      <div data-slot="a2ui-surface-root" ref={root}>
        <div data-a2ui-component-id="view-2">
          <input aria-label="Track map" defaultValue="" />
        </div>
      </div>
    );
  },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const surface: A2UISurface = {
  id: 'glider-fetch',
  session_id: 'sid',
  catalog_id: 'test://transcript',
  protocol_version: '0.9.1',
  revision: 2,
  state: 'ready',
  messages: [
    {
      version: 'v0.9.1',
      createSurface: { surfaceId: 'glider-fetch', catalogId: 'test://transcript' },
    },
  ],
};

function scrolledAway() {
  let top = 0;
  let notify: IntersectionObserverCallback | undefined;
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        x: 0,
        y: top,
        top,
        bottom: top + 120,
        left: 0,
        right: 300,
        width: 300,
        height: 120,
        toJSON: () => ({}),
      }) as DOMRect,
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        notify = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  return {
    moveOffscreen() {
      top = window.innerHeight + 1_000;
      act(() => {
        notify?.(
          [{ isIntersecting: false } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
      });
    },
  };
}

it('captures a surface scrolled out of the transcript without moving or opening anything', async () => {
  // Live: a tool result's map scrolled away behind later sections; its renderer
  // unmounted, its lease lapsed mid-capture and the agent was told "no longer visible".
  const reports: A2uiViewerReport[] = [];
  let dispatched = false;
  let duringCapture: { viewport: string | null; style: string | null; inert: boolean } | undefined;
  const capture = vi
    .spyOn(regionCapture, 'captureRenderedSurfacePng')
    .mockImplementation(async (target) => {
      const host = target.closest<HTMLElement>('[data-a2ui-viewport]')!;
      duringCapture = {
        viewport: host.getAttribute('data-a2ui-viewport'),
        style: host.getAttribute('style'),
        inert: host.hasAttribute('inert'),
      };
      return new Blob(['png'], { type: 'image/png' });
    });
  repository.completeA2uiCapture.mockResolvedValue({ accepted: true });
  repository.reportA2uiViewer.mockImplementation(async (_sid: string, report: A2uiViewerReport) => {
    reports.push(report);
    if (dispatched || !report.state.suspended) return [];
    dispatched = true;
    return [
      {
        request_id: 'capture',
        surface_id: report.surface_id,
        revision: report.revision,
        view_revision: report.view_revision,
        component_id: 'view-2',
        artifact_id: '',
      },
    ];
  });
  const { moveOffscreen } = scrolledAway();
  const { container } = render(<DeferredA2UISurface surface={surface} />);
  await waitFor(() => expect(reports.length).toBeGreaterThan(0));
  const mounted = reports[0]!;
  moveOffscreen();
  expect(screen.queryByRole('textbox', { name: 'Track map' })).not.toBeInTheDocument();

  await waitFor(() => expect(repository.completeA2uiCapture).toHaveBeenCalledOnce(), {
    timeout: 4000,
  });
  const suspended = reports.find((report) => report.state.suspended)!;
  // One viewer throughout: the suspended lease continues the mounted one's.
  expect(suspended).toMatchObject({
    viewer_id: mounted.viewer_id,
    visible: true,
    ready: true,
  });
  expect(suspended.view_revision).toBeGreaterThan(mounted.view_revision);
  const reply = repository.completeA2uiCapture.mock.calls[0]![1];
  expect(reply).toMatchObject({
    request_id: 'capture',
    viewer_id: mounted.viewer_id,
    view_revision: suspended.view_revision,
    png_base64: btoa('png'),
  });
  expect(reply.error).toBeUndefined();
  expect(capture).toHaveBeenCalledOnce();
  // Mounted out of sight in exactly its reserved height, inert, then suspended again.
  expect(duringCapture).toEqual({
    viewport: 'capture',
    style: 'height: 120px; overflow: hidden;',
    inert: true,
  });
  await waitFor(() =>
    expect(container.querySelector('[data-a2ui-viewport="deferred"]')).not.toBeNull(),
  );
  // The renderer mounted for the capture never reported a viewer of its own.
  expect(new Set(reports.map((report) => report.viewer_id))).toEqual(new Set([mounted.viewer_id]));
});

it('refuses a view control while suspended rather than loading controls off screen', async () => {
  const reports: A2uiViewerReport[] = [];
  let dispatched = false;
  repository.completeA2uiCapture.mockResolvedValue({ accepted: true });
  repository.reportA2uiViewer.mockImplementation(async (_sid: string, report: A2uiViewerReport) => {
    reports.push(report);
    if (dispatched || !report.state.suspended) return [];
    dispatched = true;
    return [
      {
        request_id: 'control',
        surface_id: report.surface_id,
        revision: report.revision,
        view_revision: report.view_revision,
        component_id: '',
        artifact_id: '',
        data_model_update: { path: '/selection', value: 4 },
      },
    ];
  });
  const { moveOffscreen } = scrolledAway();
  render(<DeferredA2UISurface surface={surface} />);
  await waitFor(() => expect(reports.length).toBeGreaterThan(0));
  moveOffscreen();
  await waitFor(() => expect(repository.completeA2uiCapture).toHaveBeenCalledOnce(), {
    timeout: 4000,
  });
  const reply = repository.completeA2uiCapture.mock.calls[0]![1];
  expect(reply.error).toMatch(/scrolled out of the conversation/u);
  expect(reply.previous_view_revision).toBe(reply.view_revision);
  expect(screen.queryByRole('textbox', { name: 'Track map' })).not.toBeInTheDocument();
});
