import * as React from 'react';
import { useCascaderLoader } from '@/components/reui/cascader/cascader-async';
import type {
  CascaderGetChildren,
  CascaderOnSearch,
  CascaderResolveValue,
} from '@/components/reui/cascader/cascader-async';
import {
  CascaderActionsContext,
  CascaderHighlightContext,
  CascaderRenderContext,
  CascaderStateContext,
  createCascaderHighlightStore,
  useCascaderActions,
  useCascaderHighlight,
  useCascaderRender,
  useCascaderState,
} from '@/components/reui/cascader/cascader-context';
import type {
  CascaderActionsContextValue,
  CascaderColumn,
  CascaderHighlight,
  CascaderHighlightStore,
  CascaderItemState,
  CascaderRenderContextValue,
  CascaderStateContextValue,
} from '@/components/reui/cascader/cascader-context';
import { resolveCascaderLabels } from '@/components/reui/cascader/cascader-i18n';
import {
  applyCascadeSelection,
  buildCascaderIndex,
  CASCADER_LIST_HEIGHT_CLASS,
  CASCADER_LIST_PAD_CLASS,
  CASCADER_ROOT_KEY,
  CASCADER_ROWS_CLASS,
  CASCADER_SCROLL_CLASS,
  createCascaderMoreNode,
  filterCascaderLevel,
  findCascaderDataIssues,
  flattenCascaderTree,
  getCascaderChildren,
  getCascaderCount,
  getCascaderIndeterminateFrom,
  getCascaderPath,
  getCascaderSelectedDescendants,
  getCascaderTabTarget,
  isCascaderBranch,
  isCascaderMoreNode,
  isCascaderSelectable,
  matchesCascaderQuery,
  mergeCascaderIndex,
  normalizeCascaderQuery,
  searchCascaderDeep,
  warnCascaderOnce,
} from '@/components/reui/cascader/cascader-lib';
import type {
  CascaderChangeDetails,
  CascaderChangeReason,
  CascaderFlatNode,
  CascaderIndex,
  CascaderLabels,
  CascaderLoadState,
  CascaderMode,
  CascaderNode,
  CascaderSearchScope,
  CascaderSelectable,
} from '@/components/reui/cascader/cascader-types';
import { Combobox as ComboboxPrimitive } from '@base-ui/react';

import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

/** Stable `filteredItems` for a level swap; a fixed identity cannot loop. */
const EMPTY: CascaderNode<never>[] = [];

// Word joiner. A polite region reads only MUTATIONS, so alternate it.
const ANNOUNCE_MARKER = '\u2060';

// Delay before a query result-count reaches the live region: polite
// announcements queue, and re-announcing per keystroke plays back stale
// counts. Only the count defers; every event-shaped one stays immediate.
const ANNOUNCE_DEBOUNCE = 150;

/* -------------------------------------------------------------------------- */
/*                                   State                                    */
/* -------------------------------------------------------------------------- */

// Minimal controlled/uncontrolled resolver, hand-rolled because the repo has
// no shared `useControllableState`; the root needs it five times.
function useControllable<V>(
  controlled: V | undefined,
  defaultValue: V,
  onChange?: (value: V) => void,
  /** Prop name, used only by the development-time switching warning. */
  devName?: string,
): [V, (next: V | ((prev: V) => V)) => void] {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue);
  const isControlled = controlled !== undefined;
  const value = isControlled ? controlled : uncontrolled;

  // Switching controlled/uncontrolled mid-life strands half the state.
  const wasControlled = React.useRef(isControlled);
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (wasControlled.current === isControlled || !devName) return;
    const from = wasControlled.current ? 'controlled' : 'uncontrolled';
    const to = isControlled ? 'controlled' : 'uncontrolled';
    wasControlled.current = isControlled;
    warnCascaderOnce(
      `controlled-switch:${devName}`,
      `\`${devName}\` switched from ${from} to ${to}. Decide once: pass \`${devName}\` for the whole life of the component, or pass only the default and let the cascader own it.`,
    );
  }, [isControlled, devName]);

  // Written in an EFFECT: a discarded render would still have mutated a ref.
  const latest = React.useRef({ value, isControlled, onChange });
  React.useEffect(() => {
    latest.current = { value, isControlled, onChange };
  });

  // The last PROP seen: it differs from the optimistic advance exactly when a
  // controlled parent declines a change and re-renders nothing.
  const lastProp = React.useRef(controlled);
  React.useEffect(() => {
    lastProp.current = controlled;
  });

  const set = React.useCallback((next: V | ((prev: V) => V)) => {
    const current = latest.current.value;
    const resolved = typeof next === 'function' ? (next as (prev: V) => V)(current) : next;
    if (Object.is(resolved, current)) {
      // Dedup against the last PROP, not the optimistic advance: a parent that
      // declines re-renders nothing, so deduping on the advance left the popup
      // un-dismissable from the second Escape on.
      if (!latest.current.isControlled || Object.is(resolved, lastProp.current)) {
        return;
      }
    }

    // Advance now so two updates in ONE batch compose, rather than the second
    // reading a stale value and its `Object.is` dedup dropping it.
    latest.current = { ...latest.current, value: resolved };

    if (!latest.current.isControlled) setUncontrolled(resolved);
    latest.current.onChange?.(resolved);
  }, []);

  return [value, set];
}

/* -------------------------------------------------------------------------- */
/*                              Shallow stability                             */
/* -------------------------------------------------------------------------- */

function shallowEqualRecords(a: object, b: object): boolean {
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  if (keys.length !== Object.keys(right).length) return false;
  for (const key of keys) {
    if (!Object.is(left[key], right[key])) return false;
  }
  return true;
}

// Reuses the previous value while the next merely says the same thing: an
// inline `labels` otherwise republishes the actions context, and
// with it every row. Adjust-state-during-render, not a ref.
function useShallowStable<V>(value: V, equal: (a: V & object, b: V & object) => boolean): V {
  const [stable, setStable] = React.useState(value);
  if (Object.is(value, stable)) return stable;
  const comparable =
    typeof value === 'object' && value !== null && typeof stable === 'object' && stable !== null;
  if (comparable && equal(value as V & object, stable as V & object)) {
    return stable;
  }
  setStable(value);
  return value;
}

/* -------------------------------------------------------------------------- */
/*                                  Context                                   */
/* -------------------------------------------------------------------------- */

/** The pre-split shape, merged, so `useCascader()` returns what it always did. */
export interface CascaderContextValue<T = unknown>
  extends CascaderActionsContextValue<T>,
    CascaderStateContextValue<T> {}

/**
 * The cascader's internals, typed for the caller's own item payload.
 * @deprecated Reads BOTH halves, so a caller re-renders on every keystroke.
 * Prefer `useCascaderActions()` or `useCascaderState()`. Kept for compat.
 */
export function useCascader<T = unknown>(): CascaderContextValue<T> {
  const actions = useCascaderActions<T>();
  const state = useCascaderState<T>();

  return React.useMemo(() => ({ ...actions, ...state }), [actions, state]);
}

/* -------------------------------------------------------------------------- */
/*                              Headless selection                            */
/* -------------------------------------------------------------------------- */

export interface CascaderSelection<T = unknown> {
  /** The selected nodes, resolved. Empty when nothing is selected. */
  selected: CascaderNode<T>[];
  /** Ancestor chain per selected node, root first, node last. */
  paths: CascaderNode<T>[][];
  /** The single selection, or the first one in `multiple` mode. */
  first: CascaderNode<T> | null;
  /** Ancestor chain of `first`. */
  firstPath: CascaderNode<T>[];
  count: number;
  isEmpty: boolean;
  multiple: boolean;
  remove: (value: string) => void;
  clear: () => void;
}

/** Headless access to the selection, for a trigger of the consumer's own.
 * Pass the payload explicitly to get `node.data` typed. */
export function useCascaderSelection<T = unknown>(): CascaderSelection<T> {
  const { multiple, setSelection } = useCascaderActions<T>();
  const { index, selectedValues } = useCascaderState<T>();

  return React.useMemo(() => {
    const selected = selectedValues
      .map((value) => index.byValue.get(value))
      .filter(Boolean) as CascaderNode<T>[];
    const paths = selectedValues.map((value) => getCascaderPath(index, value));

    return {
      selected,
      paths,
      first: selected[0] ?? null,
      firstPath: paths[0] ?? [],
      count: selectedValues.length,
      isEmpty: selectedValues.length === 0,
      multiple,
      remove: (value: string) => setSelection(selectedValues.filter((entry) => entry !== value)),
      // Explicit reason: emptying on purpose is not "deselect the last node".
      clear: () => setSelection([], 'clear'),
    };
  }, [index, selectedValues, multiple, setSelection]);
}

/* -------------------------------------------------------------------------- */
/*                                    Root                                    */
/* -------------------------------------------------------------------------- */

/**
 * Why the navigation path changed.
 * - `"drill"`: a branch was entered (row press, level arrow, deep-search hit).
 * - `"back"`: one level up (back control, Backspace on an empty query).
 * - `"breadcrumb"`: a jump to an exact depth in the trail.
 * - `"reveal"`: the reopen navigated to the level holding the selection.
 * - `"external"`: `setPath` called from outside the primitive's own flows.
 */
export type CascaderPathChangeReason = 'drill' | 'back' | 'breadcrumb' | 'reveal' | 'external';

/** Everything independent of the selection mode; the rest is on the two arms. */
export interface CascaderBaseProps<T = unknown> {
  /** Nested tree, or a flat list when `getParent` is supplied. */
  items: CascaderNode<T>[];
  /** Opt in to flat adjacency input by returning each node's parent value. */
  getParent?: (node: CascaderNode<T>) => string | null | undefined;

  /**
   * Fetches one level on demand; `node` is `null` for the root. Return an
   * array, or a `CascaderLoadResult` when the level pages. Pages cache apart
   * from `items`; mark unfetched branches `hasChildren` or they read as leaves.
   */
  getChildren?: CascaderGetChildren<T>;
  /**
   * Server-side search, debounced by `searchDebounce`; replaces the local scan
   * while the query is set. Results are detached: resolvable by value, in no
   * level. Ignored in `mode="tree"`, where a hit belongs to no visible branch.
   */
  onSearch?: CascaderOnSearch<T>;
  /** Milliseconds of quiet before `onSearch` fires. */
  searchDebounce?: number;
  /**
   * Resolves a value the loader has never seen into its ancestor chain, root
   * first, so the trigger can path a server-supplied selection. Does NOT mark
   * those levels loaded: opening one still fetches.
   */
  resolveValue?: CascaderResolveValue<T>;
  /** Cache key. Changing it drops every page and aborts anything in flight. */
  loadKey?: unknown;
  /** Prefetch a highlighted branch's children after a pause. Off by default. */
  prefetch?: boolean;
  /**
   * Called when a load fails. `context.parent` is the level (`null` for root);
   * `context.reason` is `"level"`, `"more"`, `"retry"`, `"prefetch"`,
   * `"search"` or `"resolve"`. Never for an aborted or superseded request.
   */
  onLoadError?: (error: unknown, context: { parent: string | null; reason: string }) => void;

  /** Which nodes may be committed. Defaults to leaves only. */
  selectable?: CascaderSelectable<T>;

  /**
   * Whether the built-in SINGLE-SELECT check is drawn. Defaults to true.
   * `false` also gives back the inline-end gutter every style reserves for it;
   * `data-selected` and `aria-selected` stay. A no-op under `multiple`, where
   * the checkbox is the selection CONTROL rather than a decoration.
   */
  indicator?: boolean;

  /**
   * Parent/child cascading. Multi-select only, off by default, and it needs
   * committable branches (`selectable="any"` or a predicate). A commit selects
   * or deselects every SELECTABLE node in the LOADED subtree and reconciles
   * ancestors. LOADED is the semantic, not a hedge: a commit must not fan out
   * into a request per level, so children arriving later arrive unchecked.
   */
  cascade?: boolean;

  mode?: CascaderMode;

  /** How a branch opens from the pointer in columns mode's ACTIVE column.
   * `"click"` is the default, and neither value ever commits a selection. */
  expandTrigger?: 'click' | 'hover';

  path?: string[];
  defaultPath?: string[];
  /** The second argument says WHY. An existing `(path) => void` still works. */
  onPathChange?: (path: string[], details: { reason: CascaderPathChangeReason }) => void;

  expanded?: string[];
  defaultExpanded?: string[];
  onExpandedChange?: (expanded: string[]) => void;

  open?: boolean;
  defaultOpen?: boolean;
  /** Forwards Base UI's reason; a leaf commit's close says `"item-press"`. */
  onOpenChange?: (open: boolean, details: { reason: string }) => void;

  /**
   * Whether a SINGLE-SELECT leaf commit closes the popup. Defaults to true.
   * `false` is for a compare-and-repick flow; Escape, outside press and the
   * trigger still close. Ignored under `multiple`, which never closes.
   */
  closeOnSelect?: boolean;

  inputValue?: string;
  defaultInputValue?: string;
  onInputValueChange?: (value: string) => void;

  searchScope?: CascaderSearchScope;
  /** Custom matcher, replacing label + keywords substring matching. */
  filter?: (node: CascaderNode<T>, normalizedQuery: string) => boolean;

  /** On open, navigate to the level holding the selection. Default true. */
  revealSelected?: boolean;

  maxHeight?: number | string;

  /**
   * Window the rendered rows. `undefined` decides per level from
   * `virtualizeThreshold`; `true`/`false` force it. Also opt-in at the markup
   * level, so the base install pulls in no virtualization library.
   */
  virtualize?: boolean;
  /** Row count at which windowing turns itself on. */
  virtualizeThreshold?: number;
  /** Row height handed to the virtualizer before a row has been measured. */
  estimateRowSize?: number;
  /** Rows rendered beyond each edge of the viewport. */
  overscan?: number;

  labels?: Partial<CascaderLabels>;
  /** Replaces the entire row, affordances included. */
  renderItem?: (node: CascaderNode<T>, state: CascaderItemState<T>) => React.ReactNode;
  /** Replaces only the label block; icon, count, chevron and check stay. */
  renderLabel?: (node: CascaderNode<T>, state: CascaderItemState<T>) => React.ReactNode;

  disabled?: boolean;
  /** Native form field name. Submits the selected value(s). */
  name?: string;
  /** Id of the owning form, for a cascader rendered outside it. */
  form?: string;
  /** Id of the control. Pairs the field with a `<label htmlFor>`. */
  id?: string;
  /** Marks the field required for native form validation. */
  required?: boolean;
  /** The value can be read and submitted, but not changed. */
  readOnly?: boolean;
  /** Marks the field invalid: `aria-invalid` and `data-invalid` on the trigger,
   * the chips and the input, which every style's error treatment reads. */
  invalid?: boolean;
  /** Ref to the hidden input Base UI submits with, for form-library focus. */
  inputRef?: React.Ref<HTMLInputElement>;
  /** Renders without a floating popup, for an embedded `CascaderPanel`. */
  inline?: boolean;

  children?: React.ReactNode;
}

export interface CascaderSingleProps<T = unknown> extends CascaderBaseProps<T> {
  multiple?: false;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string, details: CascaderChangeDetails<T>) => void;
  /** `never` so passing it is a compile error, not a silent no-op. */
  max?: never;
}

/** Multi-select props. Enables checkbox rows and chip display. */
export interface CascaderMultipleProps<T = unknown> extends CascaderBaseProps<T> {
  multiple: true;
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[], details: CascaderChangeDetails<T>) => void;
  /** Cap on selections. Further picks are refused, the existing ones survive. */
  max?: number;
}

/** `multiple` discriminates: `value`, `onValueChange` and `max` narrow with it. */
export type CascaderProps<T = unknown> = CascaderSingleProps<T> | CascaderMultipleProps<T>;

/** Normalizes to an array. `""` is "no selection", not a node: it is the
 * uncontrolled default, and resolving it would render a blank chip. */
function toArray(value: string | string[] | undefined): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter((entry) => entry !== '');
  return value === '' ? [] : [value];
}

/* -------------------------------------------------------------------------- */
/*                            Development warnings                            */
/* -------------------------------------------------------------------------- */

interface CascaderDevOptions<T> {
  items: CascaderNode<T>[];
  getParent?: (node: CascaderNode<T>) => string | null | undefined;
  mode: CascaderMode;
  multiple: boolean;
  cascade: boolean;
  indicator: boolean;
  selectable: CascaderSelectable<T>;
  searchScope: CascaderSearchScope;
  max: number | undefined;
  value: string | string[] | undefined;
  defaultValue: string | string[] | undefined;
  hasExpanded: boolean;
  hasPath: boolean;
  hasOnSearch: boolean;
}

/** Misconfigurations that are SILENT by design. Once each, never in prod. */
function useCascaderDevWarnings<T>(options: CascaderDevOptions<T>) {
  const {
    items,
    getParent,
    mode,
    multiple,
    cascade,
    indicator,
    selectable,
    searchScope,
    max,
    value,
    defaultValue,
    hasExpanded,
    hasPath,
    hasOnSearch,
  } = options;

  // O(n) over the raw input, so the memo is skipped outright in production.
  const issues = React.useMemo(
    () => (process.env.NODE_ENV === 'production' ? null : findCascaderDataIssues(items, getParent)),
    [items, getParent],
  );

  React.useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;

    for (const duplicate of issues?.duplicates ?? []) {
      warnCascaderOnce(
        `duplicate-value:${duplicate}`,
        `Duplicate node value ${JSON.stringify(duplicate)}. \`value\` is the selection key, so only the first occurrence is indexed and the rest never render.`,
      );
    }

    for (const cycle of issues?.cycles ?? []) {
      warnCascaderOnce(
        `cycle:${cycle}`,
        `\`getParent\` puts ${JSON.stringify(cycle)} on a cycle. The depth walk is cycle-guarded so nothing hangs, but every depth on that chain is clamped rather than derived.`,
      );
    }
  }, [issues]);

  React.useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;

    for (const [prop, current] of [
      ['value', value],
      ['defaultValue', defaultValue],
    ] as const) {
      if (current == null) continue;
      if (multiple && !Array.isArray(current)) {
        warnCascaderOnce(
          `value-shape:multiple:${prop}`,
          `\`multiple\` is set but \`${prop}\` is a string. Multi-select reads and writes a \`string[]\`; a string is treated as no selection at all.`,
        );
      } else if (!multiple && Array.isArray(current)) {
        warnCascaderOnce(
          `value-shape:single:${prop}`,
          `\`${prop}\` is an array but \`multiple\` is not set. Single-select reads and writes a \`string\`; only the first entry would survive a commit.`,
        );
      }
    }

    if (cascade && !multiple) {
      warnCascaderOnce(
        'cascade-without-multiple',
        '`cascade` does nothing without `multiple`: a single selection has no subtree to propagate over.',
      );
    }

    if (cascade && selectable === 'leaf') {
      warnCascaderOnce(
        'cascade-with-leaf-selectable',
        '`cascade` does nothing while `selectable="leaf"`: no branch can be committed, so no commit ever has a subtree under it. Pass `selectable="any"` or a predicate that accepts branches.',
      );
    }

    if (!indicator && multiple) {
      warnCascaderOnce(
        'indicator-false-with-multiple',
        '`indicator={false}` does nothing with `multiple`: the checkbox is the selection control rather than a decoration, so it and its gutter stay. Mark selection your own way from `data-selected` on the row, and drop the prop.',
      );
    }

    if (max != null && !multiple) {
      warnCascaderOnce(
        'max-without-multiple',
        '`max` does nothing without `multiple`: there is only ever one selection to cap.',
      );
    }

    if (hasExpanded && mode !== 'tree') {
      warnCascaderOnce(
        `expanded-outside-tree:${mode}`,
        `\`expanded\` only does something in \`mode="tree"\`, and this cascader is in \`mode="${mode}"\`. Drill and columns navigate with \`path\`.`,
      );
    }

    if (hasPath && mode === 'tree') {
      warnCascaderOnce(
        'path-in-tree',
        '`path` does nothing in `mode="tree"`: branches expand in place rather than replacing the level. Use `expanded`.',
      );
    }

    if (searchScope === 'deep' && mode === 'tree') {
      warnCascaderOnce(
        'deep-search-in-tree',
        '`searchScope="deep"` does nothing in `mode="tree"`: a tree query already matches at any depth and auto-expands the ancestors of every hit.',
      );
    }

    if (hasOnSearch && mode === 'tree') {
      warnCascaderOnce(
        'onsearch-in-tree',
        '`onSearch` does nothing in `mode="tree"`: a tree query filters the loaded tree in place, and a server hit belongs to no visible branch, so its results would never render. The request is not fired. Filter the tree locally, or use drill or columns for server search.',
      );
    }
  }, [
    mode,
    multiple,
    cascade,
    indicator,
    selectable,
    searchScope,
    max,
    value,
    defaultValue,
    hasExpanded,
    hasPath,
    hasOnSearch,
  ]);
}

/** What the `[]`-dep callbacks would otherwise close over. One ref, one
 * effect, so "the last committed render" is defined in exactly one place. */
interface CascaderLatest<T> {
  index: CascaderIndex<T>;
  state: CascaderStateContextValue<T>;
  mode: CascaderMode;
  multiple: boolean;
  cascade: boolean;
  max: number | undefined;
  labels: CascaderLabels;
  closeOnSelect: boolean;
  selectedValues: string[];
  deepResults: CascaderNode<T>[] | null;
  onValueChange:
    | ((value: string | string[], details: CascaderChangeDetails<T>) => void)
    | undefined;
  resolveNode: (value: string) => CascaderNode<T>;
  isSelectable: (node: CascaderNode<T>) => boolean;
  needsChildren: (node: CascaderNode<T>) => boolean;
  expanded: ReadonlySet<string>;
}

/** A navigation waiting on a fetch. The `kind`s differ: a drill appends, a
 * columns press replaces the trail from `depth`, a tree press expands. */
interface CascaderPendingNavigation {
  value: string;
  kind: 'push' | 'at' | 'expand';
  /** `kind: "at"` only. The depth the pressed row belongs to. */
  depth: number;
}

/** No default on `T`: inferred from `items`, so `node.data` arrives typed. */
function Cascader<T>({
  items,
  getParent,
  getChildren,
  onSearch,
  searchDebounce,
  resolveValue,
  loadKey,
  prefetch,
  onLoadError,
  value: valueProp,
  defaultValue,
  onValueChange: onValueChangeProp,
  multiple = false,
  selectable = 'leaf',
  indicator = true,
  cascade = false,
  max,
  mode = 'drill',
  expandTrigger,
  path: pathProp,
  defaultPath,
  onPathChange,
  expanded: expandedProp,
  defaultExpanded,
  onExpandedChange,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  closeOnSelect = true,
  inputValue: inputValueProp,
  defaultInputValue = '',
  onInputValueChange,
  searchScope = 'level',
  filter,
  revealSelected = true,
  maxHeight,
  virtualize,
  virtualizeThreshold = 100,
  estimateRowSize = 32,
  overscan = 8,
  labels: labelsProp,
  renderItem,
  renderLabel,
  disabled,
  name,
  form,
  id,
  required,
  readOnly,
  invalid,
  inputRef,
  inline,
  children,
}: CascaderProps<T>) {
  const baseIndex = React.useMemo(
    () => buildCascaderIndex(items, getParent),
    // `getParent` is stable by design: an inline accessor must not rebuild a
    // 50k-node index.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items],
  );

  const baseId = React.useId();

  // Shallow-stabilized first: an inline `labels` would republish the context.
  const stableLabelsProp = useShallowStable(labelsProp, shallowEqualRecords);

  const labels = React.useMemo(() => resolveCascaderLabels(stableLabelsProp), [stableLabelsProp]);

  useCascaderDevWarnings({
    items,
    getParent,
    mode,
    multiple,
    cascade,
    indicator,
    selectable,
    searchScope,
    max,
    value: valueProp,
    defaultValue,
    hasExpanded:
      expandedProp !== undefined || defaultExpanded !== undefined || onExpandedChange !== undefined,
    hasPath: pathProp !== undefined || defaultPath !== undefined || onPathChange !== undefined,
    hasOnSearch: onSearch !== undefined,
  });

  // Public props are discriminated, internals are not: one assertion.
  const onValueChange = onValueChangeProp as
    | ((value: string | string[], details: CascaderChangeDetails<T>) => void)
    | undefined;

  // No `onChange`: `onValueChange` takes a second argument, so `emitSelection`
  // invokes it rather than the state hook, which only knows the value.
  const [value, setValue] = useControllable<string | string[]>(
    valueProp,
    defaultValue ?? (multiple ? [] : ''),
    undefined,
    'value',
  );
  // Why the current path (or open) change is happening. Refs, not arguments:
  // `useControllable` only passes a value, and its onChange runs synchronously
  // inside the setter, so a ref written just before is exact. The path ref
  // resets to `"external"`, which is what the consumer's `setPath` reports.
  const pathReasonRef = React.useRef<CascaderPathChangeReason>('external');
  const openReasonRef = React.useRef<string>('none');

  const [path, setPath] = useControllable<string[]>(
    pathProp,
    defaultPath ?? [],
    (next) => onPathChange?.(next, { reason: pathReasonRef.current }),
    'path',
  );
  const [expandedList, setExpandedList] = useControllable<string[]>(
    expandedProp,
    defaultExpanded ?? [],
    onExpandedChange,
    'expanded',
  );
  const [open, setOpen] = useControllable<boolean>(
    openProp,
    defaultOpen,
    (next) => onOpenChange?.(next, { reason: openReasonRef.current }),
    'open',
  );

  /** The internal `setPath`: names its reason, then hands back to "external". */
  const setPathWithReason = React.useCallback(
    (next: string[] | ((prev: string[]) => string[]), reason: CascaderPathChangeReason) => {
      pathReasonRef.current = reason;
      try {
        setPath(next);
      } finally {
        pathReasonRef.current = 'external';
      }
    },
    [setPath],
  );
  const [query, setQuery] = useControllable<string>(
    inputValueProp,
    defaultInputValue,
    onInputValueChange,
    'inputValue',
  );

  const expanded = React.useMemo(() => new Set(expandedList), [expandedList]);
  const selectedValues = React.useMemo(() => toArray(value), [value]);

  /* --------------------------------- async -------------------------------- */

  // On-screen levels, so the ones worth fetching. Columns shows the whole
  // trail at once, which is why the loader is per-level, not one flag.
  const levels = React.useMemo(() => {
    if (mode === 'tree') return [CASCADER_ROOT_KEY, ...expandedList];
    if (mode === 'columns') return [CASCADER_ROOT_KEY, ...path];
    return [path.length ? path[path.length - 1] : CASCADER_ROOT_KEY];
  }, [mode, path, expandedList]);

  // A SIBLING of the index build, never a step inside it: the build stays pure
  // in `items`, the loader owns the pages, the merge is pure in both, and that
  // is what makes loaded data survive an `items` change.
  const loader = useCascaderLoader<T>({
    base: baseIndex,
    getChildren,
    // Gated, not merely unrendered: a tree hit belongs to no visible branch.
    onSearch: mode === 'tree' ? undefined : onSearch,
    resolveValue,
    searchDebounce,
    loadKey,
    prefetch,
    onLoadError,
    // An inline cascader is never "open", but its panel is live.
    enabled: open || !!inline,
    query,
    levels,
    path,
    values: selectedValues,
  });

  const loadStates = loader.states;

  // Destructured here, not at the actions memo, because `navigate` sits above
  // it. All three are `[]`-dep inside the loader, so identity is stable.
  const { ensureLevel, retryLevel: retryLoaderLevel, invalidateLevel } = loader;

  /**
   * Whether pressing this branch has to FETCH first: in flight, failed, or
   * never asked. `baseIndex`, NOT the merged `index`: `resolveValue` writes an
   * ancestor chain into `pages` without touching `states`, so the merged index
   * shows children for levels never requested. Must agree with `ensureLevel`'s
   * own guards or a press parks a navigation nothing will ever settle.
   */
  const needsChildren = React.useCallback(
    (node: CascaderNode<T>) => {
      if (!loader.active) return false;
      const state = loadStates.get(node.value);
      if (state) return state.loading || state.error;
      return !baseIndex.childrenOf.has(node.value);
    },
    [loader.active, loadStates, baseIndex],
  );

  // Keyed on the two maps the merge reads, NOT the store: `withLoadState`
  // returns a fresh store over the SAME maps, so keying on it rebuilt the
  // whole index on every loading flip that changed no data.
  const index = React.useMemo(
    () => mergeCascaderIndex(baseIndex, loader.store.pages, loader.store.detached),
    [baseIndex, loader.store.pages, loader.store.detached],
  );

  /** Whether a level needs the paging pseudo-row. A never-fetched level gets
   * nothing; that is the empty state's job. Tree has no per-level empty state,
   * so there the row is also the branch's loading and error surface. */
  const needsMoreRow = React.useCallback(
    (key: string, childCount: number) => {
      const state = loadStates.get(key);
      if (!state) return false;
      if (childCount > 0) return state.hasMore || state.loading || state.error;
      return mode === 'tree' && (state.loading || state.error);
    },
    [loadStates, mode],
  );

  // Remembers every selected node, so the trigger keeps a label after it
  // leaves the loaded set (or was never in it).
  const labelCacheRef = React.useRef(new Map<string, CascaderNode<T>>());

  // Populated during render, since the trigger reads it while rendering.
  // Idempotent and prop-derived, so a discarded render is harmless.
  for (const selected of selectedValues) {
    const node = index.byValue.get(selected);
    if (node) labelCacheRef.current.set(selected, node);
  }

  const resolveNode = React.useCallback(
    (nodeValue: string): CascaderNode<T> =>
      index.byValue.get(nodeValue) ??
      labelCacheRef.current.get(nodeValue) ?? {
        value: nodeValue,
        label: nodeValue,
      },
    [index],
  );

  /* ------------------------------ derived view ----------------------------- */

  const currentParentValue = path.length ? path[path.length - 1] : null;
  const currentParent = currentParentValue ? (index.byValue.get(currentParentValue) ?? null) : null;

  const currentLevelKey = currentParentValue ?? CASCADER_ROOT_KEY;

  const isDeepSearching = searchScope === 'deep' && query.trim().length > 0 && mode !== 'tree';

  const localDeepResults = React.useMemo(() => {
    if (!isDeepSearching) return null;
    return searchCascaderDeep(index, query, {
      within: currentParentValue,
      matches: filter,
    });
  }, [isDeepSearching, index, query, currentParentValue, filter]);

  // Server search wins over the local scan, or each hit shows up twice.
  const deepResults = loader.searchResults ?? localDeepResults;

  const levelItems = React.useMemo(() => {
    const level = getCascaderChildren(index, currentParentValue);
    return filterCascaderLevel(level, query, filter);
  }, [index, currentParentValue, query, filter]);

  /** The active level's rows plus the paging pseudo-row, appended HERE because
   * every index Base UI hands out indexes this array: a DOM row missing from
   * it shifts the highlight and every windowed row by one. */
  const levelRendered = React.useMemo(() => {
    if (deepResults) return deepResults;
    if (!needsMoreRow(currentLevelKey, levelItems.length)) return levelItems;
    return [...levelItems, createCascaderMoreNode<T>(currentLevelKey, levelItems.length)];
  }, [deepResults, levelItems, currentLevelKey, needsMoreRow]);

  // Columns renders the whole trail, but only the deepest column is
  // interactive through Base UI, so `renderedItems` stays what drill uses.
  const columns = React.useMemo<CascaderColumn<T>[]>(() => {
    if (mode !== 'columns') return [];
    const trail: CascaderColumn<T>[] = [];
    for (let depth = 0; depth <= path.length; depth += 1) {
      const parentValue = depth === 0 ? null : path[depth - 1];
      const parent = parentValue ? (index.byValue.get(parentValue) ?? null) : null;
      const isActive = depth === path.length;
      let columnItems: CascaderNode<T>[];
      if (isActive) {
        columnItems = levelRendered;
      } else {
        // A trail column pages on its own, without losing the columns right of it.
        const key = parentValue ?? CASCADER_ROOT_KEY;
        const children = getCascaderChildren(index, parentValue);
        columnItems = needsMoreRow(key, children.length)
          ? [...children, createCascaderMoreNode<T>(key, children.length)]
          : children;
      }
      trail.push({
        parent,
        depth,
        activeValue: path[depth] ?? null,
        active: isActive,
        // Only the active column is filtered: a query narrows what you type
        // into, never the trail behind it.
        items: columnItems,
      });
    }
    return trail;
  }, [mode, path, index, levelRendered, needsMoreRow]);

  // Tree level keys needing a paging pseudo-row. With no per-level empty
  // state, this is also where a still-loading branch says so.
  const treeSentinels = React.useMemo(() => {
    if (mode !== 'tree') return undefined;
    const keys = new Set<string>();
    const consider = (key: string) => {
      if (needsMoreRow(key, index.childrenOf.get(key)?.length ?? 0)) {
        keys.add(key);
      }
    };
    consider(CASCADER_ROOT_KEY);
    for (const value of expanded) consider(value);
    return keys.size ? keys : undefined;
  }, [mode, index, expanded, needsMoreRow]);

  const treeRows = React.useMemo<CascaderFlatNode<T>[]>(() => {
    if (mode !== 'tree') return [];
    const rows = flattenCascaderTree(index, expanded, treeSentinels);
    // Same normalizer as the level filter, so the two cannot disagree.
    const normalized = normalizeCascaderQuery(query);
    if (!normalized) return rows;
    // Matches every node, not just visible rows, and keeps the ancestors, or a
    // hit inside a collapsed branch disappears. Same matcher as every other
    // path, so keyword-only hits do not vanish in tree mode alone.
    const keep = new Set<string>();
    for (const node of index.all) {
      if (!(filter ? filter(node, normalized) : matchesCascaderQuery(node, normalized))) {
        continue;
      }
      for (const ancestor of getCascaderPath(index, node.value)) {
        keep.add(ancestor.value);
      }
    }
    // No sentinels while filtering: that page would not have the query applied.
    return flattenCascaderTree(index, new Set([...expanded, ...keep])).filter((row) =>
      keep.has(row.node.value),
    );
  }, [mode, index, expanded, treeSentinels, query, filter]);

  // What `Combobox.Root` receives. Tree flattens to the same linear list, so
  // selection and highlighting need no per-mode case.
  const renderedItems = React.useMemo(
    () => (mode === 'tree' ? treeRows.map((row) => row.node) : levelRendered),
    [mode, treeRows, levelRendered],
  );

  /* ---------------------------- level swap reset --------------------------- */

  /** Base UI never resets the highlighted index on an `items` change and has
   * no imperative setter; its one automatic reset is an out-of-range clamp, so
   * a single empty frame trips it. The frame rides `filteredItems`, so the
   * `items` identity stays put. */
  const levelKey = currentParentValue ?? '';

  // STATE, not a ref: a replayed render would see a ref advanced and skip it.
  const [swap, setSwap] = React.useState({ key: levelKey, active: false });

  if (swap.key !== levelKey) {
    setSwap({ key: levelKey, active: true });
  }
  const swapping = swap.active && swap.key === levelKey;

  React.useLayoutEffect(() => {
    if (swap.active) setSwap((prev) => ({ ...prev, active: false }));
  }, [swap.active]);

  /* ----------------------------- virtualization ---------------------------- */

  // A COUNT: columns mounts one per column, and StrictMode remounts effects.
  const [virtualRenderers, setVirtualRenderers] = React.useState(0);

  const registerVirtualRenderer = React.useCallback(() => {
    setVirtualRenderers((count) => count + 1);
    return () => setVirtualRenderers((count) => Math.max(0, count - 1));
  }, []);

  const hasVirtualRenderer = virtualRenderers > 0;
  const wantsVirtual = virtualize ?? renderedItems.length >= virtualizeThreshold;

  // LATCHED per level: otherwise a query narrowing a 5,000 row level past the
  // threshold tears the virtualizer down and rebuilds it on backspace, losing
  // every measurement. State, not a ref, like `swap`.
  const [virtualLatch, setVirtualLatch] = React.useState({
    key: levelKey,
    on: false,
  });

  const virtualized =
    hasVirtualRenderer &&
    (virtualLatch.key === levelKey ? virtualLatch.on || wantsVirtual : wantsVirtual);

  if (!hasVirtualRenderer) {
    // Nothing is windowing, so nothing may stay latched.
    if (virtualLatch.on || virtualLatch.key !== levelKey) {
      setVirtualLatch({ key: levelKey, on: false });
    }
  } else if (virtualLatch.key !== levelKey) {
    setVirtualLatch({ key: levelKey, on: virtualized });
  } else if (virtualized && !virtualLatch.on) {
    setVirtualLatch({ key: levelKey, on: true });
  }

  /**
   * One forced re-render, one commit AFTER windowing turns on. Base UI sizes
   * `listRef` from `filteredItems` in a layout effect keyed on that array's
   * identity, but `virtualized` reaches the list a commit later and the
   * `CompositeList` teardown REPLACES `listRef` with an empty array nothing
   * re-sizes, so ArrowDown stops at the last WINDOWED row. A passive effect is
   * late enough: the teardown is scheduled from a layout effect.
   */
  const [virtualSyncs, setVirtualSyncs] = React.useState(0);

  React.useEffect(() => {
    if (!virtualized) return;
    setVirtualSyncs((count) => count + 1);
  }, [virtualized]);

  React.useEffect(() => {
    if (process.env.NODE_ENV === 'production') return undefined;
    if (virtualize !== true || hasVirtualRenderer) return undefined;
    // Deferred a tick: the renderer registers from a layout effect, so a
    // synchronous check would report every correctly wired cascader.
    const timeout = setTimeout(() => {
      console.error(
        '[Cascader] `virtualize` is true but no windowing renderer is mounted. ' +
          'Render <CascaderVirtualItems /> inside <CascaderList>, or ' +
          '<CascaderVirtualColumn /> through the <CascaderColumns> slot.',
      );
    }, 0);
    return () => clearTimeout(timeout);
  }, [virtualize, hasVirtualRenderer]);

  /* ------------------------------ navigation ------------------------------ */

  /** One signal per navigation, feeding the live region, bumped EXACTLY once
   * per action. `seq` alternates the invisible marker so two identical
   * announcements are still two mutations; `toggled` names the tree branch. */
  const [announceSignal, setAnnounceSignal] = React.useState<{
    seq: number;
    toggled: string | null;
    /** A one-off verbatim message: a `max` refusal, a cascade fan-out. STATE,
     * so an unrelated render cannot clear it mid-read. */
    notice: string | null;
  }>({ seq: 0, toggled: null, notice: null });

  const bumpAnnouncement = React.useCallback((toggled: string | null) => {
    setAnnounceSignal((prev) => ({ seq: prev.seq + 1, toggled, notice: null }));
  }, []);

  /** Speaks for interactions that change nothing on screen: a refusal returns
   * before any state moves, a cascade sweep is invisible from the row pressed.
   * The seq bump keeps two identical refusals two mutations. */
  const announceNotice = React.useCallback((notice: string) => {
    setAnnounceSignal((prev) => ({ seq: prev.seq + 1, toggled: null, notice }));
  }, []);

  /**
   * The navigation a press asked for and a fetch has not answered yet. Load
   * BEFORE you move: drilling in first threw away the list the user was
   * reading and, on failure, stranded them on an error screen for a level they
   * had never seen. Holding here keeps the old rows and puts the progress on
   * the pressed row, whose chevron `CascaderItem` swaps for a spinner.
   */
  const [pendingNavigation, setPendingNavigation] =
    React.useState<CascaderPendingNavigation | null>(null);

  /** Asks for a branch's children and parks the navigation until they land.
   * BOTH entry points are called unconditionally: `retryLevel` no-ops unless
   * the level errored, `ensureLevel` no-ops if it has state, so a repeat press
   * is free and the readiness decision stays inside the loader. */
  const requestChildren = React.useCallback(
    (node: CascaderNode<T>, pending: CascaderPendingNavigation) => {
      setPendingNavigation(pending);
      retryLoaderLevel(node.value);
      ensureLevel(node.value, 'level');
      // Otherwise the panel is silent from the press until the level swaps.
      bumpAnnouncement(null);
    },
    [retryLoaderLevel, ensureLevel, bumpAnnouncement],
  );

  const pushLevel = React.useCallback(
    (nodeValue: string) => {
      setPathWithReason((prev) => [...prev, nodeValue], 'drill');
      setQuery('');
      bumpAnnouncement(null);
    },
    [setPathWithReason, setQuery, bumpAnnouncement],
  );

  const popLevel = React.useCallback(() => {
    setPathWithReason((prev) => (prev.length ? prev.slice(0, -1) : prev), 'back');
    setQuery('');
    // Going BACK abandons a held navigation, or an in-flight branch drills in
    // the moment it lands, long after the user moved on.
    setPendingNavigation(null);
    bumpAnnouncement(null);
  }, [setPathWithReason, setQuery, bumpAnnouncement]);

  const goToDepth = React.useCallback(
    (depth: number) => {
      setPathWithReason((prev) => prev.slice(0, Math.max(0, depth)), 'breadcrumb');
      setQuery('');
      setPendingNavigation(null);
      bumpAnnouncement(null);
    },
    [setPathWithReason, setQuery, bumpAnnouncement],
  );

  const toggleExpanded = React.useCallback(
    (nodeValue: string) => {
      setExpandedList((prev) =>
        prev.includes(nodeValue) ? prev.filter((v) => v !== nodeValue) : [...prev, nodeValue],
      );
      bumpAnnouncement(nodeValue);
    },
    [setExpandedList, bumpAnnouncement],
  );

  const isBranch = React.useCallback(
    (node: CascaderNode<T>) => isCascaderBranch(index, node),
    [index],
  );

  const isSelectable = React.useCallback(
    (node: CascaderNode<T>) => isCascaderSelectable(index, node, selectable),
    [index, selectable],
  );

  // Whether a branch can be committed AT ALL here. `"leaf"` is the only
  // setting that answers no in advance; a predicate is opaque, so the check
  // gutter is reserved uniformly rather than per row.
  const branchesSelectable = selectable !== 'leaf';

  // A Set, not an `includes` scan: `isSelected` runs once per rendered row.
  const selectedSet = React.useMemo(() => new Set(selectedValues), [selectedValues]);

  const isSelected = React.useCallback(
    (node: CascaderNode<T>) => selectedSet.has(node.value),
    [selectedSet],
  );

  /** Selected-descendant counts, walked ONCE per selection change and never
   * stored, so the flat value array stays the only source of truth. The walk
   * is `selections x depth`, up from each selection rather than down from each
   * row, which keeps the count and `isIndeterminate` O(1). */
  const selectedDescendants = React.useMemo(
    () => getCascaderSelectedDescendants(index, selectedValues),
    [index, selectedValues],
  );

  const selectedDescendantCount = React.useCallback(
    (node: CascaderNode<T>) => selectedDescendants.get(node.value) ?? 0,
    [selectedDescendants],
  );

  // Partial selections read off the SAME map, so the dash and the number are
  // two readings of one traversal and cannot drift apart.
  const indeterminateSet = React.useMemo(() => {
    if (!cascade || !multiple) return null;
    return getCascaderIndeterminateFrom(selectedDescendants, selectedValues);
  }, [cascade, multiple, selectedDescendants, selectedValues]);

  const isIndeterminate = React.useCallback(
    (node: CascaderNode<T>) => indeterminateSet?.has(node.value) ?? false,
    [indeterminateSet],
  );

  // Base UI owns the highlight; mirrored so handlers can read it unsubscribed.
  const highlightedRef = React.useRef<CascaderNode<T> | null>(null);
  const getHighlighted = React.useCallback(() => highlightedRef.current, []);

  // The same highlight as an external store, for the consumer that must
  // RE-RENDER on it. `useState`, not `useMemo`: React may drop a memo, and a
  // second store would silently orphan every subscriber.
  const [highlightStore] = React.useState<CascaderHighlightStore>(createCascaderHighlightStore);

  /* ------------------------------ announcement ---------------------------- */

  const currentLoadState = React.useMemo<CascaderLoadState | null>(
    () => loadStates.get(currentLevelKey) ?? null,
    [loadStates, currentLevelKey],
  );
  const searchLoadState = loader.searchState;

  /** What the query announcement COUNTS: matches, not rows, since the list
   * also carries a tree query's ancestor context and the Load-more row. Server
   * hits count as-is; re-judging them locally would drop what it matched on
   * data the client cannot see. */
  const announcedMatches = React.useMemo(() => {
    if (deepResults) return deepResults.length;
    const normalized = normalizeCascaderQuery(query);
    if (!normalized) return 0;
    const matches = filter ?? matchesCascaderQuery;
    return renderedItems.filter((node) => !isCascaderMoreNode(node) && matches(node, normalized))
      .length;
  }, [deepResults, renderedItems, query, filter]);

  // The live-region text plus whether it may be DEFERRED; see
  // `ANNOUNCE_DEBOUNCE`. The committed string is state, set below.
  const announcementTarget = React.useMemo(() => {
    // An INLINE cascader is never "open", so `open` alone silenced its tree.
    if (!open && !inline) return { text: '', defer: false };

    const total = renderedItems.length;
    const marker = ANNOUNCE_MARKER.repeat(announceSignal.seq % 2);

    // A notice outranks everything below: it exists because nothing else on
    // screen changed. It rides the signal, so the next navigation replaces it.
    if (announceSignal.notice) {
      return { text: `${announceSignal.notice}${marker}`, defer: false };
    }

    // A tree toggle changes neither level nor query, so it rides the signal.
    const toggled =
      mode === 'tree' && announceSignal.toggled
        ? (index.byValue.get(announceSignal.toggled) ?? null)
        : null;

    // Async states outrank everything below, or a fetching level announces "0
    // results" and contradicts itself. A HELD navigation outranks even those:
    // nothing on screen has moved yet, so "loading" is the only truth.
    const pendingState = pendingNavigation
      ? (loadStates.get(pendingNavigation.value) ?? null)
      : null;
    const levelState = query.trim() ? searchLoadState : currentLoadState;
    let text: string;
    let defer = false;
    if (pendingState?.error) {
      text = labels.error;
    } else if (pendingNavigation) {
      // Always the FIRST-page string: the rows on screen belong to the level
      // being left behind, so their count says nothing about this request.
      text = labels.loading;
    } else if (levelState?.error) {
      text = labels.error;
    } else if (levelState?.loading) {
      // With a query set the in-flight load IS the server search, and calling
      // that "Loading more" misreads what is being waited on.
      text = query.trim()
        ? labels.searchingAnnouncement
        : total > 0
          ? labels.loadingMore
          : labels.loading;
    } else if (query.trim()) {
      // An empty result set is the more useful thing to say than "0 results".
      text = announcedMatches === 0 ? labels.empty : labels.resultsAnnouncement(announcedMatches);
      // The ONE deferred branch: only a stream of keystrokes needs coalescing.
      defer = true;
    } else if (toggled) {
      text = expanded.has(toggled.value)
        ? labels.expandedAnnouncement(toggled.label, getCascaderCount(index, toggled))
        : labels.collapsedAnnouncement(toggled.label);
    } else if (currentParent) {
      // `path.length + 1` matches tree mode's `aria-level`: the rows are
      // `currentParent`'s CHILDREN, one level below it.
      text = labels.levelAnnouncement(currentParent.label, path.length + 1, total);
    } else {
      // Returning to the root would otherwise announce nothing at all.
      text = labels.rootAnnouncement(total);
    }

    return { text: `${text}${marker}`, defer };
  }, [
    open,
    inline,
    mode,
    index,
    expanded,
    announceSignal,
    query,
    labels,
    renderedItems.length,
    announcedMatches,
    currentParent,
    path.length,
    currentLoadState,
    searchLoadState,
    pendingNavigation,
    loadStates,
  ]);

  /** The COMMITTED announcement. Immediate texts commit during render (the
   * pattern `swap` uses), so an async settle announces in the very commit that
   * shows the rows. Only the deferred query count uses the timer below. */
  const [announced, setAnnounced] = React.useState(announcementTarget);

  if (!announcementTarget.defer && announced.text !== announcementTarget.text) {
    // Terminates: after the set the condition is false on the re-render.
    setAnnounced(announcementTarget);
  }

  React.useEffect(() => {
    if (!announcementTarget.defer) return undefined;
    const timer = setTimeout(() => setAnnounced(announcementTarget), ANNOUNCE_DEBOUNCE);
    return () => clearTimeout(timer);
  }, [announcementTarget]);

  const announcement = announced.text;

  /* --------------------------------- state -------------------------------- */

  // The volatile half: rebuilt by a keystroke, hence split from the actions.
  const stateValue = React.useMemo<CascaderStateContextValue<T>>(
    () => ({
      index,
      path,
      expanded,
      query,
      currentParent,
      levelItems,
      deepResults,
      renderedItems,
      columns,
      treeRows,
      selectedValues,
      selectedDescendants,
      loadStates,
      searchState: searchLoadState,
      announcement,
    }),
    [
      index,
      path,
      expanded,
      query,
      currentParent,
      levelItems,
      deepResults,
      renderedItems,
      columns,
      treeRows,
      selectedValues,
      selectedDescendants,
      loadStates,
      searchLoadState,
      announcement,
    ],
  );

  /* ------------------------------ latest props ---------------------------- */

  /**
   * Latest committed props and derived state, WRITTEN IN AN EFFECT. That is
   * what keeps the callbacks below `[]`-dep and stable for the life of the
   * cascader; writing during render is unsafe under concurrent rendering. The
   * cost: a read sees the PREVIOUS commit until the effect runs, so ONLY event
   * handlers may read it. Anything used during render is memoised instead.
   */
  const latest = React.useRef<CascaderLatest<T>>({
    index,
    state: stateValue,
    mode,
    multiple,
    cascade,
    max,
    labels,
    closeOnSelect,
    selectedValues,
    deepResults,
    onValueChange,
    resolveNode,
    isSelectable,
    needsChildren,
    expanded,
  });

  React.useEffect(() => {
    latest.current = {
      index,
      state: stateValue,
      mode,
      multiple,
      cascade,
      max,
      labels,
      closeOnSelect,
      selectedValues,
      deepResults,
      onValueChange,
      resolveNode,
      isSelectable,
      needsChildren,
      expanded,
    };
  });

  const getIndex = React.useCallback(() => latest.current.index, []);
  const getState = React.useCallback(() => latest.current.state, []);

  const goToLevelAt = React.useCallback(
    (nodeValue: string, depth: number) => {
      setPathWithReason((prev) => [...prev.slice(0, Math.max(0, depth)), nodeValue], 'drill');
      setQuery('');
      bumpAnnouncement(null);
    },
    [setPathWithReason, setQuery, bumpAnnouncement],
  );

  const navigateAt = React.useCallback(
    (node: CascaderNode<T>, depth: number) => {
      if (latest.current.mode === 'tree') {
        toggleExpanded(node.value);
        return;
      }
      if (latest.current.needsChildren(node)) {
        requestChildren(node, { value: node.value, kind: 'at', depth });
        return;
      }
      goToLevelAt(node.value, depth);
    },
    [toggleExpanded, goToLevelAt, requestChildren],
  );

  const navigate = React.useCallback(
    (node: CascaderNode<T>) => {
      const {
        mode: currentMode,
        deepResults: currentDeepResults,
        index: currentIndex,
        expanded: currentExpanded,
        needsChildren: pending,
      } = latest.current;

      if (currentMode === 'tree') {
        // Collapsing never needs data. Opening waits WITHOUT expanding, so
        // the branch stays shut with a spinner rather than opening onto no rows.
        if (!currentExpanded.has(node.value) && pending(node)) {
          requestChildren(node, {
            value: node.value,
            kind: 'expand',
            depth: 0,
          });
          return;
        }
        toggleExpanded(node.value);
        return;
      }

      // A deep-search hit sits at any depth, so drilling in rebuilds the trail
      // rather than appending to wherever the user was.
      if (currentDeepResults) {
        if (pending(node)) {
          const ancestors = getCascaderPath(currentIndex, node.value);
          requestChildren(node, {
            value: node.value,
            kind: 'at',
            // The hit's own depth, so the settle rebuilds the same trail.
            depth: Math.max(0, ancestors.length - 1),
          });
          return;
        }
        const ancestors = getCascaderPath(currentIndex, node.value);
        setPathWithReason(
          ancestors.map((entry) => entry.value),
          'drill',
        );
        setQuery('');
        bumpAnnouncement(null);
        return;
      }

      if (pending(node)) {
        requestChildren(node, { value: node.value, kind: 'push', depth: 0 });
        return;
      }
      pushLevel(node.value);
    },
    [toggleExpanded, setPathWithReason, setQuery, pushLevel, bumpAnnouncement, requestChildren],
  );

  /**
   * The other half of `requestChildren`: the fetch settled, so the held
   * navigation happens or is dropped. Reads the load STATE, not a promise:
   * only the loader knows a request was superseded, aborted or retried, and no
   * entry at all means it has not reached the store yet. On failure nothing
   * moves and the intent is KEPT, which is what makes the row's retry
   * affordance mean something; only `popLevel`, `goToDepth` and a close drop it.
   */
  React.useEffect(() => {
    if (!pendingNavigation) return;
    const state = loadStates.get(pendingNavigation.value);
    if (!state || state.loading || state.error) return;

    setPendingNavigation(null);

    if (pendingNavigation.kind === 'expand') {
      toggleExpanded(pendingNavigation.value);
      return;
    }
    if (pendingNavigation.kind === 'at') {
      goToLevelAt(pendingNavigation.value, pendingNavigation.depth);
      return;
    }
    pushLevel(pendingNavigation.value);
  }, [pendingNavigation, loadStates, toggleExpanded, goToLevelAt, pushLevel]);

  // A popup that closes mid-flight must not drill in when the answer arrives;
  // the loader aborts the request, this drops the intent.
  React.useEffect(() => {
    if (!open && !inline) setPendingNavigation(null);
  }, [open, inline]);

  /* ------------------------------- selection ------------------------------ */

  // The one place the selection changes, so `onValueChange` reports the same
  // shape whatever caused it: a row press, drag-select, or the headless hooks.
  const emitSelection = React.useCallback(
    (nextValues: string[], node: CascaderNode<T> | null, reason: CascaderChangeReason) => {
      const {
        selectedValues: current,
        multiple: currentMultiple,
        onValueChange: emit,
        index: currentIndex,
        resolveNode: resolve,
      } = latest.current;

      // Nothing changed. The dedup lives here now, not in `useControllable`.
      const unchanged =
        nextValues.length === current.length &&
        nextValues.every((entry, i) => entry === current[i]);
      if (unchanged) return;

      const next = currentMultiple ? nextValues : (nextValues[0] ?? '');
      setValue(next);

      if (!emit) return;

      const chain = node ? getCascaderPath(currentIndex, node.value) : [];
      emit(next, {
        node,
        // A node absent from `items` has no chain, so fall back to the node
        // rather than report an empty path for a change that had one.
        path: node ? (chain.length ? chain : [node]) : [],
        // `resolveNode`, not `index.byValue`: a selected value missing from
        // `items` must still come back rather than be dropped.
        nodes: nextValues.map(resolve),
        reason,
      });
    },
    [setValue],
  );

  const setSelection = React.useCallback(
    (values: string[], reason?: CascaderChangeReason) => {
      const { selectedValues: current, resolveNode: resolve } = latest.current;
      const before = new Set(current);
      const after = new Set(values);
      const added = values.find((entry) => !before.has(entry));
      const removed = current.find((entry) => !after.has(entry));

      if (reason === 'clear') {
        emitSelection(values, null, 'clear');
        return;
      }
      if (added) {
        emitSelection(values, resolve(added), reason ?? 'select');
        return;
      }
      if (removed) {
        emitSelection(values, resolve(removed), reason ?? 'deselect');
        return;
      }
      // Same set: a no-op, but routed so an explicit `reason` still applies.
      emitSelection(values, null, reason ?? 'select');
    },
    [emitSelection],
  );

  const commit = React.useCallback(
    (node: CascaderNode<T>) => {
      const {
        multiple: currentMultiple,
        cascade: currentCascade,
        selectedValues: current,
        max: currentMax,
        index: currentIndex,
        isSelectable: currentIsSelectable,
        labels: currentLabels,
        closeOnSelect: currentCloseOnSelect,
      } = latest.current;

      if (!currentMultiple) {
        emitSelection([node.value], node, 'select');
        if (currentCloseOnSelect) {
          openReasonRef.current = 'item-press';
          setOpen(false);
        } else {
          // The popup stays up, so clear the query the way a multiple commit
          // does; the next pick then starts from the full level.
          setQuery('');
        }
        return;
      }

      if (currentCascade) {
        const selecting = !current.includes(node.value);
        const next = applyCascadeSelection(
          currentIndex,
          current,
          node.value,
          selecting,
          currentIsSelectable,
        );
        // `max` caps the whole gesture rather than truncating it: an arbitrary
        // prefix of a subtree is a selection nobody asked for. The refusal
        // changes nothing on screen, so the live region is its only witness.
        if (
          selecting &&
          currentMax != null &&
          next.length > currentMax &&
          next.length > current.length
        ) {
          announceNotice(currentLabels.maxReachedAnnouncement(currentMax));
          return;
        }
        emitSelection(next, node, selecting ? 'select' : 'deselect');
        // How many values the closure swept along is invisible from the one
        // row pressed, so the sweep says its number out loud, itself excluded.
        const before = new Set(current);
        const after = new Set(next);
        let swept = 0;
        for (const entry of selecting ? next : current) {
          if (entry === node.value) continue;
          if (selecting ? !before.has(entry) : !after.has(entry)) swept += 1;
        }
        if (swept > 0) {
          announceNotice(
            currentLabels.cascadeAnnouncement(node.label ?? node.value, swept, selecting),
          );
        }
        setQuery('');
        return;
      }

      if (current.includes(node.value)) {
        emitSelection(
          current.filter((v) => v !== node.value),
          node,
          'deselect',
        );
      } else if (currentMax == null || current.length < currentMax) {
        emitSelection([...current, node.value], node, 'select');
      } else {
        // The plain-multiple twin of the cascade refusal above: just as silent.
        announceNotice(currentLabels.maxReachedAnnouncement(currentMax));
      }
      setQuery('');
    },
    [emitSelection, setOpen, setQuery, announceNotice],
  );

  /** Safety net for paths that bypass the row-level veto (the drag-select
   * mouseup). `details.cancel()` suppresses the commit and the close together:
   * Base UI shares one event-details object between them. */
  const handleComboboxValueChange = React.useCallback(
    (
      next: CascaderNode<T> | CascaderNode<T>[] | null,
      details: ComboboxPrimitive.Root.ChangeEventDetails,
    ) => {
      if (!multiple) {
        const node = Array.isArray(next) ? (next[0] ?? null) : next;
        // The paging row is a real option, so Base UI reports it as a
        // selection. Same safety net branches get, for paths a row cannot veto.
        if (node && isCascaderMoreNode(node)) {
          details.cancel();
          return;
        }
        if (node && !isSelectable(node) && isBranch(node)) {
          details.cancel();
          navigate(node);
          return;
        }
        if (node) {
          // `closeOnSelect={false}` must also stop Base UI's OWN close; one
          // shared details object, so cancelling suppresses both, and our value
          // is controlled, so Base UI's half had nothing to keep.
          if (!closeOnSelect) details.cancel();
          commit(node);
        }
        return;
      }

      // Take Base UI's whole array as the answer and inspect only what was
      // ADDED. Deriving the toggle from the tail works for an add but on a
      // remove drops the wrong node, leaving the last selection unclearable.
      const nextNodes = Array.isArray(next) ? next : [];
      const before = new Set(selectedValues);
      const added = nextNodes.find((node) => !before.has(node.value));

      if (added && isCascaderMoreNode(added)) {
        details.cancel();
        return;
      }

      if (added && !isSelectable(added) && isBranch(added)) {
        details.cancel();
        navigate(added);
        return;
      }

      // Cascading reads Base UI's array only as the REPORT of which row was
      // pressed: it differs by exactly one value either way, and the real
      // commit covers a whole subtree.
      if (cascade) {
        const nextValues = new Set(nextNodes.map((node) => node.value));
        const removed = selectedValues.find((entry) => !nextValues.has(entry));
        const toggled = added ?? (removed != null ? resolveNode(removed) : null);
        if (toggled) commit(toggled);
        return;
      }

      if (max != null && nextNodes.length > selectedValues.length && nextNodes.length > max) {
        details.cancel();
        // The third silent refusal site: cancelling reverts the press with no
        // state change, so the live region is the only witness.
        announceNotice(labels.maxReachedAnnouncement(max));
        return;
      }

      setSelection(nextNodes.map((node) => node.value));
      setQuery('');
    },
    [
      multiple,
      selectedValues,
      max,
      cascade,
      closeOnSelect,
      labels,
      announceNotice,
      isSelectable,
      isBranch,
      navigate,
      commit,
      resolveNode,
      setSelection,
      setQuery,
    ],
  );

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean, details: ComboboxPrimitive.Root.ChangeEventDetails) => {
      if (details.isCanceled) return;

      // Captured for the wrapped `onOpenChange`, which runs synchronously
      // inside `setOpen`, so a ref written just before the call is exact.
      openReasonRef.current = details.reason ?? 'none';
      setOpen(nextOpen);

      if (!nextOpen) {
        setQuery('');
        return;
      }

      // Opening onto the level holding the selection is the difference
      // between "edit this" and "start over".
      if (revealSelected) {
        setQuery('');
        const first = toArray(value)[0];
        setPathWithReason(
          first
            ? getCascaderPath(index, first)
                .slice(0, -1)
                .map((node) => node.value)
            : [],
          'reveal',
        );
      }
    },
    [setOpen, setQuery, revealSelected, value, index, setPathWithReason],
  );

  /* -------------------------------- context ------------------------------- */

  // NOT memoised further: render props must be the current closure, and only
  // rows consume this. See `CascaderRenderContextValue`.
  const renderContext = React.useMemo(
    () => ({ renderItem, renderLabel }),
    [renderItem, renderLabel],
  );

  /** The stable half: nothing in these deps moves on a keystroke, a level
   * change or a highlight, which is what makes `React.memo` on `CascaderItem`
   * hold while the user types. Destructured off `loader` so the memo depends
   * on its `[]`-dep callbacks, not the object it republishes per load. */
  const { active: hasLoader, loadMore, retryLevel, prefetchNode } = loader;

  const actionsValue = React.useMemo<CascaderActionsContextValue<T>>(
    () => ({
      index,
      mode,
      multiple,
      cascade,
      branchesSelectable,
      indicator,
      expandTrigger,
      searchScope,
      maxHeight,
      inline: !!inline,
      invalid: !!invalid,
      baseId,
      labels,
      virtualized,
      registerVirtualRenderer,
      virtualize,
      virtualizeThreshold,
      estimateRowSize,
      overscan,
      hasLoader,
      loadMore,
      retryLevel,
      invalidateLevel,
      getIndex,
      getState,
      getHighlighted,
      setPath,
      pushLevel,
      popLevel,
      goToDepth,
      toggleExpanded,
      setQuery,
      setSelection,
      commit,
      navigate,
      navigateAt,
      resolveNode,
      isBranch,
      isSelectable,
      isSelected,
      isIndeterminate,
      selectedDescendantCount,
    }),
    [
      index,
      mode,
      multiple,
      cascade,
      branchesSelectable,
      indicator,
      expandTrigger,
      searchScope,
      maxHeight,
      inline,
      invalid,
      baseId,
      labels,
      virtualized,
      registerVirtualRenderer,
      virtualize,
      virtualizeThreshold,
      estimateRowSize,
      overscan,
      hasLoader,
      loadMore,
      retryLevel,
      invalidateLevel,
      getIndex,
      getState,
      getHighlighted,
      setPath,
      pushLevel,
      popLevel,
      goToDepth,
      toggleExpanded,
      setQuery,
      setSelection,
      commit,
      navigate,
      navigateAt,
      resolveNode,
      isBranch,
      isSelectable,
      isSelected,
      isIndeterminate,
      selectedDescendantCount,
    ],
  );

  // A fresh array identity each time windowing turns on, and once more after:
  // that identity is the ONLY thing that re-runs Base UI's `listRef` sizing
  // effect. See `virtualSyncs`.
  const comboboxItems = React.useMemo(
    () => (virtualized ? renderedItems.slice() : renderedItems),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [renderedItems, virtualized, virtualSyncs],
  );

  const comboboxValue = React.useMemo(() => {
    if (multiple) return selectedValues.map(resolveNode);
    return selectedValues.length ? resolveNode(selectedValues[0]) : null;
  }, [multiple, selectedValues, resolveNode]);

  return (
    // Providers store values with the item generic erased; the hooks re-apply
    // the caller's own `T` on the way back out.
    <CascaderActionsContext.Provider value={actionsValue as unknown as CascaderActionsContextValue}>
      <CascaderStateContext.Provider value={stateValue as unknown as CascaderStateContextValue}>
        <CascaderHighlightContext.Provider value={highlightStore}>
          <CascaderRenderContext.Provider
            value={renderContext as unknown as CascaderRenderContextValue}
          >
            <ComboboxPrimitive.Root
              items={renderedItems}
              /* The empty frame that resets the highlight. See the comment above. */
              filteredItems={swapping ? EMPTY : comboboxItems}
              /* Filtering is ours: level vs deep search scope cannot be
                 expressed through Base UI's single matcher. */
              filter={null}
              value={comboboxValue}
              onValueChange={handleComboboxValueChange}
              open={open}
              onOpenChange={handleOpenChange}
              inputValue={query}
              onInputValueChange={(next: string) => setQuery(next)}
              multiple={multiple}
              disabled={disabled}
              /* Form wiring, straight to Base UI's hidden input. Conditional
                 spreads: an explicit `undefined` on a controlled prop reads as
                 "deleted" rather than "not supplied". */
              name={name}
              {...(form != null ? { form } : null)}
              {...(id != null ? { id } : null)}
              {...(required != null ? { required } : null)}
              {...(readOnly != null ? { readOnly } : null)}
              {...(inputRef ? { inputRef } : null)}
              inline={inline}
              /* Stops Base UI rendering its composite list, which is what makes
                 an explicit row `index` legal. `items`/`filteredItems` stay full:
                 they size `listRef`, or ArrowDown stops at the last RENDERED row. */
              virtualized={virtualized}
              itemToStringValue={(item: CascaderNode<T>) => item?.value ?? ''}
              itemToStringLabel={(item: CascaderNode<T>) => item?.label ?? ''}
              isItemEqualToValue={(a: CascaderNode<T>, b: CascaderNode<T>) => a?.value === b?.value}
              // Fires on every arrow key AND every pointer move, so it must
              // never call setState. The ref serves keyboard handlers, the
              // de-duping store anything that has to re-render.
              onItemHighlighted={(
                item: CascaderNode<T> | undefined,
                details: ComboboxPrimitive.Root.HighlightEventDetails,
              ) => {
                highlightedRef.current = item ?? null;
                highlightStore.set({
                  index: details.index,
                  value: item?.value ?? null,
                });
                // Schedules a TIMEOUT and returns: inside a layout effect, a
                // synchronous setState would cascade before paint.
                prefetchNode(item);
              }}
            >
              {children}
            </ComboboxPrimitive.Root>
          </CascaderRenderContext.Provider>
        </CascaderHighlightContext.Provider>
      </CascaderStateContext.Provider>
    </CascaderActionsContext.Provider>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    Panel                                   */
/* -------------------------------------------------------------------------- */

export interface CascaderPanelProps extends React.ComponentProps<'div'> {
  asChild?: boolean;
}

/**
 * The nav + list(s) + footer container, with no positioning of its own: inside
 * `CascaderContent` for the popup case, alone for the embedded one.
 *
 * `min-h-0` and `max-h-full` are load-bearing. A flex child without `min-h-0`
 * refuses to shrink below its content, which is the usual reason a scroll area
 * never scrolls - worst embedded, where no positioner publishes
 * `--available-height`. It also owns the panel's TAB ORDER: the scroll area
 * makes itself a tab stop whenever the level overflows, stranding the footer,
 * and the panel is the only ancestor of both ends of that move in BOTH shapes.
 */
function CascaderPanel({
  className,
  asChild = false,
  children,
  onKeyDown,
  ...props
}: CascaderPanelProps) {
  const { mode } = useCascaderActions();
  const Comp = asChild ? Slot.Root : 'div';

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Called FIRST, so a consumer's handler can drop this one with
      // `preventDefault`; the base twin gets that ordering from `mergeProps`.
      onKeyDown?.(event);
      if (event.key !== 'Tab' || event.defaultPrevented) return;
      // A browser-level move (Ctrl+Tab switches tabs) is never ours.
      if (event.altKey || event.ctrlKey || event.metaKey) return;

      const panel = event.currentTarget;
      const target = event.target as HTMLElement | null;
      if (!target || !panel.contains(target)) return;

      const next = getCascaderTabTarget(panel, target, event.shiftKey);
      // Off either end: left to the browser, since focus is never trapped.
      if (!next) return;

      event.preventDefault();
      next.focus();
    },
    [onKeyDown],
  );

  return (
    <Comp
      data-slot="cascader-panel"
      data-mode={mode}
      onKeyDown={handleKeyDown}
      className={cn('flex max-h-full min-h-0 w-full flex-col', className)}
      {...props}
    >
      {children}
    </Comp>
  );
}

/* -------------------------------------------------------------------------- */
/*                                    List                                    */
/* -------------------------------------------------------------------------- */

export interface CascaderListProps extends Omit<ComboboxPrimitive.List.Props, 'style'> {
  /** Applied to the OUTER shell, which owns the height, so an inline
   * `--cascader-max-height` lands where the bound can read it. Narrowed from
   * Base UI's `style`: the shell is a plain `<div>` with no list state. */
  style?: React.CSSProperties;
  /** Caps this level's height; the panel still shrinks to fit. Default 24rem. */
  maxHeight?: number | string;
}

/**
 * Scroll container for one level: pattern 3 of the house scroll reference,
 * viewport-bounded popup scroll. The height is `min()` of `--available-height`
 * (the positioner's space between anchor and viewport edge) and `maxHeight`,
 * so neither can be ignored; a fixed pixel cap alone still reserved 288px for
 * a panel opened 200px above the fold and spilled off screen, and wasted room
 * in a tall window. The four classes are shared with `CascaderColumns` and
 * live in `cascader-lib.tsx`.
 */
function CascaderList({ className, style, maxHeight: maxHeightProp, ...props }: CascaderListProps) {
  const { maxHeight, mode, labels, baseId, virtualized } = useCascaderActions();
  const { currentParent } = useCascaderState();
  const resolved = maxHeightProp ?? maxHeight;

  return (
    <div
      data-slot="cascader-list-shell"
      style={
        resolved != null
          ? ({
              ...style,
              '--cascader-max-height': typeof resolved === 'number' ? `${resolved}px` : resolved,
            } as React.CSSProperties)
          : style
      }
      className={cn('relative flex max-h-full min-h-0', CASCADER_LIST_PAD_CLASS)}
    >
      <div
        data-slot="cascader-list-bounds"
        className={cn(
          'flex w-full min-w-0 flex-col overscroll-contain',
          CASCADER_LIST_HEIGHT_CLASS,
        )}
      >
        <ScrollArea className={CASCADER_SCROLL_CLASS}>
          <ComboboxPrimitive.List
            data-slot="cascader-list"
            /* Base UI names the list nothing, so every mode shipped an unnamed
               listbox. The level's parent is the name; the root borrows one. */
            aria-label={currentParent?.label ?? labels.rootLevel}
            /* Replaces Base UI's floating id. `aria-controls` reads the live
               id, so the columns trail gets a predictable target. */
            id={`${baseId}-column-0`}
            /* NEVER a ternary ending in `undefined`: `mergeProps` iterates own
               keys, so that DELETES Base UI's `role="listbox"`. */
            {...(mode === 'tree' ? { role: 'tree' as const } : null)}
            {...(virtualized ? { 'data-virtualized': true } : null)}
            className={cn(
              CASCADER_ROWS_CLASS,
              /* A windowed row is absolutely positioned, so the ROWS' box is
                 the containing block, not the scrollport: it carries the
                 padding the geometry is measured against. */
              virtualized && 'relative',
              className,
            )}
            {...props}
          />
        </ScrollArea>
      </div>
    </div>
  );
}

export interface CascaderStatusProps extends ComboboxPrimitive.Status.Props {
  asChild?: boolean;
}

/**
 * Polite live region for the current level and result count, which drill-down
 * otherwise hides in a visual breadcrumb. Built on `Combobox.Status` for its
 * initial-mutation marker: Safari and VoiceOver need a text change ~200ms
 * after mount before reading a polite region at all.
 */
function CascaderStatus({ className, children, asChild = false, ...props }: CascaderStatusProps) {
  const { announcement } = useCascaderState();

  // `asChild` only engages when there IS an element to slot into: with a bare
  // string, Radix's `Slot` answers `null` and deletes the live region.
  const asSlot = asChild && React.isValidElement(children);

  return (
    <ComboboxPrimitive.Status
      data-slot="cascader-status"
      className={cn('sr-only', className)}
      {...(asSlot ? { render: <Slot.Root /> } : null)}
      {...props}
    >
      {children ?? announcement}
    </ComboboxPrimitive.Status>
  );
}

export { Cascader, CascaderPanel, CascaderList, CascaderStatus };

/** Re-exported from `cascader-context.tsx`: existing import paths keep
 * working, and the row component avoids an import cycle through this file. */
export {
  createCascaderHighlightStore,
  useCascaderActions,
  useCascaderHighlight,
  useCascaderRender,
  useCascaderState,
};

export type {
  CascaderActionsContextValue,
  CascaderColumn,
  CascaderHighlight,
  CascaderHighlightStore,
  CascaderItemState,
  CascaderRenderContextValue,
  CascaderStateContextValue,
};
