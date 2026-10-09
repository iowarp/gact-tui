import { useEffect, useRef, type RefObject } from 'react';
import type { SurfaceModel } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import type { A2uiCaptureRequest, A2uiViewerReport, A2UISurface } from '@clio/core/v3';
import type { View } from 'vega';
import type { MapLibreMap } from 'maplibre-gl';
import { useRepository } from '@/hooks/use-repository';
import { captureRenderedSurfacePng } from './a2ui-region-capture';

interface VisualNode extends HTMLElement {
  __clioMap?: MapLibreMap;
  __clioMapFailure?: string;
  __clioChart?: { view: View };
  __clioMeshState?: () => unknown;
  __clioMeshCapture?: () => HTMLCanvasElement;
  __clioVisualReference?: () => unknown;
}

function displayed(node: HTMLElement): boolean {
  const rect = node.getBoundingClientRect();
  return (
    node.isConnected &&
    rect.width > 0 &&
    rect.height > 0 &&
    getComputedStyle(node).visibility !== 'hidden' &&
    getComputedStyle(node).display !== 'none'
  );
}

/** Report view evidence rather than retransmitting complete referenced datasets. */
export function compactVisualState(value: unknown): unknown {
  let remaining = 600;
  let characters = 30_000;
  const compact = (item: unknown, depth: number): unknown => {
    remaining -= 1;
    if (remaining < 0 || depth > 8) return { omitted: 'state budget' };
    if (typeof item === 'string') {
      const limit = Math.max(0, Math.min(1024, characters));
      characters -= Math.min(item.length, limit);
      return item.length > limit
        ? { preview: item.slice(0, limit), characters: item.length }
        : item;
    }
    if (ArrayBuffer.isView(item))
      return { elements: item.byteLength, units: 'bytes', omitted: 'dataset values' };
    if (Array.isArray(item)) {
      const values = item.slice(0, 16).map((child) => compact(child, depth + 1));
      return item.length > 16 ? { preview: values, count: item.length, truncated: true } : values;
    }
    if (item && typeof item === 'object') {
      const entries = Object.entries(item);
      return Object.fromEntries([
        ...entries.slice(0, 32).map(([key, child]) => [key, compact(child, depth + 1)]),
        ...(entries.length > 32 ? [['properties_omitted', entries.length - 32]] : []),
      ]);
    }
    return item;
  };
  return compact(value, 0);
}

/** Bindings come from the actual component definition, never guessed paths. */
function boundControls(surface: A2UISurface, model: SurfaceModel<ReactComponentImplementation>) {
  const components = new Map<string, Record<string, unknown>>();
  for (const message of surface.messages as Record<string, unknown>[]) {
    const update = message.updateComponents as
      | { components?: Record<string, unknown>[] }
      | undefined;
    for (const component of update?.components ?? [])
      components.set(String(component.id), component);
  }
  const controls: Record<string, unknown>[] = [];
  const references: string[] = [];
  const walk = (value: unknown, property: string, component: Record<string, unknown>) => {
    if (!value || typeof value !== 'object') return;
    if ('path' in value && typeof value.path === 'string') {
      controls.push({
        component_id: component.id,
        component: component.component,
        property,
        path: value.path,
        value: model.dataModel.get(value.path),
        owner: 'data_model',
      });
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${property}/${index}`, component));
    } else {
      Object.entries(value).forEach(([key, item]) => walk(item, `${property}/${key}`, component));
    }
  };
  for (const component of components.values()) {
    for (const [key, value] of Object.entries(component)) {
      walk(value, key, component);
      if (typeof value === 'string' && /^(artifact|resource):\/\//u.test(value))
        references.push(value);
    }
  }
  return { controls, references: [...new Set(references)] };
}

/** Inspect the current rendered state independently of definition revisions. */
export function visualViewState(root: HTMLElement): Record<string, unknown> {
  const maps = [...root.querySelectorAll<VisualNode>('[data-slot="a2ui-map-surface"]')]
    .filter(displayed)
    .map((node) => {
      const map = node.__clioMap;
      const center = map?.getCenter();
      return {
        component_id: node
          .closest('[data-a2ui-component-id]')
          ?.getAttribute('data-a2ui-component-id'),
        camera: center
          ? {
              longitude: center.lng,
              latitude: center.lat,
              zoom: map!.getZoom(),
              bearing: map!.getBearing(),
              pitch: map!.getPitch(),
            }
          : null,
        ready: Boolean(map?.loaded() && map.areTilesLoaded() && !map.isMoving()),
        error: node.__clioMapFailure ?? '',
      };
    });
  const meshes = [
    ...root.querySelectorAll<VisualNode>('[data-slot="a2ui-mesh-viewport"] div[role="img"]'),
  ]
    .filter(displayed)
    .map((node) => ({
      component_id: node
        .closest('[data-a2ui-component-id]')
        ?.getAttribute('data-a2ui-component-id'),
      state: node.__clioMeshState?.(),
      ready: Boolean(node.__clioMeshCapture),
    }));
  const rect = root.getBoundingClientRect();
  return {
    viewport: { width: rect.width, height: rect.height },
    maps,
    meshes,
    data_views: [...root.querySelectorAll<VisualNode>('[data-slot="surface-toolbar"]')].map(
      (node) => ({
        component_id: node
          .closest('[data-a2ui-component-id]')
          ?.getAttribute('data-a2ui-component-id'),
        reference: node.__clioVisualReference?.(),
      }),
    ),
    tabs: [...root.querySelectorAll<HTMLElement>('[role="tab"][aria-selected="true"]')]
      .filter(displayed)
      .map((node) => ({ id: node.id, label: node.textContent })),
    inputs: [
      ...root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select, textarea'),
    ]
      .filter(displayed)
      .map((node) => ({
        name: node.name,
        value: node.value,
        ...(node instanceof HTMLInputElement ? { checked: node.checked } : {}),
      })),
  };
}

function assertReady(target: HTMLElement): void {
  if (!displayed(target) || document.visibilityState !== 'visible')
    throw new Error('The requested view is hidden or unmounted.');
  const failed = [
    ...(target.matches('[role="alert"], [data-visual-state="failed"]') ? [target] : []),
    ...target.querySelectorAll<HTMLElement>('[role="alert"], [data-visual-state="failed"]'),
  ].find(displayed);
  if (failed) throw new Error(failed.textContent || 'A required view failed to render.');
  if (
    [
      ...(target.matches('[aria-busy="true"], [data-visual-state="loading"]') ? [target] : []),
      ...target.querySelectorAll<HTMLElement>('[aria-busy="true"], [data-visual-state="loading"]'),
    ].some(displayed)
  )
    throw new Error('Required data or rendering is still loading.');
  for (const node of target.querySelectorAll<VisualNode>('[data-slot="a2ui-map-surface"]')) {
    if (!displayed(node)) continue;
    if (node.__clioMapFailure) throw new Error(node.__clioMapFailure);
    if (!node.__clioMap?.loaded() || !node.__clioMap.areTilesLoaded() || node.__clioMap.isMoving())
      throw new Error('Map data, tiles or camera are not ready.');
  }
  for (const node of target.querySelectorAll<VisualNode>('[data-slot="a2ui-chart-view"]')) {
    if (displayed(node) && !node.__clioChart)
      throw new Error('The chart has not completed layout.');
  }
  for (const node of target.querySelectorAll<VisualNode>(
    '[data-slot="a2ui-mesh-viewport"] div[role="img"]',
  )) {
    if (displayed(node) && !node.__clioMeshCapture)
      throw new Error('The mesh graphics frame is unavailable.');
  }
  for (const image of target.querySelectorAll('img')) {
    if (displayed(image) && (!image.complete || !image.naturalWidth))
      throw new Error('A required image is unavailable.');
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Capture a displayed component; hidden content never masquerades as a successful frame. */
export async function captureVisualRequest(
  root: HTMLElement,
  request: A2uiCaptureRequest,
  matches: () => boolean,
): Promise<string> {
  let target =
    !request.component_id || request.component_id === 'root'
      ? root
      : [...root.querySelectorAll<HTMLElement>('[data-a2ui-component-id]')].find(
          (node) => node.getAttribute('data-a2ui-component-id') === request.component_id,
        );
  if (!target) throw new Error('The requested component is not mounted in this view.');
  if (target.hasAttribute('data-a2ui-capture-wrapper')) {
    const content = target.firstElementChild;
    if (!(content instanceof HTMLElement) || target.childElementCount !== 1)
      throw new Error('The requested component has no capturable displayed content.');
    target = content;
  }
  await document.fonts.ready;
  await nextFrame();
  // Required data and tiles have a bounded chance to finish. An unavailable
  // view remains a failure, never the last canvas frame from an earlier query.
  for (let attempt = 0; ; attempt += 1) {
    try {
      assertReady(target);
      break;
    } catch (error) {
      if (!displayed(target) || attempt >= 70 || !matches()) throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
  }
  for (const node of target.querySelectorAll<VisualNode>('[data-slot="a2ui-chart-view"]')) {
    if (displayed(node)) await node.__clioChart?.view.runAsync();
  }
  await nextFrame();
  if (!matches()) throw new Error('The definition or viewer state changed before capture.');
  const rect = target.getBoundingClientRect();
  if (rect.width > 2048 || rect.height > 2048)
    throw new Error('This view exceeds the capture dimensions; select a smaller component.');
  const blob = await captureRenderedSurfacePng(target);
  assertReady(target);
  if (!matches()) throw new Error('The definition or viewer state changed during capture.');
  if (blob.size > 5_000_000)
    throw new Error('The captured PNG exceeds 5 MB; select a smaller component.');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]!);
    reader.onerror = () => reject(new Error('Could not read the rendered PNG.'));
    reader.readAsDataURL(blob);
  });
}

/** One lease per mounted renderer; polling is serialized and stops on unmount. */
export function useA2uiVisualViewer(
  root: RefObject<HTMLDivElement | null>,
  surface: A2UISurface,
  model: SurfaceModel<ReactComponentImplementation> | undefined,
  artifactId = '',
  enabled = true,
): void {
  const repository = useRepository();
  const epoch = useRef(0);
  const viewerId = useRef(crypto.randomUUID());
  useEffect(() => {
    const node = root.current;
    if (!enabled || !node || !model || !repository.reportA2uiViewer) return;
    const abort = new AbortController();
    let timer = 0;
    let unsupported = false;
    let fingerprint = '';
    const observer = new MutationObserver(() => {
      epoch.current += 1;
    });
    observer.observe(node, {
      subtree: true,
      attributes: true,
      childList: true,
      characterData: true,
    });
    const report = (): A2uiViewerReport => {
      const state = { ...visualViewState(node), ...boundControls(surface, model) };
      let ready = true;
      let detail = '';
      try {
        assertReady(node);
      } catch (failure) {
        ready = false;
        detail = failure instanceof Error ? failure.message : String(failure);
      }
      const observed = {
        ...(compactVisualState(state) as Record<string, unknown>),
        readiness: { ready, detail },
      };
      const next = JSON.stringify(observed);
      if (fingerprint && next !== fingerprint) epoch.current += 1;
      fingerprint = next;
      return {
        viewer_id: viewerId.current,
        surface_id: surface.id,
        revision: surface.revision,
        view_revision: epoch.current,
        artifact_id: artifactId,
        state: observed,
        visible: displayed(node) && document.visibilityState === 'visible',
        ready,
      };
    };
    const cycle = async () => {
      try {
        const requests = await repository.reportA2uiViewer(
          surface.session_id,
          report(),
          abort.signal,
        );
        for (const request of requests) {
          if (request.data_model_update) {
            let error = '';
            try {
              const current = report();
              if (
                current.revision !== request.revision ||
                current.view_revision !== request.view_revision
              )
                throw new Error('The view changed before its control could be applied.');
              const { path, value } = request.data_model_update;
              if (!boundControls(surface, model).controls.some((control) => control.path === path))
                throw new Error('The requested path is not a declared view binding.');
              model.dataModel.set(path, value);
              epoch.current += 1;
              await nextFrame();
            } catch (failure) {
              error = failure instanceof Error ? failure.message : String(failure);
            }
            const current = report();
            await repository.reportA2uiViewer(surface.session_id, current, abort.signal);
            await repository.completeA2uiCapture(
              surface.session_id,
              {
                request_id: request.request_id,
                viewer_id: viewerId.current,
                revision: current.revision,
                view_revision: current.view_revision,
                previous_view_revision: request.view_revision,
                ...(error ? { error } : {}),
              },
              abort.signal,
            );
            continue;
          }
          let png = '',
            error = '';
          const matches = () => {
            const current = report();
            return (
              !abort.signal.aborted &&
              current.revision === request.revision &&
              current.view_revision === request.view_revision
            );
          };
          let budget = 0;
          const renew = window.setInterval(() => {
            void repository
              .reportA2uiViewer(surface.session_id, report(), abort.signal)
              .catch(() => undefined);
          }, 750);
          try {
            png = await Promise.race([
              captureVisualRequest(node, request, matches),
              new Promise<never>((_, reject) => {
                budget = window.setTimeout(
                  () => reject(new Error('Renderer capture timed out.')),
                  10_000,
                );
              }),
            ]);
          } catch (failure) {
            error = failure instanceof Error ? failure.message : String(failure);
          } finally {
            window.clearTimeout(budget);
            window.clearInterval(renew);
          }
          // Report the post-capture epoch first. The server also rejects changes
          // during capture, independently of the local comparison.
          await repository.reportA2uiViewer(surface.session_id, report(), abort.signal);
          await repository.completeA2uiCapture(
            surface.session_id,
            {
              request_id: request.request_id,
              viewer_id: viewerId.current,
              revision: request.revision,
              view_revision: request.view_revision,
              ...(error ? { error } : { png_base64: png }),
            },
            abort.signal,
          );
        }
      } catch (error) {
        // Older servers have no capture capability. Network failures expire the
        // lease and reach the agent as unavailable; no stale image is delivered.
        if (
          !abort.signal.aborted &&
          error instanceof Error &&
          'status' in error &&
          error.status === 404
        )
          unsupported = true;
      } finally {
        if (!abort.signal.aborted && !unsupported)
          timer = window.setTimeout(() => void cycle(), 750);
      }
    };
    void cycle();
    return () => {
      abort.abort();
      observer.disconnect();
      window.clearTimeout(timer);
      epoch.current += 1;
    };
  }, [artifactId, enabled, model, repository, root, surface]);
}
