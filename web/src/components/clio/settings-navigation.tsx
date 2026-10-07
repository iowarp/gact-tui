import { useState, type ComponentType, type SVGProps } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDownIcon, ChevronLeftIcon, SearchIcon } from 'lucide-react';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export interface SettingsDestination {
  id: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  group?: string;
  keywords?: string;
}

/** Searchable, grouped navigation with independent scrolling and a compact mobile menu. */
export function SettingsNavigation({
  sections,
  section,
  endpoint,
  workspaceRoute,
}: {
  sections: SettingsDestination[];
  section: string;
  endpoint: string;
  workspaceRoute: string;
}) {
  const [query, setQuery] = useState('');
  const state = { endpoint, from: workspaceRoute };
  const active = sections.find((item) => item.id === section);
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const visible = sections.filter((item) =>
    terms.every((term) =>
      `${item.label} ${item.group ?? ''} ${item.keywords ?? ''}`.toLocaleLowerCase().includes(term),
    ),
  );
  const groups = [...new Set(visible.map((item) => item.group ?? 'Settings'))];
  const search = (mobile = false) => (
    <div className="relative">
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute left-2.5 top-2.5 size-3.5 text-muted-foreground"
      />
      <Input
        aria-label={mobile ? 'Search settings sections' : 'Search settings'}
        placeholder="Search settings"
        className="h-9 pl-8 pr-8 text-sm"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={
          mobile
            ? (event) => {
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  const items = event.currentTarget
                    .closest('[role="menu"]')
                    ?.querySelectorAll<HTMLElement>('[role="menuitem"]');
                  const index = event.key === 'ArrowUp' ? (items?.length ?? 0) - 1 : 0;
                  items?.[index]?.focus();
                }
                if (event.key !== 'Escape') event.stopPropagation();
              }
            : undefined
        }
      />
      {query ? (
        <Button
          size="icon-sm"
          variant="ghost"
          className="absolute right-0.5 top-0.5"
          aria-label="Clear settings search"
          onClick={() => setQuery('')}
        >
          <CloseIcon aria-hidden="true" className="size-3.5" />
        </Button>
      ) : null}
    </div>
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
        <DropdownMenu>
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
          <DropdownMenuContent align="end" className="max-h-[70dvh] w-72 overflow-y-auto">
            <div className="p-2">{search(true)}</div>
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
