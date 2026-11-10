import {
  DTypeClass,
  EntityKind,
  ShapeClass,
  hasArrayShape,
  hasChildren,
  hasNumericType,
  isDataset,
  isGroup,
  type DType,
  type ProvidedEntity,
} from '@h5web/app';
import { HDF5_MODES, type Hdf5Mode } from './protocol';

/**
 * Drives h5web's own controls from the host's frame.
 *
 * h5web's `App` takes no prop for its visualization or Display/Inspect mode,
 * and its breadcrumb bar and visualization tabs are hidden (viewer.css) so the
 * host's frame is the only toolbar. They stay in the DOM: this reads their
 * state and clicks them, by their accessible names, not their hashed classes.
 */

const VIS_TABS = '[role="tablist"][aria-label="Visualization"] [role="tab"]';
const VIEWER_MODE_TABS = '[role="tablist"][aria-label="Viewer mode"] [role="tab"]';
const SIDEBAR_TOGGLE = 'button[aria-label="Toggle sidebar"]';

const PLOTS = new Set(['Line', 'ComplexLine', 'NX Line', 'NX Complex Line', 'NX Scatter']);
const IMAGES = new Set(['Heatmap', 'ComplexHeatmap', 'RGB', 'Surface', 'NX Heatmap', 'NX RGB']);

/** The frame mode an h5web visualization belongs to; matrices, scalars and the rest are tables. */
export function modeOfVis(name: string): Hdf5Mode {
  if (PLOTS.has(name)) return 'plot';
  if (IMAGES.has(name)) return 'image';
  return 'table';
}

export interface ViewState {
  modes: Hdf5Mode[];
  mode?: Hdf5Mode;
  explorer: boolean;
}

function visTabs(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(VIS_TABS)];
}

function viewerModeTab(root: ParentNode, label: 'Display' | 'Inspect'): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>(VIEWER_MODE_TABS)].find(
    (tab) => tab.textContent?.trim() === label || tab.getAttribute('aria-label') === label,
  );
}

function isInspecting(root: ParentNode): boolean {
  return viewerModeTab(root, 'Inspect')?.getAttribute('aria-checked') === 'true';
}

function visName(tab: Element): string {
  return tab.textContent?.trim() ?? '';
}

/**
 * The modes h5web offers for the current object. While Attributes shows,
 * h5web unmounts its visualizations, so the display modes last seen stay.
 */
export function readView(root: ParentNode, previous?: ViewState): ViewState {
  const tabs = visTabs(root);
  const inspecting = isInspecting(root);
  const display = tabs.length
    ? tabs.map((tab) => modeOfVis(visName(tab)))
    : inspecting
      ? (previous?.modes.filter((mode) => mode !== 'attributes') ?? [])
      : [];
  const offered = new Set<Hdf5Mode>(display);
  if (viewerModeTab(root, 'Inspect')) offered.add('attributes');
  const selected = tabs.find((tab) => tab.getAttribute('aria-selected') === 'true');
  return {
    modes: HDF5_MODES.filter((mode) => offered.has(mode)),
    mode: inspecting ? 'attributes' : selected ? modeOfVis(visName(selected)) : undefined,
    explorer: explorerOpen(root),
  };
}

/**
 * The host's frame owns the object tree's toggle, kept as `data-explorer` on
 * the viewer root. h5web collapses its tree whenever the page is narrower
 * than its 500px main area plus a 150px tree, which a workbench pane usually
 * is; viewer.css keeps the tree visible there while this says open.
 */
const EXPLORER = 'data-explorer';
/**
 * The narrowest pane, in CSS pixels, that fits the tree beside a plot: h5web
 * keeps about 200px of a heatmap's width for its axis and colour bar, so a
 * narrower split leaves the data a sliver. Below it the tree starts closed,
 * and opening it shows the tree in the plot's place (viewer.css).
 */
export const MIN_EXPLORER_PANE = 720;

function paneFitsExplorer(root: Element): boolean {
  return (root.ownerDocument.defaultView?.innerWidth ?? Infinity) >= MIN_EXPLORER_PANE;
}

function explorerOpen(root: ParentNode): boolean {
  const state = root instanceof Element ? root.getAttribute(EXPLORER) : null;
  if (state) return state === 'open';
  return root.querySelector(SIDEBAR_TOGGLE)?.getAttribute('aria-pressed') === 'true';
}

/**
 * Show `mode`. Returns false when it has to wait for h5web to render the
 * visualizations, which happens after leaving Attributes.
 */
export function selectMode(root: ParentNode, mode: Hdf5Mode): boolean {
  const inspecting = isInspecting(root);
  if (mode === 'attributes') {
    if (!inspecting) viewerModeTab(root, 'Inspect')?.click();
    return true;
  }
  if (inspecting) {
    viewerModeTab(root, 'Display')?.click();
    if (!visTabs(root).length) return false;
  }
  const tabs = visTabs(root);
  if (!tabs.length) return false;
  const tab = tabs.find((candidate) => modeOfVis(visName(candidate)) === mode);
  if (tab && tab.getAttribute('aria-selected') !== 'true') tab.click();
  return true;
}

export function setExplorer(root: ParentNode, open: boolean): void {
  if (root instanceof Element) root.setAttribute(EXPLORER, open ? 'open' : 'closed');
  const toggle = root.querySelector<HTMLElement>(SIDEBAR_TOGGLE);
  if (toggle && (toggle.getAttribute('aria-pressed') === 'true') !== open) toggle.click();
}

/**
 * Report the view state whenever h5web changes it, and apply the host's
 * requests, including a mode that waits for its visualizations to render.
 */
export function observeView(root: Element, onChange: (state: ViewState) => void) {
  let last: ViewState | undefined;
  let lastKey = '';
  let pending: Hdf5Mode | undefined;
  const check = () => {
    if (pending && selectMode(root, pending)) pending = undefined;
    const next = readView(root, last);
    const key = JSON.stringify(next);
    last = next;
    if (key === lastKey) return;
    lastKey = key;
    onChange(next);
  };
  const observer = new MutationObserver(check);
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['aria-selected', 'aria-checked', 'aria-pressed', EXPLORER],
  });
  // The tree opens beside the data, as the Array view draws it, unless the pane
  // is too narrow to show both; the Explorer toggle opens it there, in the
  // plot's place. Crossing that width while reading closes or reopens it.
  let wide = paneFitsExplorer(root);
  if (!root.hasAttribute(EXPLORER)) setExplorer(root, wide);
  const win = root.ownerDocument.defaultView;
  const onResize = () => {
    const next = paneFitsExplorer(root);
    if (next === wide) return;
    wide = next;
    setExplorer(root, next);
  };
  win?.addEventListener('resize', onResize);
  check();
  return {
    show({ mode, explorer }: { mode?: Hdf5Mode; explorer?: boolean }) {
      if (explorer !== undefined) setExplorer(root, explorer);
      if (mode) pending = selectMode(root, mode) ? undefined : mode;
      check();
    },
    /** A dataset was opened: where the tree covers the plot, it steps aside. */
    opened() {
      if (!wide && explorerOpen(root)) setExplorer(root, false);
    },
    dispose: () => {
      observer.disconnect();
      win?.removeEventListener('resize', onResize);
    },
  };
}

/** A dataset's dimensions, `[]` for a scalar; undefined for an empty dataset or another kind. */
export function shapeOf(entity: ProvidedEntity): number[] | undefined {
  if (entity.kind !== EntityKind.Dataset) return undefined;
  if (entity.shape.class === ShapeClass.Null) return undefined;
  return entity.shape.dims;
}

/** A dataset's element type in numpy's words: `float32`, `uint8`, `bool`. */
export function dtypeName(type: DType): string {
  switch (type.class) {
    case DTypeClass.Integer:
      return `${type.signed ? 'int' : 'uint'}${type.size}`;
    case DTypeClass.Float:
      return `float${type.size}`;
    case DTypeClass.Complex:
      return `complex${'size' in type.realType ? type.realType.size * 2 : ''}`;
    case DTypeClass.Bool:
      return 'bool';
    case DTypeClass.String:
      return 'string';
    case DTypeClass.Compound:
      return 'compound';
    case DTypeClass.Enum:
      return 'enum';
    default:
      return type.class.toLowerCase();
  }
}

export function entityKind(entity: ProvidedEntity): 'dataset' | 'group' | 'other' {
  if (entity.kind === EntityKind.Dataset) return 'dataset';
  if (entity.kind === EntityKind.Group) return 'group';
  return 'other';
}

/** Most groups read while looking for a file's first dataset. */
const MAX_SEARCHED_GROUPS = 32;

/**
 * The path of the file's first array dataset, numeric ones first, searched
 * breadth first; or `/` when the root names a NeXus default, has none, or
 * cannot be read (h5web then shows why). `get` is h5web's suspending entity
 * read, so this runs during render.
 */
export function firstArrayDataset(get: (path: string) => ProvidedEntity): string {
  try {
    const root = get('/');
    if (!isGroup(root) || root.attributes.some((attr) => attr.name === 'default')) return '/';
    const queue: ProvidedEntity[] = [root];
    let fallback: string | undefined;
    for (let searched = 0; queue.length && searched < MAX_SEARCHED_GROUPS; searched += 1) {
      const group = queue.shift();
      if (!group || !isGroup(group) || !hasChildren(group)) continue;
      for (const child of group.children) {
        if (!isDataset(child) || !hasArrayShape(child)) continue;
        if (hasNumericType(child)) return child.path;
        fallback ??= child.path;
      }
      for (const child of group.children) if (isGroup(child)) queue.push(get(child.path));
    }
    if (fallback) return fallback;
  } catch (error) {
    if (isThenable(error)) throw error;
  }
  return '/';
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as PromiseLike<unknown> | undefined)?.then === 'function';
}
