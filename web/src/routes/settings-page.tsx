import { ToolsSettingsTabs } from '@/components/clio/settings-tools-tabs';
import { ExtensionLibrary as PluginSettings } from '@/components/clio/extension-library';
import { RelaySettings } from '@/components/clio/relay-settings';
import { AgentSettings } from '@/components/clio/settings-agents';
import { SystemSettings } from '@/components/clio/settings-operations';
import { PermissionsSettings } from '@/components/clio/settings-permissions';
import { ToolsSettings } from '@/components/clio/settings-tools';
import { ScheduleSettings } from '@/components/clio/settings-schedules';
import { SessionDefaultsSettings } from '@/components/clio/settings-session-defaults';
import { ExecutionHistorySettings } from '@/components/clio/settings-runtime-section';
import { FleetSettingsPanel } from '@/components/clio/settings-fleet';
import { UsageSettings } from '@/components/clio/settings-usage';
import { ModelsSettings } from '@/components/clio/settings-models';
import { ProvidersSettings } from '@/components/clio/settings-providers';
import { DataSourceSettings } from '@/components/clio/settings-data-sources';
import { WebSearchSettings } from '@/components/clio/settings-web-search';
import { GeneralSettings } from '@/components/clio/settings-general';
import { AboutSettings } from '@/components/clio/settings-about';
import { PromptsCommandsSettings } from '@/components/clio/settings-prompts';
import { MemorySettings } from '@/components/clio/settings-memory';
import { ConnectionsSettings } from '@/components/clio/settings-connection';
import { AppearanceSettings } from '@/components/clio/settings-appearance';
import { NotificationSettings } from '@/components/clio/settings-notifications';
import { ProfileSettings } from '@/components/clio/settings-profile';
import { FoldersSettings } from '@/components/clio/settings-folders';

export function SettingsSection({
  section,
  sessionId,
  workspaceId,
}: {
  section: string;
  sessionId?: string;
  workspaceId?: string;
}) {
  if (section === 'connections') return <ConnectionsSettings />;
  if (section === 'data-sources') return <DataSourceSettings />;
  if (section === 'web-search') return <WebSearchSettings />;
  if (section === 'session-defaults') return <SessionDefaultsSettings />;
  if (section === 'runtime' || section === 'browser')
    return <ExecutionHistorySettings initialSessionId={sessionId} />;
  if (section === 'models' || section === 'fleet')
    return (
      <div className="flex flex-col">
        <ModelsSettings />
        <div data-settings-anchor="fleet">
          <FleetSettingsPanel />
        </div>
      </div>
    );
  if (section === 'providers') return <ProvidersSettings />;
  if (section === 'usage') return <UsageSettings />;
  if (section === 'agents') return <AgentSettings />;
  if (section === 'plugins')
    return <PluginSettings initialWorkspaceId={workspaceId} initialSessionId={sessionId} />;
  if (section === 'tools' || section === 'relays' || section === 'tool-permissions')
    return (
      <ToolsSettingsTabs
        key={section}
        section={section}
        tools={
          <ToolsSettings
            heading={false}
            initialSessionId={sessionId}
            initialWorkspaceId={workspaceId}
          />
        }
        remote={<RelaySettings />}
      />
    );
  if (section === 'prompts') return <PromptsCommandsSettings initialWorkspaceId={workspaceId} />;
  if (section === 'schedules') return <ScheduleSettings initialSessionId={sessionId} />;
  if (section === 'permissions') return <PermissionsSettings workspaceId={workspaceId} />;
  if (section === 'memory') return <MemorySettings workspaceId={workspaceId} />;
  if (section === 'folders') return <FoldersSettings initialWorkspaceId={workspaceId} />;
  if (section === 'profile') return <ProfileSettings />;
  if (section === 'system') return <SystemSettings />;
  if (section === 'notifications') return <NotificationSettings />;
  if (section === 'general') return <GeneralSettings />;
  if (section === 'about') return <AboutSettings />;
  if (section === 'appearance') return <AppearanceSettings />;
  return <GeneralSettings />;
}

// The Settings window ships in this chunk, so opening Settings is one fetch.
export { SettingsWindow } from './settings-window';
