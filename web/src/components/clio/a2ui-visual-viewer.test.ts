import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureVisualRequest,
  compactVisualState,
  visualViewState,
  visualCapturePixelRatio,
  visualMutationsChanged,
  viewReadiness,
} from './a2ui-visual-viewer';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('real renderer readiness inspection', () => {
  it('ignores identical renderer writes but detects changes, reversions and replacement', async () => {
    const root = document.createElement('div');
    root.innerHTML = '<svg><path d="M0,0L10,10" aria-label="25 observations" /></svg><p>Data</p>';
    document.body.append(root);
    const path = root.querySelector('path')!;
    const text = root.querySelector('p')!.firstChild!;
    const changed: boolean[] = [];
    const observer = new MutationObserver((records) =>
      changed.push(visualMutationsChanged(records)),
    );
    observer.observe(root, {
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      childList: true,
      characterData: true,
      characterDataOldValue: true,
    });
    path.setAttribute('d', 'M0,0L10,10');
    path.setAttribute('aria-label', '25 observations');
    text.nodeValue = 'Data';
    await Promise.resolve();
    expect(changed).toEqual([false]);
    path.setAttribute('d', 'M0,0L20,20');
    await Promise.resolve();
    expect(changed.at(-1)).toBe(true);
    path.setAttribute('d', 'M1,1');
    path.setAttribute('d', 'M0,0L20,20');
    await Promise.resolve();
    expect(changed.at(-1)).toBe(true);
    text.nodeValue = 'Changed data';
    await Promise.resolve();
    expect(changed.at(-1)).toBe(true);
    root.querySelector('p')!.replaceChildren('Changed data');
    await Promise.resolve();
    expect(changed.at(-1)).toBe(true);
    observer.disconnect();
  });
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
    {
      markup:
        '<div data-a2ui-component-id="chart"><p role="alert">Dataset failed to load</p></div>',
      reason: /Dataset failed to load/u,
    },
    {
      markup:
        '<div data-a2ui-component-id="callout"><div role="alert" data-a2ui-callout="true" data-visual-state="failed">Rendering failed</div></div>',
      reason: /Rendering failed/u,
    },
    {
      markup:
        '<div data-a2ui-component-id="callout"><div role="alert" data-a2ui-callout="true">Notes<p role="alert">Nested render failure</p></div></div>',
      reason: /Nested render failure/u,
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
  it('reports a declared renderer failure as terminal, apart from a view still loading', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 100,
      height: 100,
    } as DOMRect);
    const root = document.createElement('div');
    root.dataset.slot = 'a2ui-surface-root';
    document.body.append(root);
    root.innerHTML =
      '<section data-a2ui-component-id="chart" data-visual-state="loading"></section>';
    expect(viewReadiness(root)).toEqual({
      ready: false,
      state: 'loading',
      detail: 'Required data or rendering is still loading.',
    });
    root.innerHTML =
      '<section data-a2ui-component-id="chart" data-visual-state="failed">Field "flux" is not in the dataset</section>';
    expect(viewReadiness(root)).toEqual({
      ready: false,
      state: 'failed',
      detail: 'Field "flux" is not in the dataset',
    });
  });
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
