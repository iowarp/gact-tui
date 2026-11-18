import { useEffect, useRef, useState } from 'react';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { Catalog, CommonSchemas, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { A2uiViewerReport, A2UISurface } from '@clio/core/v3';
import { A2uiSurface } from '@/lib/a2ui/kernel-catalog';
import { wrapKernelComponentWithPresets } from '@/lib/a2ui/kernel-presets';
import * as regionCapture from './a2ui-region-capture';
import { useA2uiVisualViewer } from './a2ui-visual-viewer';
import { ViewerFileGate } from './viewer-file-gate';

const repository = vi.hoisted(() => ({ reportA2uiViewer: vi.fn(), completeA2uiCapture: vi.fn() }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

it.each([false, true])(
  'applies saved local bindings and refuses stale requests (stale=%s)',
  async (stale) => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 200,
      height: 100,
    } as DOMRect);
    const probe = createComponentImplementation(
      { name: 'Probe', schema: z.object({ value: CommonSchemas.DynamicString }) },
      ({ props }) => <pre>{props.value}</pre>,
    );
    const catalog = new Catalog(
      'test://controls',
      [wrapKernelComponentWithPresets(probe, 'Probe', undefined)],
      [],
    );
    const processor = new MessageProcessor([catalog], async () => undefined, { version: 'v0.9.1' });
    const messages = [
      { version: 'v0.9.1', createSurface: { surfaceId: 'surface', catalogId: catalog.id } },
      {
        version: 'v0.9.1',
        updateDataModel: { surfaceId: 'surface', path: '/tab', value: 'overview' },
      },
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId: 'surface',
          components: [{ id: 'root', component: 'Probe', value: { path: '/tab' } }],
        },
      },
    ] as A2uiMessage[];
    processor.processMessages(messages);
    const model = processor.model.getSurface('surface')!;
    const definition: A2UISurface = {
      id: 'surface',
      session_id: 'sid',
      catalog_id: catalog.id,
      protocol_version: '0.9.1',
      revision: 3,
      state: 'ready',
      messages,
    };
    let claimed = false;
    let reports = 0;
    let previous = 0;
    repository.reportA2uiViewer.mockImplementation(
      async (_sid: string, report: A2uiViewerReport) => {
        reports += 1;
        if (reports < 3) return [];
        if (claimed) return [];
        claimed = true;
        previous = report.view_revision;
        return [
          {
            request_id: 'control',
            surface_id: 'surface',
            revision: 3,
            view_revision: report.view_revision + (stale ? 1000 : 0),
            component_id: '',
            artifact_id: 'saved',
            data_model_update: { path: '/tab', value: 'detail' },
          },
        ];
      },
    );
    repository.completeA2uiCapture.mockResolvedValue({ accepted: true });
    function Mounted() {
      const root = useRef<HTMLDivElement>(null);
      useA2uiVisualViewer(root, definition, model, 'saved');
      return (
        <div ref={root}>
          <A2uiSurface surface={model} />
        </div>
      );
    }
    const result = render(<Mounted />);
    await waitFor(() => expect(repository.completeA2uiCapture).toHaveBeenCalledOnce(), {
      timeout: 4000,
    });
    const acknowledgement = repository.completeA2uiCapture.mock.calls[0]![1];
    expect(acknowledgement.png_base64).toBeUndefined();
    if (stale) {
      expect(acknowledgement.error).toMatch(/view changed/iu);
      expect(model.dataModel.get('/tab')).toBe('overview');
    } else {
      expect(acknowledgement.error).toBeUndefined();
      expect(acknowledgement.previous_view_revision).toBe(previous);
      expect(acknowledgement.view_revision).toBeGreaterThan(previous);
      expect(model.dataModel.get('/tab')).toBe('detail');
      expect(result.container.textContent).toBe('detail');
    }
  },
);

it('captures viewers scrolled off screen without its own mount changing the view', async () => {
  // The server dispatches a capture only to a ready viewer: three gated 3D views below
  // the fold must not keep the view from being ready, and the capture that mounts them
  // (taller than their placeholders, loading first) must still match the view it was
  // requested for.
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
  const capture = vi
    .spyOn(regionCapture, 'captureRenderedSurfacePng')
    .mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const mounted = this.querySelectorAll('[data-testid="scene"]').length;
    return { width: 600, height: 400 + 36 * mounted } as DOMRect;
  });
  function Scene() {
    const [loaded, setLoaded] = useState(false);
    useEffect(() => {
      const timer = window.setTimeout(() => setLoaded(true), 150);
      return () => window.clearTimeout(timer);
    }, []);
    return (
      <div data-slot="a2ui-mesh-viewport" data-testid="scene">
        {loaded ? (
          <div
            ref={(node) => {
              if (node) Object.assign(node, { __clioMeshCapture: () => node });
            }}
            role="img"
          />
        ) : (
          <div aria-busy="true" />
        )}
      </div>
    );
  }
  const processor = new MessageProcessor([new Catalog('test://gates', [], [])], async () => {}, {
    version: 'v0.9.1',
  });
  const messages = [
    { version: 'v0.9.1', createSurface: { surfaceId: 'eddy3d', catalogId: 'test://gates' } },
  ] as A2uiMessage[];
  processor.processMessages(messages);
  const model = processor.model.getSurface('eddy3d')!;
  const definition: A2UISurface = {
    id: 'eddy3d',
    session_id: 'sid',
    catalog_id: 'test://gates',
    protocol_version: '0.9.1',
    revision: 3,
    state: 'ready',
    messages,
  };
  const reports: A2uiViewerReport[] = [];
  let dispatched = false;
  repository.reportA2uiViewer.mockImplementation(async (_sid: string, report: A2uiViewerReport) => {
    reports.push(report);
    if (dispatched || !report.ready) return [];
    dispatched = true;
    return [
      {
        request_id: 'capture',
        surface_id: 'eddy3d',
        revision: report.revision,
        view_revision: report.view_revision,
        component_id: '',
        artifact_id: '',
      },
    ];
  });
  repository.completeA2uiCapture.mockResolvedValue({ accepted: true });
  function Mounted() {
    const root = useRef<HTMLDivElement>(null);
    useA2uiVisualViewer(root, definition, model);
    return (
      <div data-slot="a2ui-surface-root" ref={root}>
        {['v1', 'v2', 'v3'].map((id) => (
          <div data-a2ui-component-id={id} key={id}>
            <ViewerFileGate files={[`artifact://artifact_${id}`]} noun="3D view">
              <Scene />
            </ViewerFileGate>
          </div>
        ))}
      </div>
    );
  }
  render(<Mounted />);
  await waitFor(() => expect(repository.completeA2uiCapture).toHaveBeenCalledOnce(), {
    timeout: 4000,
  });
  const first = reports[0]!;
  expect(first.ready).toBe(true);
  expect(first.state.offscreen_views).toEqual([
    { component_id: 'v1' },
    { component_id: 'v2' },
    { component_id: 'v3' },
  ]);
  const reply = repository.completeA2uiCapture.mock.calls[0]![1];
  expect(reply.error).toBeUndefined();
  expect(reply.png_base64).toBe(btoa('png'));
  expect(capture).toHaveBeenCalledOnce();
  // Every report while the capture ran kept the view revision it was requested for.
  expect(new Set(reports.map((report) => report.view_revision))).toEqual(
    new Set([first.view_revision]),
  );
  // Released after the capture: the viewers are deferred again.
  await waitFor(() => expect(document.querySelectorAll('[data-viewer-deferred]')).toHaveLength(3));
});
