/**
 * Content frame of the settings shell that renders the active section.
 * Exports {@link SettingsShellContent}.
 */
import { Match, Switch } from 'solid-js';
import type { Client } from '@clio/core';
import { SettingsBackends } from './SettingsBackends.js';
import { SettingsModels } from './SettingsModels.js';
import { AboutSection, NoBackend } from './SettingsAbout.js';
import { AppearanceSection } from './SettingsAppearance.js';
import { DataSection } from './SettingsData.js';
import { SessionDefaultsSection } from './SettingsSessionDefaults.js';
import type { SettingsContext } from './SettingsShell.js';
import type { SettingsSection } from './settingsSections.js';
import {
  AgentsPage,
  BlueprintsPage,
  ExpertPacksPage,
  HooksPage,
  McpPage,
  MemoryPage,
  MetricsPage,
  PoliciesPage,
  PluginsPage,
  PromptsPage,
  ProvidersPage,
  ToolsPage,
  WorkspacesPage,
  DoctorPage,
} from './discovery/index.js';

export interface SettingsShellContentProps {
  section: SettingsSection;
  client: Client | null;
  context?: SettingsContext;
  onAddRemote: () => void;
  onBack: () => void;
}

export function SettingsShellContent(props: SettingsShellContentProps) {
  return (
    <main class="settings-shell__content">
      <Switch>
        <Match when={props.section === 'backends'}>
          <SettingsBackends onAddRemote={props.onAddRemote} onBack={props.onBack} />
        </Match>
        <Match when={props.client && props.section === 'workspaces'}>
          <WorkspacesPage client={props.client!} />
        </Match>
        <Match when={props.client && props.section === 'session-defaults'}>
          <SessionDefaultsSection client={props.client!} context={props.context} />
        </Match>
        <Match when={props.client && props.section === 'models'}>
          <SettingsModels client={props.client!} />
        </Match>
        <Match when={props.client && props.section === 'providers'}>
          <ProvidersPage client={props.client!} />
        </Match>
        <Match when={props.client && props.section === 'agents'}>
          <AgentsPage client={props.client!} />
        </Match>
        <Match when={props.client && props.section === 'tools'}>
          <ToolsPage client={props.client!} />
        </Match>
        <Match when={props.client && props.section === 'prompts'}>
          <PromptsPage client={props.client!} context={props.context} />
        </Match>
        <Match when={props.client && props.section === 'blueprints'}>
          <BlueprintsPage client={props.client!} context={props.context} />
        </Match>
        <Match when={props.client && props.section === 'expert-packs'}>
          <ExpertPacksPage client={props.client!} context={props.context} />
        </Match>
        <Match when={props.client && props.section === 'hooks'}>
          <HooksPage client={props.client!} />
        </Match>
        <Match when={props.client && props.section === 'policies'}>
          <PoliciesPage client={props.client!} />
        </Match>
        <Match when={props.client && props.section === 'mcp'}>
          <McpPage client={props.client!} />
        </Match>
        <Match when={props.client && props.section === 'memory'}>
          <MemoryPage client={props.client!} activeSessionId={props.context?.sessionId} />
        </Match>
        <Match when={props.client && props.section === 'metrics'}>
          <MetricsPage client={props.client!} />
        </Match>
        <Match when={props.client && props.section === 'doctor'}>
          <DoctorPage client={props.client!} />
        </Match>
        <Match when={props.section === 'plugins'}>
          <PluginsPage />
        </Match>
        <Match when={props.section === 'appearance'}>
          <AppearanceSection />
        </Match>
        <Match when={props.section === 'data'}>
          <DataSection />
        </Match>
        <Match when={props.section === 'about'}>
          <AboutSection />
        </Match>
        <Match when={!props.client && props.section !== 'backends'}>
          <NoBackend />
        </Match>
      </Switch>
    </main>
  );
}
