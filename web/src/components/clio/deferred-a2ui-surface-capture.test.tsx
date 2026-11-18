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

it('answers parallel captures of three surfaces, one suspended, and every claimed request', async () => {
  // Live: three parallel captures on one page, one of a surface scrolled away. A request
  // a renewal claims while a capture runs (the server's retry after an earlier one
  // expired) must be answered too, not dropped to time out.
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
  const away = new Set<Element>();
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const top = [...away].some((node) => node.contains(this)) ? window.innerHeight + 1_000 : 0;
    return { top, bottom: top + 120, left: 0, right: 300, width: 300, height: 120 } as DOMRect;
  });
  const observers: { element: Element; notify: IntersectionObserverCallback }[] = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private readonly notify: IntersectionObserverCallback) {}
      observe(element: Element) {
        observers.push({ element, notify: this.notify });
      }
      disconnect() {}
    },
  );
  vi.spyOn(regionCapture, 'captureRenderedSurfacePng').mockImplementation(async (target) => {
    // Longer than a renewal interval, so a renewal claims the retry mid-capture.
    await new Promise((resolve) => window.setTimeout(resolve, 900));
    const id = target.closest('[data-surface]')!.getAttribute('data-surface')!;
    return new Blob([id], { type: 'image/png' });
  });
  repository.completeA2uiCapture.mockResolvedValue({ accepted: true });
  let armed = false;
  const sent = new Set<string>();
  const capturing = new Set<string>();
  repository.reportA2uiViewer.mockImplementation(async (_sid: string, report: A2uiViewerReport) => {
    const request = (id: string) => ({
      request_id: id,
      surface_id: report.surface_id,
      revision: report.revision,
      view_revision: report.view_revision,
      component_id: '',
      artifact_id: '',
    });
    const id = report.surface_id;
    if (id === 'section-b' && capturing.has(id) && !sent.has('section-b-retry')) {
      sent.add('section-b-retry');
      return [request('section-b-retry')];
    }
    const ready = id === 'glider' ? report.state.suspended === true : report.ready;
    if (!ready || sent.has(id) || !armed) return [];
    sent.add(id);
    capturing.add(id);
    return [request(id)];
  });
  const surfaces = ['section-a', 'section-b', 'glider'].map((id) => ({
    ...surface,
    id,
    messages: [
      { version: 'v0.9.1', createSurface: { surfaceId: id, catalogId: 'test://transcript' } },
    ],
  }));
  const { container } = render(
    <>
      {surfaces.map((item) => (
        <div data-surface={item.id} key={item.id}>
          <DeferredA2UISurface surface={item} />
        </div>
      ))}
    </>,
  );
  const glider = container.querySelector('[data-surface="glider"]')!;
  away.add(glider);
  act(() => {
    for (const { element, notify } of observers)
      if (glider.contains(element))
        notify(
          [{ isIntersecting: false } as IntersectionObserverEntry],
          {} as IntersectionObserver,
        );
  });
  expect(glider.querySelector('[data-a2ui-viewport="deferred"]')).not.toBeNull();
  armed = true;
  await waitFor(() => expect(repository.completeA2uiCapture).toHaveBeenCalledTimes(4), {
    timeout: 6000,
  });
  const replies = Object.fromEntries(
    repository.completeA2uiCapture.mock.calls.map(([, reply]) => [reply.request_id, reply]),
  );
  for (const [request, pixels] of [
    ['section-a', 'section-a'],
    ['section-b', 'section-b'],
    ['section-b-retry', 'section-b'],
    ['glider', 'glider'],
  ]) {
    expect(replies[request]?.error).toBeUndefined();
    expect(replies[request]?.png_base64).toBe(btoa(pixels!));
  }
  await waitFor(() =>
    expect(glider.querySelector('[data-a2ui-viewport="deferred"]')).not.toBeNull(),
  );
});
