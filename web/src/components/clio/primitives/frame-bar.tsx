import {
  createContext,
  forwardRef,
  Fragment,
  memo,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { ArrowLeftIcon, ChevronRightIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { FrameBackContext } from './frame-back';
import { IconButton, NamedTooltip } from './icon-button';
import { t, ph } from '@lingui/core/macro';

/**
 * How far the frame bar has folded, one group per step: the secondary facts,
 * then the position fact (a page, a row count; marked `data-frame-position`),
 * so every fact has gone to the hover name before anything else moves
 * (workbench-lineage step 2), then folders, then the renderer's Format icons
 * (`tools`: zoom out and in, wrap, a tree toggle; see `useFrameTool`) move into
 * the … menu, so every viewer keeps one order: modes outlast @, which outlasts
 * Copy and Open, which outlast the icons. Then Open, Copy, @, then the modes
 * folding to one icon, then only the
 * name, Download, comments and the … menu. Narrowest (workbench-lineage step 6),
 * the modes move into the … menu as a checked list (`modes-menu`; see
 * `useFrameModes`), and the
 * group rules go: only the name, comments and the … menu remain (Download stays
 * so the original bytes are one click away). Modes and icons leave only a bar
 * whose … menu lists them (`data-frame-modes-menu`). Then the gaps tighten, and
 * on a bar without a … menu a renderer's zoom icons go (`zoom`, `data-slot="viewer-zoom-controls"`; Ctrl
 * or ⌘ with the wheel still zooms, and the … menu lists them), keeping the
 * position readout between them ("200 / 250"). Then the readout's zoom % goes
 * (`zoom-fact`, `data-readout-zoom`), so the page never folds before it. The name is
 * never cut while any of those still shows. A name cut short of `FRAME_NAME_MIN`
 * first drops the name's type icon (`icon`, `group-data-[fold-icon]/frame:hidden`) so a page readout
 * can stay beside a name cut to `FRAME_NAME_BESIDE_READOUT`; one cut shorter
 * then takes the readout's room (`readout`), and last, one still that short goes
 * too (`where`): the tab names it, and "o…" says nothing,
 * so Download and … are never cut. Children hide on the
 * bar's `data-fold-*` flags (`group-data-[fold-open]/frame:hidden`).
 */
const FRAME_FOLDS = [
  'facts',
  'position',
  'folders',
  'tools',
  'open',
  'copy',
  'talk',
  'modes',
  'name',
  'modes-menu',
  'rules',
  'zoom',
  'zoom-fact',
  'icon',
  'readout',
  'where',
] as const;

/** How narrow the name may truncate (its full path is the hover name) before a group folds. */
const FRAME_NAME_MIN = 96;

/**
 * How narrow the name may truncate, its icon gone, while it keeps a readout beside it
 * (about a dozen characters): the page you are on outranks the name's last letters.
 */
const FRAME_NAME_BESIDE_READOUT = 80;
const FRAME_ICON_FOLDED = FRAME_FOLDS.indexOf('icon') + 1;

/**
 * The name keeps its full width until everything else that folds has folded:
 * facts, folders, the Format icons, Open, Copy, @, the modes, the folders' …, the modes into the
 * … menu, the rules, zoom and the zoom % (workbench-lineage: "Name and comments stay").
 * Only then may it truncate, and below `FRAME_NAME_MIN` it goes (`where`).
 */
const FRAME_NAME_KEEPS_UNTIL = FRAME_FOLDS.indexOf('zoom-fact') + 1;

/**
 * Where the modes went at a width holds while the bar's content changes at
 * that width: switching Preview to Lineage, whose bar has no zoom to fold,
 * keeps the modes in the … menu instead of moving them back into the bar.
 * Rules, zoom and the name are fitted afresh.
 */
const FRAME_MODES_HOLD = FRAME_FOLDS.indexOf('modes-menu') + 1;

/** Folded facts, read for the location's hover name. */
const FrameFactsContext = createContext('');

/**
 * Whether a part of the bar is cut off: the bar scrolls, a marked text
 * truncates, or the name has truncated while a fact still shows or below
 * `FRAME_NAME_MIN`.
 */
function frameOverflows(bar: HTMLElement, fold: number) {
  if (bar.scrollWidth > bar.clientWidth + 1) return true;
  const facts = bar.querySelector<HTMLElement>('[data-slot=frame-facts]');
  const factShown = Array.from(facts?.children ?? []).some(
    (fact) => (fact as HTMLElement).offsetParent !== null,
  );
  const range = document.createRange();
  for (const part of bar.querySelectorAll<HTMLElement>('[data-frame-fit]')) {
    if (part.offsetParent === null || part.scrollWidth < part.clientWidth) continue;
    // scrollWidth/clientWidth round, so a sub-pixel cut (an ellipsis) reads as fitting.
    range.selectNodeContents(part);
    const width = part.getBoundingClientRect().width;
    if (range.getBoundingClientRect().width <= width + 0.01) continue;
    if (
      part.dataset.frameFit === 'name' &&
      fold >= FRAME_NAME_KEEPS_UNTIL &&
      !factShown &&
      width >=
        (fold === FRAME_ICON_FOLDED && readoutShown(bar)
          ? FRAME_NAME_BESIDE_READOUT
          : FRAME_NAME_MIN)
    )
      continue;
    return true;
  }
  return false;
}

function readoutShown(bar: HTMLElement) {
  const readout = bar.querySelector<HTMLElement>('[data-slot=viewer-zoom-readout]');
  return Boolean(readout && readout.offsetParent !== null);
}

/** The facts' words, comma separated, for the hover name once they have folded. */
function factsText(facts: HTMLElement | null): string {
  if (!facts) return '';
  return Array.from(facts.children, (child) => child.textContent?.trim() ?? '')
    .filter(Boolean)
    .join(', ');
}

/**
 * The bar above whatever a frame shows: Where (crumbs) · What (facts) ·
 * Format (modes) | Talk and Take (actions, last). 34px, one line. One rule, before
 * the actions; the modes sit right-aligned beside them, as every spec bar draws
 * them. No fixed breakpoints: it measures, and folds the next group only while
 * something would be cut off (see `FRAME_FOLDS`). A Format group whose renderer host
 * (`data-slot="frame-format-host"`) is empty, with no shown modes (a lone mode's
 * tablist sits inside a `hidden` segment), hides.
 */
export const FrameBar = memo(function FrameBar({
  where,
  what,
  format,
  actions,
  label,
  rule = true,
  className,
}: {
  where: ReactNode;
  what?: ReactNode;
  format?: ReactNode;
  /** Talk and Take: icon buttons and split buttons, in that order. */
  actions?: ReactNode;
  /** Accessible name of the toolbar ("File actions"). */
  label: string;
  /** The rule before the actions; off where the spec draws none (nothing for it to divide). */
  rule?: boolean;
  className?: string;
}) {
  const back = useContext(FrameBackContext);
  const barRef = useRef<HTMLDivElement>(null);
  const factsRef = useRef<HTMLDivElement>(null);
  // Width and content both start the fit again, from what this width already
  // folded the modes to (`hold`) or else from nothing folded.
  const [fitKey, setFitKey] = useState('');
  const [hold, setHold] = useState({ width: '', fold: 0 });
  const fitWidth = fitKey.split('|')[0];
  const start = hold.width === fitWidth ? hold.fold : 0;
  const [measured, setMeasured] = useState({ key: '', fold: 0 });
  if (measured.key !== fitKey) setMeasured({ key: fitKey, fold: start });
  const fold = measured.key === fitKey ? measured.fold : start;
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    let version = 0;
    const update = () => setFitKey(`${bar.clientWidth}|${version}`);
    update();
    const resize = new ResizeObserver(update);
    resize.observe(bar);
    const content = new MutationObserver(() => {
      version += 1;
      update();
    });
    content.observe(bar, { childList: true, characterData: true, subtree: true });
    return () => {
      resize.disconnect();
      content.disconnect();
    };
  }, []);
  const [foldedFacts, setFoldedFacts] = useState('');
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    if (fold < FRAME_FOLDS.length && frameOverflows(bar, fold)) {
      setMeasured((current) =>
        current.key === fitKey ? { key: fitKey, fold: current.fold + 1 } : current,
      );
      return;
    }
    // Settled: the facts that went to hover join the location's hover name.
    const text = fold > 0 ? factsText(factsRef.current) : '';
    setFoldedFacts((current) => (current === text ? current : text));
    const held = Math.min(fold, FRAME_MODES_HOLD);
    setHold((current) =>
      current.width !== fitWidth
        ? { width: fitWidth, fold: held }
        : current.fold >= held
          ? current
          : { width: fitWidth, fold: held },
    );
  }, [fitKey, fitWidth, fold]);
  const flags = Object.fromEntries(
    FRAME_FOLDS.map((step, index) => [`data-fold-${step}`, fold > index || undefined]),
  );
  return (
    <div
      role="toolbar"
      aria-label={label}
      data-slot="frame-bar"
      data-fold={FRAME_FOLDS[fold - 1]}
      {...flags}
      ref={barRef}
      className={cn(
        'group/frame flex h-[34px] min-w-0 shrink-0 items-center gap-2 overflow-hidden border-b border-border px-2 whitespace-nowrap data-fold-rules:gap-1',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {back ? (
          <IconButton
            data-slot="frame-back"
            icon={<ArrowLeftIcon />}
            label={t`Back to ${ph({ label: back.label })}`}
            onClick={back.onBack}
            size="sm"
            tooltipSide="bottom"
          />
        ) : null}
        <FrameFactsContext.Provider value={foldedFacts}>{where}</FrameFactsContext.Provider>
        {what ? (
          <div
            data-frame-fit=""
            data-slot="frame-facts"
            ref={factsRef}
            className="flex min-w-0 items-center gap-2 overflow-hidden text-caption text-muted-foreground group-data-[fold-position]/frame:hidden [&>:not([data-frame-position])]:group-data-[fold-facts]/frame:hidden"
          >
            {what}
          </div>
        ) : null}
      </div>
      {format ? (
        <div
          data-slot="frame-format"
          className="flex min-w-0 shrink-0 items-center gap-2 group-data-[fold-rules]/frame:gap-1 [[data-fold-tools]:has([data-frame-modes-menu])_&_[data-frame-tool]]:hidden [&_[data-slot=viewer-zoom-controls]>:not([data-slot=viewer-zoom-readout])]:group-data-[fold-zoom]/frame:hidden [&_[data-readout-zoom]]:group-data-[fold-zoom-fact]/frame:hidden [&_[data-slot=viewer-zoom-readout]]:group-data-[fold-readout]/frame:hidden [&:has([data-slot=frame-format-host]:empty):not(:has([role=tablist]:not([hidden]_*)))]:hidden"
        >
          {format}
        </div>
      ) : null}
      {actions ? (
        <>
          {rule ? <FrameDivider className="group-data-[fold-modes-menu]/frame:hidden" /> : null}
          <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
        </>
      ) : null}
    </div>
  );
});

/** The 1×16 rule between frame bar groups. */
export function FrameDivider({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('h-4 w-px shrink-0 bg-border group-data-[fold-rules]/frame:hidden', className)}
    />
  );
}

export interface FrameCrumb {
  label: string;
  onSelect?: () => void;
}

/**
 * Where the shown thing lives. When the bar folds, the folders become one …
 * that lists them, then go entirely; the last part (the name) shows unless
 * the bar cannot fit a readable part of it, and the full path is the hover name.
 */
export const FrameCrumbs = memo(function FrameCrumbs({
  parts,
  className,
}: {
  parts: readonly FrameCrumb[];
  className?: string;
}) {
  const facts = useContext(FrameFactsContext);
  const path = parts.map((part) => part.label).join(' / ');
  const full = facts ? `${path}\n${facts}` : path;
  const folders = parts.slice(0, -1);
  const name = parts.at(-1);
  return (
    <nav
      aria-label={t`Location`}
      title={full}
      className={cn(
        'flex min-w-0 items-center gap-1 text-menu group-data-[fold-where]/frame:hidden',
        className,
      )}
    >
      {folders.length ? (
        <span className="hidden items-center gap-1 group-data-[fold-folders]/frame:inline-flex group-data-[fold-name]/frame:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={t`Folders: ${ph({ path: folders.map((part) => part.label).join(' / ') })}`}
              className="rounded-[4px] px-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
            >
              …
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {folders.map((part, index) => (
                <DropdownMenuItem
                  disabled={!part.onSelect}
                  key={`${index}:${part.label}`}
                  onSelect={() => part.onSelect?.()}
                >
                  {part.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <ChevronRightIcon aria-hidden="true" className="size-3 shrink-0 text-faint" />
        </span>
      ) : null}
      {folders.map((part, index) => (
        <Fragment key={`${index}:${part.label}`}>
          {part.onSelect ? (
            <button
              type="button"
              data-frame-fit=""
              onClick={part.onSelect}
              className="min-w-0 shrink truncate rounded-[4px] px-0.5 text-muted-foreground outline-none group-data-[fold-folders]/frame:hidden hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
            >
              {part.label}
            </button>
          ) : (
            <span
              data-frame-fit=""
              className="min-w-0 shrink truncate text-muted-foreground group-data-[fold-folders]/frame:hidden"
            >
              {part.label}
            </span>
          )}
          <ChevronRightIcon
            aria-hidden="true"
            className="size-3 shrink-0 text-faint group-data-[fold-folders]/frame:hidden"
          />
        </Fragment>
      ))}
      {name ? (
        <span
          aria-current="location"
          data-frame-fit="name"
          className="min-w-0 shrink truncate font-medium text-foreground"
        >
          {name.label}
        </span>
      ) : null}
    </nav>
  );
});

export interface FrameTabTriggerProps {
  className: string;
  children: ReactNode;
}

export interface FrameTabProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'onSelect'> {
  label: string;
  /** A version tag after the name, muted (spec `.t`): tells open versions of one file apart. */
  version?: string;
  icon?: ReactNode;
  active?: boolean;
  /** Unsaved changes: say so in words for assistive technology. */
  dirty?: boolean;
  /** The conversation changed it: the name turns teal and says so in words. */
  changed?: boolean;
  /** Pinned: first in the row, icon only, no close. */
  pinned?: boolean;
  /** Short of room: an inactive tab shows only its icon (the name is on hover). */
  compact?: boolean;
  /** Hover name, in the shared tooltip; defaults to the label (a path is better when there is one). */
  title?: string;
  onSelect?: () => void;
  onClose?: () => void;
  /**
   * Renders the tab control itself, for a host whose tabs come from a tabs
   * library (a Radix `TabsTrigger`). It receives the classes and contents to
   * put on it. Without it the tab is a plain `role="tab"` button.
   */
  renderTrigger?: (props: FrameTabTriggerProps) => ReactElement;
}

/**
 * One open thing in a frame's tab row: the row's full 40px, icon, one-line
 * name, and on the active tab a 2px primary underline and a close mark (its
 * space is kept on every tab). Pinned tabs and, when the row is short of
 * room, inactive ones shrink to their icon.
 *
 * The close mark is a pointer affordance outside the accessibility tree. A
 * tablist may own nothing but tabs and a tab's children are presentational,
 * so a real button on either side of the tab is a critical axe violation
 * (aria-required-children, nested-interactive). Keyboard users close the tab
 * with Delete, which the host announces through `aria-keyshortcuts`.
 */
export const FrameTab = memo(
  forwardRef<HTMLDivElement, FrameTabProps>(function FrameTab(
    {
      label,
      version,
      icon,
      active = false,
      dirty = false,
      changed = false,
      pinned = false,
      compact = false,
      title,
      onSelect,
      onClose,
      renderTrigger,
      className,
      ...rest
    },
    ref,
  ) {
    const iconOnly = Boolean(icon) && (pinned || (compact && !active));
    const closable = Boolean(onClose) && !pinned;
    const contents = (
      <>
        {icon ? (
          <span
            aria-hidden="true"
            className="grid size-3.5 shrink-0 place-items-center [&_svg:not([class*='size-'])]:size-3.5"
          >
            {icon}
          </span>
        ) : null}
        <span data-slot="frame-tab-name" className={cn('min-w-0 truncate', iconOnly && 'sr-only')}>
          {label}
        </span>
        {version && iconOnly ? <span className="sr-only"> {version}</span> : null}
        {version && !iconOnly ? (
          <span className="shrink-0 text-caption text-faint" data-slot="frame-tab-version">
            <span className="sr-only"> </span>
            {version}
          </span>
        ) : null}
        {changed ? <span className="sr-only">{t`, changed in this conversation`}</span> : null}
        {dirty ? <span className="sr-only">{t`, unsaved changes`}</span> : null}
        {pinned ? <span className="sr-only">{t`, pinned`}</span> : null}
      </>
    );
    // Close space is kept on every tab (9px pad + 13px mark + 7px gap) so
    // activating one never shifts the row.
    const triggerClassName = cn(
      'flex h-full min-w-0 flex-1 items-center gap-[7px] outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset',
      iconOnly ? 'justify-center px-2.5' : closable ? 'pr-[29px] pl-[9px]' : 'px-[9px]',
    );
    const hoverName = title ?? label;
    // The shared hover name, not a native title: a compacted or shortened tab
    // is told apart at once, and the tooltip composes with the host's drag
    // handlers (it wraps the tab, not its trigger). It replaces the global
    // truncation hint, which would otherwise show the same name a second time.
    return (
      <NamedTooltip label={hoverName}>
        <div
          ref={ref}
          data-slot="frame-tab"
          data-truncation-hint="off"
          data-active={active || undefined}
          data-changed={changed || undefined}
          data-pinned={pinned || undefined}
          className={cn(
            // Spec .tab.on: foreground text over a 2px primary line, no fill. The
            // line is its own layer so the trigger's background never covers it,
            // and the tab fills the row above its border so nothing clips it.
            'group/frame-tab relative flex h-full max-h-10 min-w-0 shrink-0 items-center text-menu whitespace-nowrap text-muted-foreground hover:text-foreground data-active:text-foreground data-active:after:pointer-events-none data-active:after:absolute data-active:after:inset-x-0 data-active:after:bottom-0 data-active:after:z-[1] data-active:after:h-0.5 data-active:after:bg-primary data-changed:[&_[data-slot=frame-tab-name]]:text-changed',
            iconOnly ? 'w-[34px]' : 'max-w-56 min-w-[min(6rem,100%)]',
            className,
          )}
          {...rest}
        >
          {renderTrigger ? (
            renderTrigger({ className: triggerClassName, children: contents })
          ) : (
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={onSelect}
              className={triggerClassName}
            >
              {contents}
            </button>
          )}
          {closable && active && !iconOnly ? (
            <span
              aria-hidden="true"
              data-slot="frame-tab-close"
              title={t`Close ${label}`}
              onClick={(event: MouseEvent) => {
                event.stopPropagation();
                onClose?.();
              }}
              className="absolute top-1/2 right-[5px] grid size-[21px] -translate-y-1/2 cursor-pointer place-items-center rounded-[5px] text-faint hover:bg-menu-highlight hover:text-foreground"
            >
              <CloseIcon aria-hidden="true" className="size-[13px]" />
            </span>
          ) : null}
        </div>
      </NamedTooltip>
    );
  }),
);
