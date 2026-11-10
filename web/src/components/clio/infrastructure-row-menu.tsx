import { useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { IconButton, NamedTooltip } from './primitives/icon-button';
import { MenuRow } from './primitives/menu-row';

/** Below this list width a row's hover actions fold into its ⋯ (spec: "actions fold into ⋯"). */
export const INFRA_FOLD_WIDTH = 480;

/** One hover action of an infrastructure row, declared once for its icon and its menu row. */
export interface InfraRowAction {
  icon: ReactNode;
  label: string;
  onSelect?: () => void;
  /** A link instead of a command (Services on this computer). */
  to?: string;
  disabled?: boolean;
  /** For a show/hide toggle: whether its view is open. */
  expanded?: boolean;
}

const stop = (event: SyntheticEvent) => event.stopPropagation();
const ROW_ICON =
  'rounded-[5px] text-muted-foreground hover:bg-hover hover:text-foreground [&_svg:not([class*=size-])]:size-3.5';

/**
 * A row's hover actions: icons on a wide list, and the row's ⋯ menu when it has
 * one. On a narrow list the icons fold into that ⋯ (or a ⋯ of their own), so
 * the row keeps its name, its dot and one pinned action.
 */
export function InfraRowMenu({
  actions = [],
  menu,
  label,
}: {
  actions?: readonly InfraRowAction[];
  /** The row's own menu rows (Configure, View logs), always behind ⋯. */
  menu?: ReactNode;
  /** The ⋯ button's name ("More actions for llama.cpp"). */
  label: string;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [folded, setFolded] = useState(false);
  if (!actions.length && !menu) return null;
  return (
    <span className="flex items-center gap-0.5" onClick={stop} onKeyDown={stop}>
      {actions.map((action) => (
        <span className="contents @max-[480px]/infra:hidden" key={action.label}>
          {action.to ? (
            <NamedTooltip label={action.label}>
              <Button asChild className={ROW_ICON} size="icon-xs" variant="ghost">
                <Link aria-label={action.label} to={action.to}>
                  {action.icon}
                </Link>
              </Button>
            </NamedTooltip>
          ) : (
            <IconButton
              aria-expanded={action.expanded}
              disabled={action.disabled}
              icon={action.icon}
              label={action.label}
              onClick={action.onSelect}
              size="sm"
            />
          )}
        </span>
      ))}
      <DropdownMenu
        modal={false}
        onOpenChange={(open) => {
          if (!open) return;
          const list = trigger.current?.closest('[data-slot=infra-list]');
          setFolded(Boolean(list && list.clientWidth < INFRA_FOLD_WIDTH));
        }}
      >
        <DropdownMenuTrigger asChild>
          <IconButton
            className={cn(!menu && 'hidden @max-[480px]/infra:inline-flex')}
            icon={<MoreIcon />}
            label={label}
            ref={trigger}
            size="sm"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {folded
            ? actions.map((action) =>
                action.to ? (
                  <DropdownMenuItem asChild disabled={action.disabled} key={action.label}>
                    <Link to={action.to}>
                      <MenuRow icon={action.icon} label={action.label} />
                    </Link>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    disabled={action.disabled}
                    key={action.label}
                    onSelect={action.onSelect}
                  >
                    <MenuRow icon={action.icon} label={action.label} />
                  </DropdownMenuItem>
                ),
              )
            : null}
          {folded && actions.length && menu ? <DropdownMenuSeparator /> : null}
          {menu}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
