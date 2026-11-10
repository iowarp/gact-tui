import {
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
import { IconButton } from './icon-button';

/**
 * How far the frame bar has folded, one group per step: the secondary facts,
 * folders, Open, Copy, @, the position fact (a page, a row count; marked
 * `data-frame-position`), then the modes folding to one icon, then only the
 * name, Download, comments and the … menu. Narrowest (workbench-lineage step 6),
 * the modes move into the … menu as a checked list (`modes-menu`; see
 * `useFrameModes`) with the renderer's Format icons (`useFrameTool`), and the
 * group rules go: only the name, comments and the ? menu remain (Download stays
 * so the original bytes are one click away). Modes and icons leave only a bar
 * whose ? menu lists them (`data-frame-modes-menu`). Then the gaps tighten. A
 * name still cut short of `FRAME_NAME_MIN` then goes too (`where`): the tab names
 * it, and "o?" says nothing. Last, a renderer's zoom icons (`zoom`,
 * `data-slot="viewer-zoom-controls"`; Ctrl or ? with the wheel still zooms, and
 * the ? menu lists them), so Download and ? are never cut. Children hide on the
 * bar's `data-fold-*` flags (`group-data-[fold-open]/frame:hidden`).
 */
const FRAME_FOLDS = [
  'facts',
  'folders',
  'open',
  'copy',
  'talk',
  'position',
  'modes',
  'name',
  'modes-menu',
  'rules',
  'where',
  'zoom',
] as const;

/** How narrow the name may truncate (its full path is the hover name) before a group folds. */
const FRAME_NAME_MIN = 96;

/**
 * Whether a part of the bar is cut off: the bar scrolls, a marked text
 * truncates, or the name has truncated below `FRAME_NAME_MIN`.
 */
function frameOverflows(bar: HTMLElement) {
  if (bar.scrollWidth > bar.clientWidth + 1) return true;
  for (const part of bar.querySelectorAll<HTMLElement>('[data-frame-fit]')) {
    if (part.offsetParent === null || part.scrollWidth <= part.clientWidth + 1) continue;
    if (part.dataset.frameFit === 'name' && part.clientWidth >= FRAME_NAME_MIN) continue;
    return true;
  }
  return false;
}

/**
 * The bar above whatever a frame shows: Where (crumbs) · What (facts) ·
 * Format (modes) · Talk and Take (actions, last). 34px, one line. No fixed
 * breakpoints: it measures, and folds the next group only while something
 * would be cut off (see `FRAME_FOLDS`). A Format group whose renderer host
 * (`data-slot="frame-format-host"`) is empty, with no shown modes (a lone
 * mode's tablist sits inside a `hidden` segment), hides with its rule.
 */
export const FrameBar = memo(function FrameBar({
  where,
  what,
  format,
  actions,
  label,
  className,
}: {
  where: ReactNode;
  what?: ReactNode;
  format?: ReactNode;
  /** Talk and Take: icon buttons and split buttons, in that order. */
  actions?: ReactNode;
  /** Accessible name of the toolbar ("File actions"). */
  label: string;
  className?: string;
}) {
  const back = useContext(FrameBackContext);
  const barRef = useRef<HTMLDivElement>(null);
  // Width and content both start the fit again from nothing folded.
  const [fitKey, setFitKey] = useState('');
  const [measured, setMeasured] = useState({ key: '', fold: 0 });
  if (measured.key !== fitKey) setMeasured({ key: fitKey, fold: 0 });
  const fold = measured.key === fitKey ? measured.fold : 0;
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
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar || fold >= FRAME_FOLDS.length || !frameOverflows(bar)) return;
    setMeasured((current) =>
      current.key === fitKey ? { key: fitKey, fold: current.fold + 1 } : current,
    );
  }, [fitKey, fold]);
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
            label={`Back to ${back.label}`}
            onClick={back.onBack}
            size="sm"
            tooltipSide="bottom"
          />
        ) : null}
        {where}
        {what ? (
          <div
            data-frame-fit=""
            className="flex min-w-0 items-center gap-2 overflow-hidden text-[11px] text-muted-foreground group-data-[fold-position]/frame:hidden [&>:not([data-frame-position])]:group-data-[fold-facts]/frame:hidden"
          >
            {what}
          </div>
        ) : null}
      </div>
      {format ? (
        <div
          data-slot="frame-format"
          className="flex min-w-0 shrink-0 items-center gap-2 group-data-[fold-rules]/frame:gap-1 [[data-fold-modes-menu]:has([data-frame-modes-menu])_&_[data-frame-tool]]:hidden [&_[data-slot=viewer-zoom-controls]]:group-data-[fold-zoom]/frame:hidden [&:has([data-slot=frame-format-host]:empty):not(:has([role=tablist]:not([hidden]_*)))]:hidden"
        >
          <FrameDivider className="group-data-[fold-modes-menu]/frame:hidden" />
          {format}
        </div>
      ) : null}
      {actions ? (
        <>
          <FrameDivider className="group-data-[fold-modes-menu]/frame:hidden" />
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
  const full = parts.map((part) => part.label).join(' / ');
  const folders = parts.slice(0, -1);
  const name = parts.at(-1);
  return (
    <nav
      aria-label="Location"
      title={full}
      className={cn(
        'flex min-w-0 items-center gap-1 text-[12.5px] group-data-[fold-where]/frame:hidden',
        className,
      )}
    >
      {folders.length ? (
        <span className="hidden items-center gap-1 group-data-[fold-folders]/frame:inline-flex group-data-[fold-name]/frame:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Folders: ${folders.map((part) => part.label).join(' / ')}`}
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
  title: string;
  children: ReactNode;
}

export interface FrameTabProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'onSelect'> {
  label: string;
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
  /** Hover name; defaults to the label (a path is better when there is one). */
  title?: string;
  onSelect?: () => void;
  onClose?: () => void;
  /**
   * Renders the tab control itself, for a host whose tabs come from a tabs
   * library (a Radix `TabsTrigger`). It receives the classes, hover name and
   * contents to put on it. Without it the tab is a plain `role="tab"` button.
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
        {changed ? <span className="sr-only">, changed in this conversation</span> : null}
        {dirty ? <span className="sr-only">, unsaved changes</span> : null}
        {pinned ? <span className="sr-only">, pinned</span> : null}
      </>
    );
    // Close space is kept on every tab (9px pad + 13px mark + 7px gap) so
    // activating one never shifts the row.
    const triggerClassName = cn(
      'flex h-full min-w-0 flex-1 items-center gap-[7px] outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset',
      iconOnly ? 'justify-center px-2.5' : closable ? 'pr-[29px] pl-[9px]' : 'px-[9px]',
    );
    const hoverName = title ?? label;
    return (
      <div
        ref={ref}
        data-slot="frame-tab"
        data-active={active || undefined}
        data-changed={changed || undefined}
        data-pinned={pinned || undefined}
        className={cn(
          // Spec .tab.on: foreground text over a 2px primary line, no fill. The
          // line is its own layer so the trigger's background never covers it,
          // and the tab fills the row above its border so nothing clips it.
          'group/frame-tab relative flex h-full max-h-10 min-w-0 shrink-0 items-center text-[12.5px] whitespace-nowrap text-muted-foreground hover:text-foreground data-active:text-foreground data-active:after:pointer-events-none data-active:after:absolute data-active:after:inset-x-0 data-active:after:bottom-0 data-active:after:z-[1] data-active:after:h-0.5 data-active:after:bg-primary data-changed:[&_[data-slot=frame-tab-name]]:text-changed',
          iconOnly ? 'w-[34px]' : 'max-w-56 min-w-[min(6rem,100%)]',
          className,
        )}
        {...rest}
      >
        {renderTrigger ? (
          renderTrigger({ className: triggerClassName, title: hoverName, children: contents })
        ) : (
          <button
            type="button"
            role="tab"
            aria-selected={active}
            onClick={onSelect}
            title={hoverName}
            className={triggerClassName}
          >
            {contents}
          </button>
        )}
        {closable && active && !iconOnly ? (
          <span
            aria-hidden="true"
            data-slot="frame-tab-close"
            title={`Close ${label}`}
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
    );
  }),
);
