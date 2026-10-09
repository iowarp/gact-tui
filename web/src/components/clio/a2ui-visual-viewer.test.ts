import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureVisualRequest,
  compactVisualState,
  visualViewState,
  visualCapturePixelRatio,
} from './a2ui-visual-viewer';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('real renderer readiness inspection', () => {
  it('captures a tall composed report within the PNG bound at normal and Retina density', () => {
    for (const density of [1, 1.25, 2, 3]) {
      const ratio = visualCapturePixelRatio(660, 3200, density);
      expect(ratio).toBeGreaterThanOrEqual(1);
      expect(3200 * ratio).toBeLessThanOrEqual(4096);
      expect(660 * ratio).toBeLessThanOrEqual(4096);
    }
    expect(visualCapturePixelRatio(660, 3200, 1)).toBe(1);
    expect(() => visualCapturePixelRatio(660, 4097, 1)).toThrow(/smaller component/u);
  });
  it.each([
    { markup: '', reason: /components have not mounted/u },
    {
      markup: '<div data-a2ui-component-id="chart"><div aria-busy="true"></div></div>',
      reason: /still loading/u,
    },
  ])(
    'refuses an empty surface or lazy renderer placeholder: $markup',
    async ({ markup, reason }) => {
      const root = document.createElement('div');
      root.dataset.slot = 'a2ui-surface-root';
      root.innerHTML = markup;
      document.body.append(root);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        width: 100,
        height: 100,
      } as DOMRect);
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
        callback(0);
        return 1;
      });
      Object.defineProperty(document, 'fonts', {
        configurable: true,
        value: { ready: Promise.resolve() },
      });
      await expect(
        captureVisualRequest(
          root,
          {
            request_id: 'pending',
            surface_id: 'surface',
            revision: 3,
            view_revision: 0,
            component_id: '',
            artifact_id: 'saved',
          },
          () => false,
        ),
      ).rejects.toThrow(reason);
    },
  );
  it('bounds large dataset evidence without losing camera or reference identity', () => {
    const result = compactVisualState({
      camera: { position: [1, 2, 3] },
      reference: 'artifact://dataset',
      controls: [
        { value: Array.from({ length: 100_000 }, (_, id) => ({ id, label: 'x'.repeat(5000) })) },
      ],
      field: new Float32Array(1_000_000),
    }) as Record<string, unknown>;
    expect(result.camera).toEqual({ position: [1, 2, 3] });
    expect(result.reference).toBe('artifact://dataset');
    expect(JSON.stringify(result).length).toBeLessThan(64_000);
    expect(result.field).toEqual({
      elements: 4_000_000,
      units: 'bytes',
      omitted: 'dataset values',
    });
  });
  it('inspects mesh graphics without mistaking an accessible link icon for a missing frame', () => {
    const root = document.createElement('div');
    root.innerHTML =
      '<section data-a2ui-component-id="mesh"><div data-slot="a2ui-mesh-viewport"><svg role="img" aria-label="Linked cameras"></svg><div role="img"><canvas></canvas></div></div></section>';
    document.body.append(root);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 100,
      height: 100,
    } as DOMRect);
    const graphics = root.querySelector('div[role="img"]') as HTMLElement & {
      __clioMeshCapture: () => HTMLCanvasElement;
      __clioMeshState: () => unknown;
    };
    graphics.__clioMeshCapture = () => graphics.querySelector('canvas')!;
    graphics.__clioMeshState = () => ({ camera: { position: [1, 2, 3] }, frame: 1 });
    expect(visualViewState(root).meshes).toEqual([
      { component_id: 'mesh', state: { camera: { position: [1, 2, 3] }, frame: 1 }, ready: true },
    ]);
  });
});
