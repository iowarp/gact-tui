import { useState } from 'react';
import type { Client, SessionAgentTask } from '@clio/core';
import { MasterDetail } from '../kit';
import type { RailConnection } from '../shell/Rail';
import type { ApprovalMode } from '../composer/Composer';
import { loadRegistry } from '../connect/registry';
import { AppearancePage } from './AppearancePage';
import { AboutPage } from './AboutPage';
import { BackendsPage, AgentsPage } from './pages/ConnectionPages';
import { RelaysPage } from './pages/RelaysPage';
import { SessionDefaultsPage } from './pages/SessionDefaultsPage';
import { ProvidersPage } from './pages/ProvidersPage';
import { ModelsPage } from './pages/ModelsPage';
import { CommandsPage, McpPage, PromptsPage } from './pages/CatalogPages';
import { BlueprintsPage } from './pages/BlueprintsPage';
import { ExpertPacksPage } from './pages/ExpertPacksPage';
import { HooksPage, MemoryPage } from './pages/TelemetryPages';
import { PoliciesPage } from './pages/PoliciesPage';
import { MetricsPage } from './pages/MetricsPage';
import { DoctorPage } from './pages/DoctorPage';
import { PluginsPage, DataBackupsPage } from './pages/AppPages';
import { SETTINGS_PAGES, GROUP_LABELS, backedPages, type SettingsPage } from './pages';
import './settings.css';

export interface SettingsProps {
  client: Client;
  /** A SETTINGS_PAGES id to land on instead of the first backed page — the
   * rail footer's "relay" cell deep-links straight to 'relays', matching the
   * prototype's own `goSettingsRelays`/`goSettingsAgents` per-cell targets.
   * Ignored (falls back to the first backed page) when the id names a page
   * that is not currently backed/visible. */
  initialSection?: string;
  /** Live connection pool (App's ConnectionPool), for Backends/Agents. */
  connections?: RailConnection[];
  activeConnectionId?: string;
  /** The active session's own composer-pill numbers (real, already computed
   * by SessionView) — Metrics renders them rather than refetching. */
  contextPercent?: number;
  /** Raw token numbers behind contextPercent — Metrics' "82.1k / 200k". */
  contextTokens?: number;
  contextLimit?: number;
  artifactCount?: number;
  /** Real `tool_call` part count from the loaded transcript (SessionView),
   * backing Metrics' "tool calls" row — session-scoped, no extra fetch. */
  toolCallCount?: number;
  /** The pill's raw agent-task rows (real, already fetched) — Metrics'
   * "child tasks" row derives its count + completed/running breakdown from
   * these instead of a route this layer does not have. */
  asyncTasks?: SessionAgentTask[];
  /** The active session's own real approval mode (SessionView's `detail`,
   * the same value the composer's own approval picker reads/writes) —
   * Policies' "default approval mode" row renders and can move it to the
   * safe 'ask' direction via the same PATCH /v1/sessions/{id} the composer
   * uses, instead of the unrelated (and never-matching) /v1/policies
   * document shape the row used to read from. */
  approvalMode?: ApprovalMode;
  onApprovalModeChange?: (mode: ApprovalMode) => void;
  /** The active session's real blueprint id (SessionView's
   * `detail.metadata.active_agent_blueprint_id`) — Agent blueprints' list
   * derives a real "N declared children" count for the ONE row it matches,
   * instead of an N+1 fetch for the whole catalog. */
  activeBlueprintId?: string;
  onOpenObservability?: () => void;
}

/**
 * Settings — a MasterDetail over the backed page inventory.
 *
 * Unbacked pages never reach the nav (see pages.ts). Every backed page here
 * renders its real content: each detail component owns its own GET calls
 * against `client` rather than Settings pre-fetching everything up front.
 */
export function Settings({
  client,
  initialSection,
  connections,
  activeConnectionId,
  contextPercent,
  contextTokens,
  contextLimit,
  artifactCount,
  toolCallCount,
  asyncTasks,
  approvalMode,
  onApprovalModeChange,
  activeBlueprintId,
  onOpenObservability,
}: SettingsProps) {
  const pages = backedPages();
  const requestedPage = initialSection ? pages.find((p) => p.id === initialSection) : undefined;
  const [active, setActive] = useState(requestedPage?.id ?? pages[0]?.id ?? 'backends');
  const page = SETTINGS_PAGES.find((p) => p.id === active);

  return (
    <section className="settings" aria-label="Settings pane">
      {/* The heading and close control are the Layer's — see kit/Layer.tsx. */}
      <div className="settings__body">
        <MasterDetail
          label="Settings"
          activeId={active}
          onSelect={setActive}
          items={pages.map((p) => ({ id: p.id, label: p.label, group: GROUP_LABELS[p.group] }))}
          detail={
            <PageBody
              page={page}
              client={client}
              connections={connections}
              activeConnectionId={activeConnectionId}
              contextPercent={contextPercent}
              contextTokens={contextTokens}
              contextLimit={contextLimit}
              artifactCount={artifactCount}
              toolCallCount={toolCallCount}
              asyncTasks={asyncTasks}
              approvalMode={approvalMode}
              onApprovalModeChange={onApprovalModeChange}
              activeBlueprintId={activeBlueprintId}
              onOpenObservability={onOpenObservability}
            />
          }
        />
      </div>
    </section>
  );
}

function PageBody({
  page,
  client,
  connections,
  activeConnectionId,
  contextPercent,
  contextTokens,
  contextLimit,
  artifactCount,
  toolCallCount,
  asyncTasks,
  approvalMode,
  onApprovalModeChange,
  activeBlueprintId,
  onOpenObservability,
}: {
  page: SettingsPage | undefined;
} & Omit<SettingsProps, 'client'> & { client: Client }) {
  if (!page) return null;

  const body = (() => {
    switch (page.id) {
      case 'backends':
        return (
          <BackendsPage client={client} connections={connections} activeConnectionId={activeConnectionId} />
        );
      case 'agents':
        return <AgentsPage connections={connections} />;
      case 'relays':
        return <RelaysPage client={client} />;
      case 'session-defaults':
        return <SessionDefaultsPage client={client} />;
      case 'providers':
        return <ProvidersPage client={client} />;
      case 'models':
        return <ModelsPage client={client} />;
      case 'commands':
        return <CommandsPage client={client} />;
      case 'prompts':
        return <PromptsPage client={client} />;
      case 'blueprints':
        return <BlueprintsPage client={client} activeBlueprintId={activeBlueprintId} />;
      case 'expert-packs':
        return <ExpertPacksPage client={client} />;
      case 'mcp':
        return <McpPage client={client} />;
      case 'hooks':
        return <HooksPage client={client} />;
      case 'policies':
        return (
          <PoliciesPage
            client={client}
            approvalMode={approvalMode}
            onApprovalModeChange={onApprovalModeChange}
          />
        );
      case 'memory':
        return <MemoryPage client={client} />;
      case 'metrics':
        return (
          <MetricsPage
            contextPercent={contextPercent}
            contextTokens={contextTokens}
            contextLimit={contextLimit}
            artifactCount={artifactCount}
            toolCallCount={toolCallCount}
            asyncTasks={asyncTasks}
            onOpenObservability={onOpenObservability}
          />
        );
      case 'doctor':
        return <DoctorPage client={client} />;
      case 'plugins':
        return <PluginsPage />;
      case 'appearance':
        return <AppearancePage />;
      case 'data':
        return <DataBackupsPage />;
      case 'about': {
        const activeBackend = loadRegistry().backends.find((b) => b.id === activeConnectionId);
        return <AboutPage client={client} {...(activeBackend ? { activeBackend } : {})} />;
      }
      default:
        return (
          <p className="settings__unbuilt" data-testid="settings-unbuilt">
            This page is backed
            {page.method ? (
              <>
                {' '}
                by <code>{page.method}</code>
              </>
            ) : null}{' '}
            but its interface has not been built yet.
          </p>
        );
    }
  })();

  return <div data-testid="settings-page">{body}</div>;
}
