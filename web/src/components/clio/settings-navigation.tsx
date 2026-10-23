import { useRef, useState } from 'react';
import type { ApplicationDestination } from '@/lib/application-destinations';
import { Link } from 'react-router-dom';
import { ChevronDownIcon, ChevronLeftIcon, SearchIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type SettingsDestination = ApplicationDestination;

/** Searchable, grouped navigation with independent scrolling and a compact mobile menu. */
export function SettingsNavigation({
  sections,
  section,
  endpoint,
  workspaceRoute,
  badges = {},
}: {
  sections: SettingsDestination[];
  section: string;
  endpoint: string;
  workspaceRoute: string;
  /** Items waiting on a section (e.g. memory changes to review), shown as a count. */
  badges?: Record<string, { count: number; label: string }>;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const openingSearch = useRef(false);
  const state = { endpoint, from: workspaceRoute };
  const active = sections.find((item) => item.id === section);
  const visible = sections;
  const groups = [...new Set(visible.map((item) => item.group ?? 'Settings'))];
  const search = (mobile = false) => (
    <Button
      type="button"
      variant="outline"
      className="h-9 w-full justify-start gap-2 text-xs font-normal text-muted-foreground"
      aria-label={mobile ? 'Search everywhere from settings menu' : 'Search everywhere'}
      onClick={() => {
        if (mobile) {
          openingSearch.current = true;
          setMobileOpen(false);
        } else {
          window.dispatchEvent(new Event('clio:open-command-menu'));
        }
      }}
    >
      <SearchIcon aria-hidden="true" className="size-3.5" />
      <span>Search everywhere</span>
      <kbd className="ml-auto text-[10px]">Ctrl K</kbd>
    </Button>
  );

  return (
    <aside className="shrink-0 border-b border-border/60 md:flex md:w-60 md:min-h-0 md:flex-col md:border-b-0 md:border-r">
      <nav
        aria-label="Settings navigation"
        className="flex min-w-0 items-center gap-2 p-3 md:hidden"
      >
        <Button asChild variant="ghost" size="sm">
          <Link to={workspaceRoute}>
            <ChevronLeftIcon aria-hidden="true" /> Workspace
          </Link>
        </Button>
        <DropdownMenu open={mobileOpen} onOpenChange={setMobileOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="ml-auto min-w-0 shrink"
              aria-label="Choose settings section"
            >
              <span className="truncate">{active?.label ?? 'Settings'}</span>
              <ChevronDownIcon aria-hidden="true" className="shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            onCloseAutoFocus={(event) => {
              if (openingSearch.current) {
                event.preventDefault();
                openingSearch.current = false;
                // Radix removes the old focus scope after this callback returns.
                queueMicrotask(() => window.dispatchEvent(new Event('clio:open-command-menu')));
              }
            }}
            align="end"
            className="max-h-[70dvh] w-72 overflow-y-auto"
          >
            <div className="p-2">
              <DropdownMenuItem asChild>{search(true)}</DropdownMenuItem>
            </div>
            {groups.map((group) => (
              <div key={group}>
                <DropdownMenuLabel>{group}</DropdownMenuLabel>
                {visible
                  .filter((item) => (item.group ?? 'Settings') === group)
                  .map(({ id, label, icon: Icon }) => (
                    <DropdownMenuItem asChild key={id}>
                      <Link
                        aria-current={id === section ? 'page' : undefined}
                        to={`/settings/${id}`}
                        state={state}
                      >
                        <Icon aria-hidden="true" />
                        {label}
                        <NavBadge badge={badges[id]} />
                      </Link>
                    </DropdownMenuItem>
                  ))}
              </div>
            ))}
            {!visible.length ? (
              <p role="status" className="p-3 text-sm text-muted-foreground">
                No matching settings.
              </p>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
      <div className="hidden shrink-0 space-y-3 px-4 pb-3 pt-5 md:block">
        <div className="flex items-center justify-between">
          <p className="text-base font-semibold">Settings</p>
          <Button asChild variant="ghost" size="icon-sm">
            <Link to={workspaceRoute} aria-label="Back to workspace" title="Back to workspace">
              <ChevronLeftIcon aria-hidden="true" />
            </Link>
          </Button>
        </div>
        {search()}
      </div>
      <nav
        aria-label="Settings sections"
        className="clio-scrollbar hidden min-h-0 overflow-y-auto px-3 pb-5 md:block"
      >
        {groups.map((group) => (
          <section key={group} aria-label={group} className="mt-3 space-y-0.5">
            <h2 className="px-2 pb-1 text-xs font-medium text-muted-foreground">{group}</h2>
            {visible
              .filter((item) => (item.group ?? 'Settings') === group)
              .map(({ id, label, icon: Icon }) => (
                <Button
                  asChild
                  className="h-8 w-full justify-start gap-2 rounded-md px-2 text-[0.8125rem] font-normal"
                  key={id}
                  variant={id === section ? 'secondary' : 'ghost'}
                >
                  <Link
                    state={state}
                    aria-current={id === section ? 'page' : undefined}
                    to={`/settings/${id}`}
                  >
                    <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                    <span className="truncate">{label}</span>
                    <NavBadge badge={badges[id]} />
                  </Link>
                </Button>
              ))}
          </section>
        ))}
        {!visible.length ? (
          <p role="status" className="px-2 py-4 text-sm text-muted-foreground">
            No matching settings.
          </p>
        ) : null}
      </nav>
    </aside>
  );
}

function NavBadge({ badge }: { badge?: { count: number; label: string } }) {
  if (!badge?.count) return null;
  return (
    <Badge aria-label={badge.label} className="ml-auto h-5 min-w-5 px-1.5 tabular-nums">
      {badge.count}
    </Badge>
  );
}
