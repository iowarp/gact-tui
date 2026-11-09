import { GlobeIcon, ServerIcon, WrenchIcon } from 'lucide-react';
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreIcon } from '@/lib/icon-vocabulary';
import { withoutSearchArrival } from '@/lib/settings-window-route';
import { IconButton } from './primitives/icon-button';
import { SegmentedControl } from './primitives/segmented-control';
import { SettingsSectionHeading } from './settings-section-heading';
import { ToolPermissionsSettings } from './settings-tool-permissions';

type ToolsTab = 'tool-permissions' | 'tools' | 'relays';

const TABS = [
  { value: 'tool-permissions', label: 'Tools', icon: <WrenchIcon /> },
  { value: 'tools', label: 'MCP servers', icon: <ServerIcon /> },
  { value: 'relays', label: 'Remote tools', icon: <GlobeIcon /> },
] as const;

function tabOf(section: string): ToolsTab {
  return section === 'tool-permissions' || section === 'relays' ? section : 'tools';
}

function focusesTab(state: unknown): boolean {
  return Boolean(state && typeof state === 'object' && 'toolsTabFocus' in state);
}

/**
 * Tools and MCP servers: permission and I/O per tool, the MCP services, and
 * the Remote tools page share one window page. Each tab is its own Settings
 * route, so a link, search result, or reload lands on that tab.
 */
export function ToolsSettingsTabs({
  section,
  tools,
  remote,
}: {
  section: string;
  tools: ReactNode;
  remote: ReactNode;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const tab = tabOf(section);
  const switcher = useRef<HTMLDivElement>(null);
  const refocus = focusesTab(location.state);
  // Switching tabs remounts the page; keep focus on the switch that was used.
  useEffect(() => {
    if (!refocus) return;
    const active = [
      ...(switcher.current?.querySelectorAll<HTMLElement>('[data-state="on"]') ?? []),
    ];
    (active.find((element) => element.getClientRects().length > 0) ?? active[0])?.focus();
  }, [refocus]);
  const choose = (next: ToolsTab) => {
    if (next === tab) return;
    const state = withoutSearchArrival(location.state);
    void navigate(
      {
        pathname: location.pathname.replace(/[^/]+$/, next),
        search: location.search,
        hash: location.hash,
      },
      {
        replace: true,
        state: { ...(state && typeof state === 'object' ? state : {}), toolsTabFocus: true },
      },
    );
  };
  return (
    <div className="@container/toolspage grid min-w-0 gap-2" data-settings-anchor={section}>
      <SettingsSectionHeading
        actions={
          <div className="flex min-w-0" ref={switcher}>
            <PageTabs onValueChange={choose} value={tab} />
          </div>
        }
        info="Tools: whether each plugin tool runs, asks first, or is blocked, and whether the agent calls it directly, from a script, or both. MCP servers give agents tools, data, and reusable prompts. Remote tools come from MCP servers reached by URL and run on that machine."
        title="Tools and MCP servers"
      />
      <div aria-label={TABS.find((item) => item.value === tab)?.label} role="region">
        {tab === 'tool-permissions' ? (
          <ToolPermissionsSettings />
        ) : tab === 'relays' ? (
          remote
        ) : (
          tools
        )}
      </div>
    </div>
  );
}

/**
 * The page switch folds with the page's width, as the spec's tab row does:
 * all three pages by icon and name, then the others as icons, then the
 * current page and ⋯ for the others. ← → still
 * move through all three.
 */
function PageTabs({
  value,
  onValueChange,
}: {
  value: ToolsTab;
  onValueChange: (value: ToolsTab) => void;
}) {
  const current = TABS.find((row) => row.value === value) ?? TABS[0];
  const step = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const index = TABS.indexOf(current);
    const next = TABS[(index + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    if (next) onValueChange(next.value);
  };
  return (
    <>
      <div className="hidden min-w-0 @[46.25rem]/toolspage:flex" data-fold="full">
        <SegmentedControl
          label="Tools pages"
          onValueChange={onValueChange}
          options={TABS}
          value={value}
        />
      </div>
      <div
        className="hidden min-w-0 @[35rem]/toolspage:flex @[46.25rem]/toolspage:hidden"
        data-fold="icons"
      >
        <SegmentedControl
          iconOnly="others"
          label="Tools pages"
          onValueChange={onValueChange}
          options={TABS}
          value={value}
        />
      </div>
      <div
        className="flex min-w-0 items-center gap-px @[35rem]/toolspage:hidden"
        data-fold="current"
        onKeyDown={step}
      >
        <SegmentedControl
          label="Tools pages"
          onValueChange={onValueChange}
          options={[current]}
          value={value}
        />
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <IconButton icon={<MoreIcon />} label="Other Tools pages" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-40">
            <DropdownMenuRadioGroup
              onValueChange={(next) => onValueChange(next as ToolsTab)}
              value={value}
            >
              {TABS.map((row) => (
                <DropdownMenuRadioItem key={row.value} value={row.value}>
                  {row.icon}
                  {row.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
