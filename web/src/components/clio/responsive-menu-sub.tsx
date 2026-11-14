import { useRef, useState, type ReactNode } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import {
  DropdownMenuItem,
  DropdownMenuKey,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { MenuIcon } from './menu-key-items';
import { selectMenuKey } from './select-menu-key';

/** Below this a submenu cannot sit beside its 290px parent, so it opens in place. */
const INLINE_BELOW = 600;

/**
 * A `Label ›` row of a one-line menu. Beside the menu on wide screens; on a phone
 * the rows open under it instead of covering the rows they belong to.
 */
export function ResponsiveMenuSub({
  icon: Icon,
  label,
  menuKey,
  width = 260,
  contentClassName,
  children,
}: {
  icon: MenuIcon;
  label: string;
  /** The one letter that opens these rows while the menu is open. */
  menuKey?: string;
  width?: number;
  contentClassName?: string;
  children: ReactNode;
}) {
  const trigger = useRef<HTMLDivElement>(null);
  const [sideOffset, setSideOffset] = useState(0);
  const [expanded, setExpanded] = useState(false);
  if (window.innerWidth < INLINE_BELOW) {
    return (
      <>
        <DropdownMenuItem
          aria-expanded={expanded}
          aria-keyshortcuts={menuKey}
          className="whitespace-nowrap"
          data-menu-key={menuKey?.toLowerCase()}
          onKeyDown={(event) => {
            // Same keys as a submenu: Right opens the rows, Left folds them.
            if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
              event.preventDefault();
              setExpanded(event.key === 'ArrowRight');
            }
          }}
          onSelect={(event) => {
            event.preventDefault();
            setExpanded((open) => !open);
          }}
        >
          <Icon aria-hidden="true" className="text-muted-foreground" />
          {label}
          {menuKey ? <DropdownMenuKey>{menuKey}</DropdownMenuKey> : null}
          <ChevronDownIcon
            aria-hidden="true"
            className={cn(
              'text-muted-foreground',
              !menuKey && 'ml-auto',
              expanded && 'rotate-180',
            )}
          />
        </DropdownMenuItem>
        {expanded ? (
          <div
            aria-label={label}
            className={cn('ml-2 border-l border-border pl-1', contentClassName)}
            role="group"
          >
            {children}
          </div>
        ) : null}
      </>
    );
  }
  return (
    <DropdownMenuSub
      onOpenChange={(open) => {
        if (!open || !trigger.current) return;
        const bounds = trigger.current.getBoundingClientRect();
        // Radix flips a submenu; if neither side has room, overlap the parent
        // rather than clip the rows.
        const padding = 8;
        const right = window.innerWidth - bounds.right - padding;
        const left = bounds.left - padding;
        setSideOffset(right < width && left < width ? right - width : 0);
      }}
    >
      <DropdownMenuSubTrigger className="whitespace-nowrap" menuKey={menuKey} ref={trigger}>
        <Icon aria-hidden="true" className="text-muted-foreground" />
        {label}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent
        className={cn('max-w-[calc(100vw-1rem)]', contentClassName)}
        onKeyDown={selectMenuKey}
        sideOffset={sideOffset}
        style={{ width }}
      >
        {children}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
