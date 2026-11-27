import { useContext, useEffect, useRef, type RefObject } from 'react';
import type { SurfaceModel } from '@a2ui/web_core/v0_9';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import type {
  A2uiCaptureRequest,
  A2uiViewerReadiness,
  A2uiViewerReport,
  A2UISurface,
} from '@clio/core/v3';
import type { View } from 'vega';
import type { MapLibreMap } from 'maplibre-gl';
import { useRepository } from '@/hooks/use-repository';
import { captureRenderedSurfacePng } from './a2ui-region-capture';
import { A2uiViewerLease, A2uiViewerLeaseContext } from './a2ui-viewer-lease';
import {
  CAPTURE_MOUNTED_VIEWERS,
  inOffscreenViewer,
  VIEWER_DEFERRED_ATTRIBUTE,
  VIEWER_OFFSCREEN_ATTRIBUTE,
  withGatedViewersMounted,
} from './viewer-capture-mount';

interface VisualNode extends HTMLElement {
  __clioMap?: MapLibreMap;
  __clioMapFailure?: string;
  __clioChart?: { view: View };
  __clioMeshState?: () => unknown;
  __clioMeshCapture?: () => HTMLCanvasElement;
  __clioVisualReference?: () => unknown;
}

export function displayed(node: HTMLElement): boolean {
  const rect = node.getBoundingClientRect();
  return (
    node.isConnected &&
    rect.width > 0 &&
    rect.height > 0 &&
    getComputedStyle(node).visibility !== 'hidden' &&
    getComputedStyle(node).display !== 'none'
  );
}

/**
 * Displayed and part of the view a person sees: an off-screen gated viewer, deferred or
 * mounted only while a capture runs, is neither (`VIEWER_OFFSCREEN_ATTRIBUTE`).
 */
function shown(node: HTMLElement): boolean {
  return displayed(node) && !inOffscreenViewer(node);
}

function componentId(node: Element): string | null | undefined {
  return node.closest('[data-a2ui-component-id]')?.getAttribute('data-a2ui-component-id');
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
    .filter(shown)
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
    .filter(shown)
    .map((node) => ({
      component_id: componentId(node),
      state: node.__clioMeshState?.(),
      ready: Boolean(node.__clioMeshCapture),
    }));
  const rect = root.getBoundingClientRect();
  return {
    viewport: { width: rect.width, height: rect.height },
    maps,
    meshes,
    // Viewers scrolled out of view; a capture mounts them while it runs.
    offscreen_views: [...root.querySelectorAll<HTMLElement>(`[${VIEWER_OFFSCREEN_ATTRIBUTE}]`)].map(
      (node) => ({ component_id: componentId(node) }),
    ),
    data_views: [...root.querySelectorAll<VisualNode>('[data-slot="surface-toolbar"]')]
      .filter((node) => !inOffscreenViewer(node))
      .map((node) => ({
        component_id: componentId(node),
        reference: node.__clioVisualReference?.(),
      })),
    tabs: [...root.querySelectorAll<HTMLElement>('[role="tab"][aria-selected="true"]')]
      .filter(shown)
      .map((node) => ({ id: node.id, label: node.textContent })),
    inputs: [
      ...root.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select, textarea'),
    ]
      .filter(shown)
      .map((node) => ({
        name: node.name,
        value: node.value,
        ...(node instanceof HTMLInputElement ? { checked: node.checked } : {}),
      })),
  };
}

/**
 * A view that cannot become ready as it is: a renderer declared its own failure. Its
 * message is that renderer's text. Anything else that is not ready may still be.
 */
class A2uiViewFailure extends Error {}

/** The readiness a viewer reports (`state.readiness`), from `assertReady`. */
export function viewReadiness(target: HTMLElement, capture = false): A2uiViewerReadiness {
  try {
    assertReady(target, capture);
    return { ready: true, state: 'ready', detail: '' };
  } catch (failure) {
    return {
      ready: false,
      state: failure instanceof A2uiViewFailure ? 'failed' : 'loading',
      detail: failure instanceof Error ? failure.message : String(failure),
    };
  }
}

/**
 * Whether `target` can be captured now. The view a person sees (`capture` false, the
 * viewer's report) leaves out off-screen gated viewers, which a capture mounts itself;
 * a capture (`capture` true) also waits for those it mounted. A renderer's declared
 * failure throws `A2uiViewFailure`; every other refusal is a view still coming up.
 */
function assertReady(target: HTMLElement, capture = false): void {
  const counts = capture ? displayed : shown;
  if (!displayed(target) || document.visibilityState !== 'visible')
    throw new Error('The requested view is hidden or unmounted.');
  if (
    target.matches('[data-slot="a2ui-surface-root"]') &&
    !target.querySelector('[data-a2ui-component-id]')
  )
    throw new Error('The surface components have not mounted yet.');
  const failed = [
    // Authored callouts can use alert accessibility semantics, including
    // critical findings. Their content is not a renderer failure.
    ...(target.matches('[role="alert"]:not([data-a2ui-callout]), [data-visual-state="failed"]')
      ? [target]
      : []),
    ...target.querySelectorAll<HTMLElement>(
      '[role="alert"]:not([data-a2ui-callout]), [data-visual-state="failed"]',
    ),
  ].find(counts);
  if (failed)
    throw new A2uiViewFailure(
      // i18n-ignore: returned to the agent, kept in English like other text sent to the agent
      failed.textContent || 'A required view failed to render.',
    );
  if (
    [
      ...(target.matches('[aria-busy="true"], [data-visual-state="loading"]') ? [target] : []),
      ...target.querySelectorAll<HTMLElement>('[aria-busy="true"], [data-visual-state="loading"]'),
    ].some(counts)
  )
    throw new Error('Required data or rendering is still loading.');
  if (
    [
      ...(target.hasAttribute(VIEWER_DEFERRED_ATTRIBUTE) ? [target] : []),
      ...target.querySelectorAll<HTMLElement>(`[${VIEWER_DEFERRED_ATTRIBUTE}]`),
    ].some(counts)
  )
    throw new Error('A view is still mounting for the capture.');
  for (const node of target.querySelectorAll<VisualNode>('[data-slot="a2ui-map-surface"]')) {
    if (!counts(node)) continue;
    if (node.__clioMapFailure) throw new A2uiViewFailure(node.__clioMapFailure);
    if (!node.__clioMap?.loaded() || !node.__clioMap.areTilesLoaded() || node.__clioMap.isMoving())
      throw new Error('Map data, tiles or camera are not ready.');
  }
  for (const node of target.querySelectorAll<VisualNode>('[data-slot="a2ui-chart-view"]')) {
    if (counts(node) && !node.__clioChart) throw new Error('The chart has not completed layout.');
  }
  for (const node of target.querySelectorAll<VisualNode>(
    '[data-slot="a2ui-mesh-viewport"] div[role="img"]',
  )) {
    if (counts(node) && !node.__clioMeshCapture)
      throw new Error('The mesh graphics frame is unavailable.');
  }
  for (const image of target.querySelectorAll('img')) {
    if (!counts(image)) continue;
    if (!image.complete) throw new Error('A required image is still loading.');
    // A complete image without pixels failed to load; the browser does not retry it.
    if (!image.naturalWidth)
      // i18n-ignore: returned to the agent, kept in English like other text sent to the agent
      throw new A2uiViewFailure('A required image is unavailable.');
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
  const shown = target;
  return withGatedViewersMounted(shown, () => captureMounted(shown, matches));
}

async function captureMounted(target: HTMLElement, matches: () => boolean): Promise<string> {
  await document.fonts.ready;
  await nextFrame();
  // Required data and tiles have a bounded chance to finish. An unavailable
  // view remains a failure, never the last canvas frame from an earlier query.
  for (let attempt = 0; ; attempt += 1) {
    try {
      assertReady(target, true);
      break;
    } catch (error) {
      // A renderer's declared failure will not clear by waiting; return its reason now.
      if (error instanceof A2uiViewFailure || !displayed(target) || attempt >= 70 || !matches())
        throw error;
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
  }
  for (const node of target.querySelectorAll<VisualNode>('[data-slot="a2ui-chart-view"]')) {
    if (displayed(node)) await node.__clioChart?.view.runAsync();
  }
  await nextFrame();
  if (!matches()) throw new Error('The definition or viewer state changed before capture.');
  const rect = target.getBoundingClientRect();
  const ratio = visualCapturePixelRatio(rect.width, rect.height, window.devicePixelRatio || 1);
  const blob = await captureRenderedSurfacePng(target, ratio);
  assertReady(target, true);
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

/** Fit a whole report within the server's 4096px PNG bound without shrinking CSS text. */
export function visualCapturePixelRatio(width: number, height: number, density: number): number {
  if (!(width > 0 && height > 0 && width <= 4096 && height <= 4096))
    throw new Error('This view exceeds the capture dimensions; select a smaller component.');
  return Math.min(Math.max(density, 1), 2, 4096 / width, 4096 / height);
}

/** Renderer reassignments of identical SVG attributes do not change the displayed view. */
export function visualMutationsChanged(records: MutationRecord[]): boolean {
  return records.some((record) => {
    if (record.type === 'attributes') {
      const target = record.target as Element;
      return (
        record.oldValue !== target.getAttributeNS(record.attributeNamespace, record.attributeName!)
      );
    }
    if (record.type === 'characterData') return record.oldValue !== record.target.nodeValue;
    return true;
  });
}

/**
 * Run one capture within the renderer's budget, renewing the viewer's lease while it
 * runs. Returns the PNG or the reason there is none, never an earlier frame.
 */
export async function runCaptureBudget(
  work: () => Promise<string>,
  renew: () => void,
): Promise<{ png: string; error: string }> {
  let budget = 0;
  const renewal = window.setInterval(renew, 750);
  try {
    const png = await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        budget = window.setTimeout(() => reject(new Error('Renderer capture timed out.')), 10_000);
      }),
    ]);
    return { png, error: '' };
  } catch (failure) {
    return { png: '', error: failure instanceof Error ? failure.message : String(failure) };
  } finally {
    window.clearTimeout(budget);
    window.clearInterval(renewal);
  }
}

/**
 * One lease per mounted renderer; polling is serialized and stops on unmount. A
 * transcript surface shares its lease (`A2uiViewerLeaseContext`) with the viewer that
 * reports for it while it is suspended off screen.
 */
export function useA2uiVisualViewer(
  root: RefObject<HTMLDivElement | null>,
  surface: A2UISurface,
  model: SurfaceModel<ReactComponentImplementation> | undefined,
  artifactId = '',
  enabled = true,
): void {
  const repository = useRepository();
  const shared = useContext(A2uiViewerLeaseContext);
  const ownLease = useRef<A2uiViewerLease | null>(null);
  useEffect(() => {
    const node = root.current;
    // While the surface is mounted only for an off-screen capture, its suspended
    // viewer owns the lease and runs that capture.
    if (!enabled || shared?.suspended || !node || !model || !repository.reportA2uiViewer) return;
    const lease = shared?.lease ?? (ownLease.current ??= new A2uiViewerLease());
    const abort = new AbortController();
    let timer = 0;
    let unsupported = false;
    let fingerprint = '';
    // A viewer off screen, including one a capture mounts, is not the person's view.
    const observer = new MutationObserver((records) => {
      if (visualMutationsChanged(records.filter((record) => !inOffscreenViewer(record.target))))
        lease.advance();
    });
    observer.observe(node, {
      subtree: true,
      attributes: true,
      attributeOldValue: true,
      childList: true,
      characterData: true,
      characterDataOldValue: true,
    });
    let settledViewport: unknown;
    const report = (): A2uiViewerReport => {
      const view = visualViewState(node);
      // Viewers a capture mounts can resize the surface while it runs; that is the
      // capture's own doing, not the person's view changing, so the size stays the one
      // the view had without them.
      if (settledViewport && node.querySelector(CAPTURE_MOUNTED_VIEWERS))
        view.viewport = settledViewport;
      else settledViewport = view.viewport;
      const state = { ...view, ...boundControls(surface, model) };
      const readiness = viewReadiness(node);
      const observed = {
        ...(compactVisualState(state) as Record<string, unknown>),
        readiness,
      };
      const next = JSON.stringify(observed);
      if (fingerprint && next !== fingerprint) lease.advance();
      fingerprint = next;
      return {
        viewer_id: lease.viewerId,
        surface_id: surface.id,
        revision: surface.revision,
        view_revision: lease.epoch,
        artifact_id: artifactId,
        state: observed,
        visible: displayed(node) && document.visibilityState === 'visible',
        ready: readiness.ready,
      };
    };
    // Every report can claim requests, including renewals while a capture runs (a
    // request the server sent after an earlier one expired). Each is kept until this
    // viewer has answered it; dropping one leaves the agent waiting out its budget.
    const claimed: A2uiCaptureRequest[] = [];
    const renew = async (current = report()) => {
      claimed.push(
        ...(await repository.reportA2uiViewer(surface.session_id, current, abort.signal)),
      );
    };
    const cycle = async () => {
      try {
        await renew();
        for (let request = claimed.shift(); request; request = claimed.shift()) {
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
              lease.advance();
              await nextFrame();
            } catch (failure) {
              error = failure instanceof Error ? failure.message : String(failure);
            }
            const current = report();
            await renew(current);
            await repository.completeA2uiCapture(
              surface.session_id,
              {
                request_id: request.request_id,
                viewer_id: lease.viewerId,
                revision: current.revision,
                view_revision: current.view_revision,
                previous_view_revision: request.view_revision,
                ...(error ? { error } : {}),
              },
              abort.signal,
            );
            continue;
          }
          const matches = () => {
            const current = report();
            return (
              !abort.signal.aborted &&
              current.revision === request.revision &&
              current.view_revision === request.view_revision
            );
          };
          const { png, error } = await runCaptureBudget(
            () => captureVisualRequest(node, request, matches),
            () => void renew().catch(() => undefined),
          );
          // Report the post-capture epoch first. The server also rejects changes
          // during capture, independently of the local comparison.
          await renew();
          await repository.completeA2uiCapture(
            surface.session_id,
            {
              request_id: request.request_id,
              viewer_id: lease.viewerId,
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
      lease.advance();
    };
  }, [artifactId, enabled, model, repository, root, shared, surface]);
}
