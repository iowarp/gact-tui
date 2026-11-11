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
import { NamedTooltip } from './icon-button';
import { MenuRow } from './menu-row';

export interface NavTab {
  id: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  to: string;
  /** Router state carried to the tab (where to return to). */
  state?: unknown;
}

// Widths drawn by the classes below: a closed tab is 7 + 14 + 7, plus the 2px gap;
// the open tab adds its name, the 6px icon gap and 10px right padding.
const CLOSED_TAB = 30;
const OPEN_TAB_CHROME = 37;
const LIST_TRIGGER = 44;

/**
 * Places within one page, as links: icon only, and the open tab adds its
 * name over a 2px primary underline; tabs fill the bar's height. Every closed tab keeps its name on hover and as its accessible name,
 * so the strip never wraps and nothing is unexplained. When the strip is squeezed,
 * closed tabs furthest from the open one go into an "N ▾" list at its end, so the
 * open tab keeps its whole name (spec: "Icons past the edge go into a list. The
 * open tab stays"). Pair it with the catalog's previous-tab and next-tab keys on
 * the page that owns it.
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
      const open = name ? OPEN_TAB_CHROME + name.scrollWidth + 1 : 0;
      if (open + closedCount * CLOSED_TAB <= width) return setFit(closedCount);
      setFit(Math.max(0, Math.floor((width - open - LIST_TRIGGER) / CLOSED_TAB)));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [tabs, active, closedCount]);
  const shown = new Set(priority.slice(0, fit));
  const listed = tabs.filter((_, index) => index !== activeIndex && !shown.has(index));
  return (
    <nav
      aria-label={label}
      data-slot="nav-tabs"
      ref={navRef}
      className={cn(
        'flex min-w-0 shrink-0 items-stretch gap-0.5 self-stretch whitespace-nowrap',
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
              'relative flex shrink-0 items-center gap-1.5 rounded-sm px-[7px] text-[12.5px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset',
              current &&
                'min-w-0 shrink pr-2.5 font-medium text-foreground after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary',
            )}
            key={id}
            state={state}
            to={to}
          >
            <Icon aria-hidden="true" className="size-3.5 shrink-0" />
            {current ? (
              <span className="truncate" data-tab-name="">
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
          <NamedTooltip label={`${listed.length} more`}>
            <DropdownMenuTrigger
              aria-label={`${listed.length} more: ${listed.map((tab) => tab.label).join(', ')}`}
              className="ml-auto flex h-[26px] shrink-0 items-center gap-[3px] self-center rounded-md px-1.5 text-[11.5px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-foreground"
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
