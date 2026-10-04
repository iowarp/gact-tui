import type { ComponentType, SVGProps } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDownIcon, ChevronLeftIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Keep every settings destination reachable without pushing mobile content below the fold. */
export function SettingsNavigation({
  sections,
  section,
  endpoint,
  workspaceRoute,
}: {
  sections: Array<{ id: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }>;
  section: string;
  endpoint: string;
  workspaceRoute: string;
}) {
  const state = { endpoint, from: workspaceRoute };
  const active = sections.find((item) => item.id === section);
  return (
    <>
      <nav aria-label="Settings navigation" className="flex min-w-0 items-center gap-2 md:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link to={workspaceRoute}>
            <ChevronLeftIcon aria-hidden="true" /> Workspace
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="ml-auto min-w-0"
              aria-label="Choose settings section"
            >
              <span className="truncate">{active?.label ?? 'Settings'}</span>
              <ChevronDownIcon aria-hidden="true" className="shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-[70dvh] overflow-y-auto">
            {sections.map(({ id, label, icon: Icon }) => (
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
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
      <nav
        aria-label="Settings sections"
        className="hidden content-start gap-1 md:sticky md:top-8 md:grid"
      >
        <Button asChild className="mb-4 justify-start" variant="ghost">
          <Link to={workspaceRoute}>
            <ChevronLeftIcon aria-hidden="true" /> Workspace
          </Link>
        </Button>
        {sections.map(({ id, label, icon: Icon }) => (
          <Button
            asChild
            className="justify-start"
            key={id}
            variant={id === section ? 'secondary' : 'ghost'}
          >
            <Link
              state={state}
              aria-current={id === section ? 'page' : undefined}
              to={`/settings/${id}`}
            >
              <Icon aria-hidden="true" />
              {label}
            </Link>
          </Button>
        ))}
      </nav>
    </>
  );
}
