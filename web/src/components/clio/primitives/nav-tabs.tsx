import { memo, type ComponentType, type SVGProps } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { NamedTooltip } from './icon-button';

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
 * name. Every closed tab keeps its name on hover and as its accessible name,
 * so the strip never wraps and nothing is unexplained. Pair it with the
 * catalog's previous-tab and next-tab keys on the page that owns it.
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
  return (
    <nav
      aria-label={label}
      data-slot="nav-tabs"
      className={cn('flex min-w-0 shrink-0 items-center gap-0.5 whitespace-nowrap', className)}
    >
      {tabs.map(({ id, label: tabLabel, icon: Icon, to, state }) => {
        const current = id === active;
        const link = (
          <Link
            aria-current={current ? 'page' : undefined}
            aria-label={tabLabel}
            className={cn(
              'flex h-7 shrink-0 items-center gap-1.5 rounded-[7px] px-[7px] text-[12.5px] text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset',
              current && 'bg-hover pr-2.5 font-medium text-foreground',
            )}
            key={id}
            state={state}
            to={to}
          >
            <Icon aria-hidden="true" className="size-3.5 shrink-0" />
            {current ? <span className="truncate">{tabLabel}</span> : null}
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
    </nav>
  );
});
