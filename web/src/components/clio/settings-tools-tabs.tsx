import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { withoutSearchArrival } from '@/lib/settings-window-route';
import { SegmentedControl } from './primitives/segmented-control';
import { SettingsSectionHeading } from './settings-section-heading';
import { ToolPermissionsSettings } from './settings-tool-permissions';

type ToolsTab = 'tool-permissions' | 'tools' | 'relays';

const TABS = [
  { value: 'tool-permissions', label: 'Tools' },
  { value: 'tools', label: 'MCP servers' },
  { value: 'relays', label: 'Remote tools' },
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
    if (refocus) switcher.current?.querySelector<HTMLElement>('[data-state="on"]')?.focus();
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
    <div className="grid min-w-0 gap-2" data-settings-anchor={section}>
      <SettingsSectionHeading
        actions={
          <div ref={switcher}>
            <SegmentedControl
              label="Tools pages"
              onValueChange={choose}
              options={TABS}
              value={tab}
            />
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
