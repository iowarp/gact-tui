import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { focusQuietly } from '@/components/clio/primitives/quiet-focus';
import { SettingsScopeIcon } from '@/components/clio/settings-scope-icon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { groupedSettingsSections, hostSection } from '@/lib/settings-window-route';
import { cn } from '@/lib/utils';
import { NavBadge, type SettingsNavigationProps } from './settings-navigation';

/**
 * The section list folded to a rail of the three scopes (App, workspace,
 * agent), for windows too narrow for the full list but wide enough to keep a
 * column. Hover, click, Enter or → opens a scope's sections beside the rail.
 */
export function SettingsNavRail({
  sections,
  section,
  linkState,
  scopeLabels,
  badges = {},
  filter = '',
}: SettingsNavigationProps) {
  const [openScope, setOpenScope] = useState<string | null>(null);
  // A flyout opened by hover closes when the pointer leaves it and its icon.
  const hoverTimer = useRef<number | undefined>(undefined);
  const hoverOpened = useRef(false);
  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);
  const hoverOpen = (group: string) => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => {
      hoverOpened.current = true;
      setOpenScope(group);
    }, 120);
  };
  const hoverClose = () => {
    window.clearTimeout(hoverTimer.current);
    if (!hoverOpened.current) return;
    hoverTimer.current = window.setTimeout(() => {
      hoverOpened.current = false;
      setOpenScope(null);
    }, 250);
  };
  const keep = () => window.clearTimeout(hoverTimer.current);
  // Closing hands focus back to the scope's icon without popping its hover name: a name
  // left open is the topmost layer and would take the Esc meant for Settings.
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const pressedOutside = useRef(false);
  const current = hostSection(sections, section);
  const search = filter.trim() ? `?q=${encodeURIComponent(filter.trim())}` : '';
  return (
    <div className="flex flex-col items-center gap-1" role="list">
      {groupedSettingsSections(sections, filter).map(({ group, items }) => {
        const label = scopeLabels[group] ?? group;
        const active = items.some((item) => item.id === current);
        const waiting = items.reduce((sum, item) => sum + (badges[item.id]?.count ?? 0), 0);
        return (
          <div key={group} role="listitem">
            <DropdownMenu
              modal={false}
              open={openScope === group}
              onOpenChange={(open) => {
                window.clearTimeout(hoverTimer.current);
                hoverOpened.current = false;
                setOpenScope(open ? group : null);
              }}
            >
              <DropdownMenuTrigger asChild>
                <IconButton
                  aria-current={active ? 'true' : undefined}
                  // The fill alone is ~1.1:1 against the rail in light; the ink bar carries the selection.
                  className={cn(
                    active &&
                      'bg-menu-highlight text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-foreground',
                  )}
                  count={waiting || undefined}
                  icon={<SettingsScopeIcon className="size-4" group={group} />}
                  label={label}
                  onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
                    if (event.key !== 'ArrowRight') return;
                    event.preventDefault();
                    hoverOpened.current = false;
                    setOpenScope(group);
                  }}
                  onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
                    // A click on a flyout hover opened keeps it open; Radix would toggle it shut.
                    if (openScope !== group || !hoverOpened.current) return;
                    event.preventDefault();
                    hoverOpened.current = false;
                    keep();
                  }}
                  onPointerEnter={() => (openScope === group ? keep() : hoverOpen(group))}
                  onPointerLeave={hoverClose}
                  ref={(node: HTMLButtonElement | null) => {
                    if (node) triggers.current.set(group, node);
                  }}
                  tooltip={openScope !== group}
                  tooltipSide="right"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-[70dvh] w-60 overflow-y-auto"
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  const outside = pressedOutside.current;
                  pressedOutside.current = false;
                  if (!outside) focusQuietly(triggers.current.get(group));
                }}
                onInteractOutside={() => {
                  pressedOutside.current = true;
                }}
                onPointerEnter={keep}
                onPointerLeave={hoverClose}
                side="right"
                sideOffset={6}
              >
                <DropdownMenuLabel className="truncate">{label}</DropdownMenuLabel>
                {items.map(({ id, label: name, icon: Icon }) => (
                  <DropdownMenuItem
                    asChild
                    className="aria-[current=page]:bg-menu-highlight aria-[current=page]:text-foreground"
                    key={id}
                  >
                    <Link
                      aria-current={id === current ? 'page' : undefined}
                      replace
                      state={linkState}
                      to={`/settings/${id}${search}`}
                    >
                      <Icon aria-hidden="true" />
                      <span className="truncate">{name}</span>
                      <NavBadge badge={badges[id]} />
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}
    </div>
  );
}
