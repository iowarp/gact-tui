import { useRef } from 'react';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { Catalog, CommonSchemas, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { A2uiViewerReport, A2UISurface } from '@clio/core/v3';
import { A2uiSurface } from '@/lib/a2ui/kernel-catalog';
import { wrapKernelComponentWithPresets } from '@/lib/a2ui/kernel-presets';
import { useA2uiVisualViewer } from './a2ui-visual-viewer';

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
