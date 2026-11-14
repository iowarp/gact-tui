import {
  memo,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type SVGProps,
} from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { interfaceScale, useInterfaceScale } from '@/theme/runtime';
import { NamedTooltip } from './icon-button';
import { MenuRow } from './menu-row';
import {
  CLOSED_TAB,
  LIST_TRIGGER,
  OPEN_TAB_CHROME,
  OPEN_TAB_ICON,
  nameFloor,
  oneLineWidth,
} from './nav-tabs-measure';
import { t, ph } from '@lingui/core/macro';

export interface NavTab {
  id: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  to: string;
  /** Router state carried to the tab (where to return to). */
  state?: unknown;
}

/**
 * Places within one page, as links: icon only, and the open tab adds its
 * name over a 2px primary underline; tabs fill the bar's height. Every closed tab keeps its name on hover and as its accessible name,
 * so the strip never wraps and nothing is unexplained. When the strip is squeezed,
 * closed tabs furthest from the open one go into an "N ▾" list at its end, so the
 * open tab keeps its whole name (spec: "Icons past the edge go into a list. The
 * open tab stays"). Only when even the folded strip is too narrow does the name
 * wrap, whole, between its words, with the list under it; it never gets narrower
 * than its longest word. Pair it with the catalog's previous-tab and next-tab keys
 * on the page that owns it.
 */
export const NavTabs = memo(function NavTabs({
  label,
  tabs,
  active,
  className,
}: {
  /** Names the strip for assistive technology ("Infrastructure sections"). */
  label: string;
  tabs: readonly NavTab[];
  active: string;
  className?: string;
}) {
  const navRef = useRef<HTMLElement>(null);
  const activeIndex = tabs.findIndex((tab) => tab.id === active);
  const closedCount = tabs.length - (activeIndex >= 0 ? 1 : 0);
  const [fit, setFit] = useState(closedCount);
  // Re-measures when Interface size changes; the measure reads the live size itself.
  const scaleKey = useInterfaceScale();
  // Closed tabs nearest the open one stay longest; the earlier one wins a tie.
  const priority = useMemo(
    () =>
      tabs
        .map((_, index) => index)
        .filter((index) => index !== activeIndex)
        .sort((a, b) => Math.abs(a - activeIndex) - Math.abs(b - activeIndex) || a - b),
    [tabs, activeIndex],
  );
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const width = nav.clientWidth;
      if (!width) return setFit(closedCount);
      const name = nav.querySelector<HTMLElement>('[data-tab-name]');
      const scale = interfaceScale();
      const closed = CLOSED_TAB * scale;
      // The name wraps between words, never letter by letter. When it cannot stay on one
      // line beside the "N ▾" list, the list goes under it and the name has the width.
      const open = name ? OPEN_TAB_CHROME * scale + oneLineWidth(name) + 1 : 0;
      const wraps = closedCount > 0 && open + LIST_TRIGGER * scale > width;
      nav.toggleAttribute('data-name-wraps', wraps);
      let tight = false;
      if (name) {
        const chrome =
          OPEN_TAB_CHROME * scale + 1 + (wraps || !closedCount ? 0 : LIST_TRIGGER * scale);
        const floor = nameFloor(name);
        // A longest word that cannot fit beside the open tab's icon takes the icon's room.
        tight = floor > width - chrome;
        const room = width - chrome + (tight ? OPEN_TAB_ICON * scale : 0);
        name.style.minWidth = `${Math.min(floor, Math.max(0, room))}px`;
      }
      nav.toggleAttribute('data-name-tight', tight);
      if (open + closedCount * closed <= width) return setFit(closedCount);
      setFit(Math.max(0, Math.floor((width - open - LIST_TRIGGER * scale) / closed)));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    // The open tab's name resizes with the root font size even when the bar does not.
    const name = nav.querySelector<HTMLElement>('[data-tab-name]');
    if (name) observer.observe(name);
    return () => observer.disconnect();
  }, [tabs, active, closedCount, scaleKey]);
  const shown = new Set(priority.slice(0, fit));
  const listed = tabs.filter((_, index) => index !== activeIndex && !shown.has(index));
  return (
    <nav
      aria-label={label}
      data-slot="nav-tabs"
      ref={navRef}
      className={cn(
        'flex min-w-0 shrink-0 items-stretch gap-0.5 self-stretch whitespace-nowrap data-name-wraps:flex-wrap',
        className,
      )}
    >
      {tabs.map(({ id, label: tabLabel, icon: Icon, to, state }, index) => {
        const current = index === activeIndex;
        if (!current && !shown.has(index)) return null;
        const link = (
          <Link
            aria-current={current ? 'page' : undefined}
            aria-label={tabLabel}
            className={cn(
              'relative flex shrink-0 items-center gap-1.5 rounded-sm px-[7px] text-menu text-muted-foreground outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset',
              current &&
                'min-w-0 shrink pr-2.5 font-medium text-foreground after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary',
            )}
            key={id}
            state={state}
            to={to}
          >
            <Icon
              aria-hidden="true"
              className={cn('size-3.5 shrink-0', current && 'in-data-name-tight:hidden')}
            />
            {current ? (
              <span
                className="min-w-0 py-1 leading-tight break-words whitespace-normal [word-break:auto-phrase]"
                data-tab-name=""
              >
                {tabLabel}
              </span>
            ) : null}
          </Link>
        );
        return current ? (
          link
        ) : (
          <NamedTooltip key={id} label={tabLabel}>
            {link}
          </NamedTooltip>
        );
      })}
      {listed.length ? (
        <DropdownMenu modal={false}>
          <NamedTooltip label={t`${ph({ count: listed.length })} more`}>
            <DropdownMenuTrigger
              data-tab-list=""
              aria-label={t`${ph({ count: listed.length })} more: ${ph({ tabs: listed.map((tab) => tab.label).join(', ') })}`}
              className="ml-auto flex h-[26px] shrink-0 items-center gap-[3px] self-center rounded-md px-1.5 text-label text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-foreground"
            >
              {listed.length}
              <ChevronDownIcon aria-hidden="true" className="size-3" />
            </DropdownMenuTrigger>
          </NamedTooltip>
          <DropdownMenuContent align="end" className="min-w-48">
            {listed.map(({ id, label: tabLabel, icon: Icon, to, state }) => (
              <DropdownMenuItem asChild key={id}>
                <Link state={state} to={to}>
                  <MenuRow icon={<Icon aria-hidden="true" />} label={tabLabel} />
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </nav>
  );
});
