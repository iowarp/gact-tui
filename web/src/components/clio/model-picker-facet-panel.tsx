import { CheckIcon, ChevronDownIcon, ChevronUpIcon, SearchIcon } from 'lucide-react';
import {
  createElement,
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { Slider } from '@/components/ui/slider';
import {
  filterFacetGroups,
  mainFacetGroups,
  type FacetChip,
  type FacetGroup,
  type FacetTab,
} from '@/lib/model-facets';
import { DEFAULT_FILTER_TOKENS } from '@/lib/model-filter-tokens';
import { providerLogoId } from '@/lib/provider-presentation';
import { cn } from '@/lib/utils';
import { tagIcon } from './model-capability-tag-icons';
import { steppedRange, type RangeSection, type RangeSliderRow } from './model-picker-filter-ranges';
import { ShortcutKeys } from './primitives/key-chip';
import { ListGroupLabel, ListRow } from './primitives/list-row';
import { PickerFooter, type PickerHint } from './primitives/picker-footer';
import { identifierInputProps } from '@/lib/identifier-input';

/** A group with more rows than this shows its leading ones and "Show all". */
const COLLAPSED_ROWS = 6;
/** The row that holds the groups after the ranges until it is opened. */
const FOLD_KEY = 'fold';

type FilterRow =
  | { kind: 'chip'; key: string; chip: FacetChip }
  | {
      kind: 'option';
      key: string;
      label: string;
      token: string;
      checked: boolean;
      disabled: boolean;
      onToggle: () => void;
    }
  | { kind: 'slider'; key: string; slider: RangeSliderRow }
  | {
      kind: 'more';
      key: string;
      label: string;
      group: string;
      expanded: boolean;
      onSelect: () => void;
    }
  | { kind: 'fold'; key: string; label: string; onSelect: () => void }
  | { kind: 'label'; key: string; label: string };

interface FilterSection {
  key: string;
  label: string;
  hint?: ReactNode;
  /** The name filter of an expanded large group. */
  before?: ReactNode;
  rows: FilterRow[];
}

/** The keys the panel answers while the search field keeps focus. */
export interface FacetPanelHandle {
  /** Handles one key from the search field; true when the panel used it. */
  keyDown: (event: KeyboardEvent<HTMLInputElement>) => boolean;
}

interface ModelPickerFacetPanelProps {
  tabs: readonly FacetTab[];
  onToggleChip: (chip: FacetChip) => void;
  /** Context / Size / Cost / Released, after Capabilities. */
  ranges?: readonly RangeSection[];
  /** Back to the list (the footer's Esc). */
  onClose: () => void;
}

/**
 * Keeps real focus in the picker's search field while the panel is used with
 * a pointer, so typing after a row press still searches. The name-filter
 * field is the one control here that takes focus on purpose.
 */
function keepSearchFocus(event: MouseEvent<HTMLDivElement>): void {
  if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
}

/** The name-filter field's keys stay in it: the rows behind it must not move. */
function containKeys(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key !== 'Escape') event.stopPropagation();
}

function navigable(row: FilterRow): boolean {
  if (row.kind === 'label') return false;
  if (row.kind === 'option') return !row.disabled;
  if (row.kind === 'chip') return !chipEmpty(row.chip);
  return true;
}

function chipEmpty(chip: FacetChip): boolean {
  return !chip.remote && !chip.active && chip.count === 0;
}

function chipLabel(chip: FacetChip): string {
  const swap = chip.replaces.length ? ` (replaces ${chip.replaces.join(', ')})` : '';
  return chip.remote
    ? `${chip.label}: search Hugging Face${swap}`
    : `${chip.label}: ${chip.count} ${chip.count === 1 ? 'model' : 'models'}${swap}`;
}

const FOOTER_HINTS: readonly PickerHint[] = [
  { label: 'Move', shortcut: 'menu-move' },
  { label: 'Toggle', shortcut: 'menu-toggle' },
  { label: 'Next group', shortcut: 'menu-next-group', optional: true },
];

/** The spec's `.pcb`: a 13px box, filled with a check while on. */
export function FilterCheck({
  checked,
  disabled = false,
}: {
  checked: boolean;
  disabled?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-[13px] shrink-0 place-items-center rounded-[3px] border-[1.5px]',
        checked
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-muted-foreground/55',
        disabled && 'opacity-50',
      )}
    >
      {checked ? <CheckIcon className="size-2.5" strokeWidth={3.5} /> : null}
    </span>
  );
}

/** The trailing column every row shares: a count, then the ↵ of the highlighted row. */
function RowTail({ count, enter }: { count?: ReactNode; enter: boolean }) {
  return (
    <span className="flex w-[76px] shrink-0 items-center justify-end gap-[11px] text-[11px] text-faint tabular-nums">
      {count}
      <span className={cn('inline-flex', !enter && 'invisible')}>
        <ShortcutKeys id="menu-pick" variant="row" />
      </span>
    </span>
  );
}

export function ChipIcon({ chip }: { chip: FacetChip }) {
  if (chip.icon.kind === 'provider') {
    return (
      <ModelSelectorLogo className="size-[15px]" provider={providerLogoId(chip.icon.providerId)} />
    );
  }
  return createElement(tagIcon(chip.icon.tag), { className: 'size-[15px]' });
}

const ROW_CLASS = 'h-[30px] gap-[9px] rounded-[7px] px-2 text-[13px]';

/**
 * The model picker's Filters, as the spec draws them: every filter as a row
 * over the list. Capabilities as checkbox rows with their counts, then the
 * Context / Size / Cost / Released sliders with what each also lets in, then
 * Tasks, Input, Output, Providers and Other, folded into one row until PgDn
 * or ↵ opens them, each then showing its leading rows
 * and "Show all" for the rest (a large group gets a name filter). Every row
 * comes from the catalog's own tags and toggles its token in the search bar.
 * Focus stays in the search field, on the first row as the panel opens: ↑↓
 * move, Space or ↵ toggle, PgDn jumps a
 * group, ←→ slide, Esc goes back to the list.
 */
export const ModelPickerFacetPanel = forwardRef<FacetPanelHandle, ModelPickerFacetPanelProps>(
  function ModelPickerFacetPanel({ tabs, onToggleChip, ranges = [], onClose }, handle) {
    const rootRef = useRef<HTMLDivElement>(null);
    // `undefined` until a key or pointer moves it: the panel opens on its first row.
    const [chosen, setActive] = useState<string | null | undefined>(undefined);
    const [expanded, setExpanded] = useState<string | null>(null);
    // The groups after the ranges fold into one row, unless one of them is on
    // (beyond the defaults every search starts with).
    const [restOpen, setRestOpen] = useState(() =>
      tabs.some(
        (tab) =>
          tab.id !== 'capabilities' &&
          tab.groups.some((group) =>
            group.chips.some((chip) => chip.active && !DEFAULT_FILTER_TOKENS.includes(chip.token)),
          ),
      ),
    );
    const [nameFilter, setNameFilter] = useState('');
    const [height, setHeight] = useState<number>();

    // Over the list and its footer: from under the search rows to the picker's bottom.
    useLayoutEffect(() => {
      const panel = rootRef.current;
      const search = panel?.parentElement;
      const container = search?.closest<HTMLElement>('[data-slot="cascader-panel"]');
      if (!panel || !search || !container) return;
      // The picker's popup can clip the panel it holds; stop at whichever ends first.
      const frame = container.closest<HTMLElement>('[data-slot="model-picker"]');
      const measure = () => {
        const bottom = Math.min(
          container.getBoundingClientRect().bottom,
          frame?.getBoundingClientRect().bottom ?? Infinity,
        );
        const next = bottom - search.getBoundingClientRect().bottom;
        setHeight(next > 120 ? next : undefined);
      };
      measure();
      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(measure);
      observer.observe(container);
      observer.observe(search);
      if (frame) observer.observe(frame);
      return () => observer.disconnect();
    }, []);

    function toggleExpanded(key: string): void {
      setExpanded((current) => (current === key ? null : key));
      setNameFilter('');
    }

    const sections: FilterSection[] = [];
    const clusters = mainFacetGroups(tabs, COLLAPSED_ROWS);
    function clusterSection(cluster: (typeof clusters)[number]): FilterSection {
      const key = `${cluster.tab}/${cluster.id}`;
      const tab = tabs.find((item) => item.id === cluster.tab)!;
      const open = expanded === key;
      const rows: FilterRow[] = [];
      let before: ReactNode;
      if (open) {
        const groups: FacetGroup[] =
          tab.id === 'other' ? tab.groups.filter((group) => group.id === cluster.id) : tab.groups;
        const total = groups.reduce((sum, group) => sum + group.chips.length, 0);
        if (total > COLLAPSED_ROWS) {
          before = (
            <label className="mx-2 my-1 flex h-7 items-center gap-2 rounded-[6px] border px-2 text-[12.5px]">
              <SearchIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
              <input
                {...identifierInputProps}
                aria-label={`Filter ${cluster.label} by name`}
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint"
                onChange={(event) => setNameFilter(event.target.value)}
                onKeyDown={containKeys}
                placeholder={`Filter ${cluster.label} by name`}
                value={nameFilter}
              />
            </label>
          );
        }
        const shown = filterFacetGroups(groups, nameFilter);
        for (const group of shown) {
          if (shown.length > 1)
            rows.push({ kind: 'label', key: `${key}/${group.id}`, label: group.label });
          for (const chip of group.chips) rows.push({ kind: 'chip', key: chip.token, chip });
        }
        if (!shown.length) {
          rows.push({
            kind: 'label',
            key: `${key}/none`,
            label: nameFilter
              ? `No ${cluster.label.toLowerCase()} match "${nameFilter}"`
              : `No ${cluster.label.toLowerCase()} in the listed models`,
          });
        }
      } else {
        for (const chip of cluster.chips) rows.push({ kind: 'chip', key: chip.token, chip });
      }
      if (cluster.more > 0 || open) {
        rows.push({
          kind: 'more',
          group: cluster.label,
          key: `${key}/more`,
          label: open ? 'Show fewer' : `Show all ${cluster.chips.length + cluster.more}`,
          expanded: open,
          onSelect: () => toggleExpanded(key),
        });
      }
      return { key, label: cluster.label, before, rows };
    }

    const capabilities = clusters.filter((cluster) => cluster.tab === 'capabilities');
    for (const cluster of capabilities) sections.push(clusterSection(cluster));
    for (const range of ranges) {
      const rows: FilterRow[] = [
        { kind: 'slider', key: `range/${range.id}`, slider: range.slider },
      ];
      for (const option of range.options) {
        rows.push({ kind: 'option', key: `range/${range.id}/${option.token}`, ...option });
      }
      sections.push({ key: `range/${range.id}`, label: range.slider.label, rows });
    }
    const afterRanges = sections.length;
    const rest = clusters
      .filter((cluster) => cluster.tab !== 'capabilities')
      .map((cluster) => ({ cluster, section: clusterSection(cluster) }));
    const firstRest = rest.flatMap(({ section }) => section.rows).find(navigable)?.key;
    function unfold(): void {
      setRestOpen(true);
      setActive(firstRest ?? null);
    }
    if (restOpen || !rest.length || afterRanges === 0) {
      for (const { section } of rest) sections.push(section);
    } else {
      // The spec's "Tasks, Input, Output, Providers, Other · PgDn": one row
      // so the panel ends at a predictable height.
      const label = [
        ...new Set(rest.map(({ cluster }) => tabs.find((tab) => tab.id === cluster.tab)!.label)),
      ].join(', ');
      sections.push({
        key: FOLD_KEY,
        label,
        rows: [{ kind: 'fold', key: FOLD_KEY, label, onSelect: unfold }],
      });
    }
    // The spec's group hints: on the first group of each kind.
    if (sections[0] && !sections[0].key.startsWith('range/')) {
      sections[0].hint = (
        <>
          <ShortcutKeys className="font-mono text-[10.5px] text-faint" id="menu-toggle" /> to toggle
        </>
      );
    }
    const firstRange = sections.find((section) => section.key.startsWith('range/'));
    if (firstRange) {
      firstRange.hint = (
        <>
          <ShortcutKeys className="font-mono text-[10.5px] text-faint" id="menu-slide" /> to slide
        </>
      );
    }
    if (ranges.length && sections[afterRanges] && sections[afterRanges].key !== FOLD_KEY) {
      sections[afterRanges].hint = (
        <ShortcutKeys className="font-mono text-[10.5px] text-faint" id="menu-next-group" />
      );
    }

    const order = sections.flatMap((section) =>
      section.rows.filter(navigable).map((row) => ({ row, section: section.key })),
    );
    const active = chosen === undefined ? (order[0]?.row.key ?? null) : chosen;
    const activeIndex = active ? order.findIndex((item) => item.row.key === active) : -1;

    function activate(row: FilterRow): void {
      if (row.kind === 'chip') onToggleChip(row.chip);
      else if (row.kind === 'option') row.onToggle();
      else if (row.kind === 'more' || row.kind === 'fold') row.onSelect();
    }

    function jumpGroup(direction: 1 | -1): boolean {
      if (!order.length) return false;
      const current = activeIndex < 0 ? undefined : order[activeIndex]!.section;
      const keys = [...new Set(order.map((item) => item.section))];
      const at = current === undefined ? -1 : keys.indexOf(current);
      const target =
        current === undefined
          ? keys[direction > 0 ? 0 : keys.length - 1]
          : keys[Math.min(keys.length - 1, Math.max(0, at + direction))];
      // Paging onto the fold, or on from it, opens the groups it holds.
      if (target === FOLD_KEY && (direction > 0 || current === FOLD_KEY)) {
        unfold();
        return true;
      }
      setActive(order.find((item) => item.section === target)!.row.key);
      return true;
    }

    useImperativeHandle(handle, () => ({
      keyDown(event) {
        if (event.ctrlKey || event.metaKey || event.altKey) return false;
        const row = activeIndex < 0 ? undefined : order[activeIndex]!.row;
        switch (event.key) {
          case 'ArrowDown':
            if (!order.length) return false;
            setActive(order[Math.min(activeIndex + 1, order.length - 1)]!.row.key);
            return true;
          case 'ArrowUp':
            if (!row) return false;
            setActive(activeIndex === 0 ? null : order[activeIndex - 1]!.row.key);
            return true;
          case 'PageDown':
            return jumpGroup(1);
          case 'PageUp':
            return jumpGroup(-1);
          case ' ':
          case 'Enter':
            if (!row) return false;
            activate(row);
            return true;
          case 'ArrowLeft':
          case 'ArrowRight': {
            if (row?.kind !== 'slider') return false;
            const { slider } = row;
            const thumb = event.shiftKey ? 1 - slider.keyThumb : slider.keyThumb;
            slider.onValueChange(
              steppedRange(
                slider.value,
                slider.stops.length,
                thumb,
                event.key === 'ArrowRight' ? 1 : -1,
              ),
            );
            return true;
          }
          default:
            // Typing goes back to the search text.
            if (event.key.length === 1 || event.key === 'Backspace') setActive(null);
            return false;
        }
      },
    }));

    useLayoutEffect(() => {
      if (!active) return;
      rootRef.current
        ?.querySelector<HTMLElement>(`[data-row-key="${CSS.escape(active)}"]`)
        ?.scrollIntoView?.({ block: 'nearest' });
    }, [active]);

    function renderRow(row: FilterRow): ReactNode {
      const highlighted = row.key === active;
      const hover = navigable(row) ? () => highlighted || setActive(row.key) : undefined;
      if (row.kind === 'label') {
        return (
          <div
            className="flex h-6 items-end px-2 pb-0.5 text-[11px] text-faint"
            data-row-key={row.key}
            key={row.key}
          >
            {row.label}
          </div>
        );
      }
      if (row.kind === 'slider') {
        const { slider } = row;
        const last = slider.stops.length - 1;
        return (
          <div
            className={cn(
              'flex min-w-0 items-center whitespace-nowrap',
              ROW_CLASS,
              highlighted && 'bg-menu-highlight',
            )}
            data-range={slider.id}
            data-row-key={row.key}
            data-selected={highlighted || undefined}
            data-slot="facet-range"
            key={row.key}
            onPointerMove={hover}
            title={slider.hint}
          >
            <slider.icon
              aria-hidden="true"
              className="size-[15px] shrink-0 text-muted-foreground"
            />
            <span className="shrink-0 text-foreground">{slider.stops[0]}</span>
            <Slider
              aria-label={slider.label}
              className={cn(
                'mx-1.5 min-w-[60px] flex-1',
                '[&_[data-slot=slider-track]]:h-[3px] [&_[data-slot=slider-track]]:bg-input',
                '[&_[data-slot=slider-thumb]]:border-0 [&_[data-slot=slider-thumb]]:bg-foreground/90 [&_[data-slot=slider-thumb]]:ring-3 [&_[data-slot=slider-thumb]]:ring-primary/35',
              )}
              max={last}
              min={0}
              minStepsBetweenThumbs={slider.value.length > 1 ? 1 : 0}
              onValueChange={slider.onValueChange}
              step={1}
              thumbProps={(index) => ({
                'aria-label':
                  slider.value.length > 1
                    ? `${slider.label} ${index === 0 ? 'from' : 'to'}`
                    : slider.label,
                'aria-valuetext': slider.stops[slider.value[index] ?? 0],
              })}
              value={[...slider.value]}
            />
            <span className="shrink-0 text-foreground">{slider.stops[last]}</span>
            <span
              className="w-[76px] shrink-0 truncate text-right font-mono text-[11px] text-muted-foreground"
              data-slot="facet-range-token"
              title={slider.token}
            >
              {slider.token?.slice(slider.token.indexOf(':') + 1)}
            </span>
          </div>
        );
      }
      if (row.kind === 'fold') {
        return (
          <div
            aria-expanded={false}
            aria-label={`Show ${row.label} filters`}
            className={cn(
              'cursor-pointer rounded-[7px] outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset',
              highlighted && 'bg-menu-highlight hover:bg-menu-highlight',
            )}
            data-row-key={row.key}
            data-selected={highlighted || undefined}
            data-slot="facet-fold"
            key={row.key}
            onClick={row.onSelect}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                row.onSelect();
              }
            }}
            onPointerMove={hover}
            role="button"
            tabIndex={0}
            title={`Show ${row.label}`}
          >
            <ListGroupLabel
              action={
                <span className="flex items-center gap-[11px] font-mono text-[10.5px] text-faint">
                  <ShortcutKeys id="menu-next-group" />
                  {highlighted ? <ShortcutKeys id="menu-pick" variant="row" /> : null}
                </span>
              }
              className="h-[30px] items-center px-2 pb-0"
            >
              {row.label}
            </ListGroupLabel>
          </div>
        );
      }
      if (row.kind === 'more') {
        const Icon = row.expanded ? ChevronUpIcon : ChevronDownIcon;
        return (
          <ListRow
            aria-expanded={row.expanded}
            aria-label={`${row.label} ${row.group}`}
            className={cn(ROW_CLASS, 'cursor-pointer text-muted-foreground')}
            data-row-key={row.key}
            data-slot="facet-more"
            icon={<Icon className="size-[15px]" />}
            key={row.key}
            onClick={row.onSelect}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                row.onSelect();
              }
            }}
            onPointerMove={hover}
            role="button"
            selected={highlighted}
            tabIndex={0}
            title={row.label}
            columns={<RowTail enter={highlighted} />}
          />
        );
      }
      const chip = row.kind === 'chip' ? row.chip : undefined;
      const item =
        row.kind === 'chip'
          ? {
              label: row.chip.label,
              token: row.chip.token,
              checked: row.chip.active,
              disabled: chipEmpty(row.chip),
              name: chipLabel(row.chip),
              hint: `${row.chip.token}${row.chip.replaces.length ? ` (replaces ${row.chip.replaces.join(', ')})` : ''}`,
            }
          : {
              ...row,
              name: row.label,
              hint: row.disabled ? `${row.token} (narrow the range first)` : row.token,
            };
      const { checked, disabled } = item;
      const toggle = () => {
        if (!disabled) activate(row);
      };
      return (
        <ListRow
          aria-checked={checked}
          aria-disabled={disabled || undefined}
          aria-label={item.name}
          className={cn(ROW_CLASS, disabled ? 'cursor-not-allowed' : 'cursor-pointer')}
          columns={
            <RowTail
              count={
                chip && !chip.remote ? (
                  <span data-slot="facet-chip-count">{chip.count}</span>
                ) : undefined
              }
              enter={highlighted}
            />
          }
          data-replaces={chip?.replaces.join(' ') || undefined}
          data-row-key={row.key}
          data-slot={chip ? 'facet-chip' : 'facet-option'}
          data-token={item.token}
          icon={chip ? <ChipIcon chip={chip} /> : undefined}
          key={row.key}
          onClick={toggle}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggle();
            }
          }}
          onPointerMove={hover}
          role="checkbox"
          selected={highlighted}
          status={<FilterCheck checked={checked} disabled={disabled} />}
          tabIndex={0}
          title={
            // Every name keeps the spec's one foreground tone; only an empty
            // filter (no listed model has it) reads muted, like the spec's `.dim`.
            <span className={cn(chip && disabled && 'text-muted-foreground')} title={item.hint}>
              {item.label}
            </span>
          }
        />
      );
    }

    return (
      <div
        aria-label="Filter models"
        className={cn(
          'absolute inset-x-0 top-full z-30 flex flex-col overflow-hidden bg-popover text-popover-foreground',
          height === undefined
            ? 'mt-1 h-[min(28rem,60dvh)] rounded-lg border shadow-lg'
            : 'border-t',
        )}
        data-slot="facet-panel"
        onMouseDown={keepSearchFocus}
        ref={rootRef}
        role="region"
        style={height === undefined ? undefined : { height }}
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pt-0.5 pb-1.5" data-slot="facet-rows">
          {sections.length ? (
            sections.map((section) =>
              section.key === FOLD_KEY ? (
                <section aria-label={section.label} data-group={section.key} key={section.key}>
                  {section.rows.map(renderRow)}
                </section>
              ) : (
                <section aria-label={section.label} data-group={section.key} key={section.key}>
                  <ListGroupLabel
                    action={
                      section.hint ? (
                        <span className="font-mono text-[10.5px] text-faint">{section.hint}</span>
                      ) : undefined
                    }
                    className="h-auto px-2 pt-[9px] pb-[3px]"
                  >
                    {section.label}
                  </ListGroupLabel>
                  {section.before}
                  {section.rows.map(renderRow)}
                </section>
              ),
            )
          ) : (
            <p className="px-2 py-3 text-[12.5px] text-muted-foreground">
              No model matches this search.
            </p>
          )}
        </div>
        <PickerFooter
          hints={[...FOOTER_HINTS, { label: 'Back', shortcut: 'menu-close', onSelect: onClose }]}
          hintsAlign="start"
        />
      </div>
    );
  },
);
