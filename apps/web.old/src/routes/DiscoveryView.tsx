/**
 * Backend discovery view: lists discoverable local backends to connect to.
 * Exports {@link DiscoveryView}.
 */
import { Match, Show, Switch } from 'solid-js';
import { Client } from '@clio/core';
import type { RailRoute } from '../components/LeftRail.js';
import {
  AgentsPage,
  DoctorPage,
  McpPage,
  MemoryPage,
  MetricsPage,
  PluginsPage,
  PromptsPage,
  ToolsPage,
  WorkspacesPage,
} from './discovery/index.js';

export function DiscoveryView(props: {
  route: RailRoute;
  client: Client;
  activeSessionId?: string;
  onBackToChat: () => void;
}) {
  return (
    <Show when={props.route !== 'sessions'}>
      <Switch>
        <Match when={props.route === 'workspaces'}>
          <WorkspacesPage client={props.client} />
        </Match>
        <Match when={props.route === 'agents'}>
          <AgentsPage client={props.client} />
        </Match>
        <Match when={props.route === 'tools'}>
          <ToolsPage client={props.client} />
        </Match>
        <Match when={props.route === 'prompts'}>
          <PromptsPage client={props.client} />
        </Match>
        <Match when={props.route === 'mcp'}>
          <McpPage client={props.client} />
        </Match>
        <Match when={props.route === 'memory'}>
          <MemoryPage client={props.client} activeSessionId={props.activeSessionId} />
        </Match>
        <Match when={props.route === 'metrics'}>
          <MetricsPage client={props.client} />
        </Match>
        <Match when={props.route === 'doctor'}>
          <DoctorPage client={props.client} />
        </Match>
        <Match when={props.route === 'plugins'}>
          <PluginsPage />
        </Match>
      </Switch>
    </Show>
  );
}
