import { useState, type ReactNode } from 'react';
import { PlugZapIcon, ServerIcon } from 'lucide-react';
import { TextTabs } from './primitives/text-tabs';
import { SettingsSectionHeading } from './settings-section-heading';

type ToolsTab = 'servers' | 'remote';

/**
 * Tools and MCP servers: the MCP services page and the Remote tools page
 * (once its own Settings section) share one window page as tabs.
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
  const [tab, setTab] = useState<ToolsTab>(section === 'relays' ? 'remote' : 'servers');
  return (
    <div className="grid gap-5">
      <SettingsSectionHeading
        title="Tools and MCP servers"
        info="MCP services give agents tools, data, and reusable prompts. Built-in services ship with the agent; external services are connections you can manage."
      />
      <TextTabs
        className="border-b border-border"
        controls="settings-tools-panel"
        label="Tools pages"
        onValueChange={setTab}
        tabs={[
          { value: 'servers', label: 'MCP servers', icon: <ServerIcon aria-hidden="true" /> },
          { value: 'remote', label: 'Remote tools', icon: <PlugZapIcon aria-hidden="true" /> },
        ]}
        value={tab}
      />
      <div id="settings-tools-panel" role="tabpanel">
        {tab === 'remote' ? remote : tools}
      </div>
    </div>
  );
}
