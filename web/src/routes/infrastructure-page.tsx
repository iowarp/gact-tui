import {
  INFRASTRUCTURE_SECTIONS,
  isInfrastructureSection,
  type InfrastructureSection,
} from '@/lib/application-destinations';
import { queryKeys } from '@/lib/query-keys';
import { INFRASTRUCTURE_POLL_MS, MCP_PREPARING_POLL_MS } from '@/lib/runtime-limits';
import { anyServerPreparing } from '@/lib/mcp-preparation';
import type { EffectiveAgentTool, McpServerDefinition, ToolCatalogItem } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeftIcon, NetworkIcon } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { FrameClioMenu } from '@/components/clio/frame-clio-menu';
import { settingsWindowOpen } from '@/lib/settings-window-route';
import { InfrastructureServicesSection } from '@/components/clio/infrastructure-services-section';
import { InfrastructureInventory } from '@/components/clio/infrastructure-inventory';
import { NamedTooltip } from '@/components/clio/primitives/icon-button';
import { NavTabs } from '@/components/clio/primitives/nav-tabs';
import { navTabsFloorWidth, navTabsMinWidth } from '@/components/clio/primitives/nav-tabs-measure';
import { useInterfaceScale } from '@/theme/runtime';
import { StateView } from '@/components/clio/primitives/state-view';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { Button } from '@/components/ui/button';
import { InfrastructureTools } from '@/components/clio/infrastructure-tools';
import { InfraTabActionsProvider } from '@/components/clio/infrastructure-tab-actions';
import { AgentUnansweredProvider } from '@/components/clio/infrastructure-reachability';
import { agentIdentity } from '@/components/clio/connection-names';
import { noAnswer } from '@/lib/connection-attempt';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { vocab } from '@/lib/brand-vocabulary';
import { cn } from '@/lib/utils';
import {
  returnRouteFromState,
  sessionIdFromRoute,
  workspaceIdFromRoute,
} from '@/lib/workspace-route-memory';
import { InfrastructureAgentHosts } from '@/components/clio/infrastructure-agent-hosts';
import { ph, t } from '@lingui/core/macro';

const { workspace } = vocab;

/**
 * Narrow (under 600px), a section with more than one tab action (the host and the
 * section's main verb, a search and its filter) gives them their own row under the
 * tabs, so they stay reachable instead of running off the edge. A lone action
 * (refresh) stays beside the tabs while the open tab's name can wrap between its
 * words there. A main verb that folds into ⋯ (Services, Models) keeps the host
 * beside the tabs while the open tab's whole name fits. Otherwise the row is marked
 * crowded and the actions move to the second row too. A name that still does not
 * fit wraps, whole, between words.
 */
const TAB_ROW =
  'mx-auto grid min-h-11 max-w-[840px] min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 px-2 whitespace-nowrap sm:px-3 data-crowded:h-auto data-crowded:grid-cols-[auto_minmax(0,1fr)] data-crowded:grid-rows-[minmax(2.75rem,auto)_auto] @max-[600px]/infra-page:has-[>[data-slot=infrastructure-tab-actions]>[data-tab-fold]]:gap-x-1.5 @max-[600px]/infra-page:has-[>[data-slot=infrastructure-tab-actions]>:nth-child(2)]:h-auto @max-[600px]/infra-page:has-[>[data-slot=infrastructure-tab-actions]>:nth-child(2)]:grid-cols-[auto_minmax(0,1fr)] @max-[600px]/infra-page:has-[>[data-slot=infrastructure-tab-actions]>:nth-child(2)]:grid-rows-[minmax(2.75rem,auto)_auto]';
const TAB_ACTIONS =
  'flex min-w-0 items-center justify-end gap-1.5 @max-[600px]/infra-page:has-[>:nth-child(2)]:col-span-2 @max-[600px]/infra-page:has-[>:nth-child(2)]:-mx-2 @max-[600px]/infra-page:has-[>:nth-child(2)]:h-10 @max-[600px]/infra-page:has-[>:nth-child(2)]:border-t @max-[600px]/infra-page:has-[>:nth-child(2)]:border-border @max-[600px]/infra-page:has-[>:nth-child(2)]:px-2 @max-[600px]/infra-page:has-[>:nth-child(2)]:sm:-mx-3 @max-[600px]/infra-page:has-[>:nth-child(2)]:sm:px-3 in-data-crowded:col-span-2 in-data-crowded:-mx-2 in-data-crowded:h-10 in-data-crowded:border-t in-data-crowded:border-border in-data-crowded:px-2 in-data-crowded:sm:-mx-3 in-data-crowded:sm:px-3';

/** Set by Alt ←/→ so the next section focuses its tab; it outlives a remount of the page. */
let sectionMovedByKey = false;

export function InfrastructurePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement>(null);
  const { section } = useParams();
  const currentSection: InfrastructureSection = isInfrastructureSection(section)
    ? section
    : 'overview';
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const workspaceRoute = returnRouteFromState(location.state, settings.endpoint);
  const workspaceId = workspaceIdFromRoute(workspaceRoute);
  const sessionId = sessionIdFromRoute(workspaceRoute);
  const [toolScope, setToolScope] = useState<'session' | 'agent'>('session');
  const sessionToolScope = Boolean(sessionId) && toolScope === 'session';
  const health = useQuery({
    enabled: currentSection === 'agent',
    queryKey: queryKeys.key('service-health', settings.endpoint),
    queryFn: ({ signal }) => repository.serviceHealth(signal),
    refetchInterval: INFRASTRUCTURE_POLL_MS,
  });
  const servers = useQuery({
    enabled:
      currentSection === 'tools' || currentSection === 'services' || currentSection === 'overview',
    queryKey: queryKeys.key(
      'mcp-servers',
      settings.endpoint,
      workspaceId || 'infrastructure',
      sessionId || 'service',
    ),
    queryFn: ({ signal }) => repository.mcpServers(workspaceId, signal, { sessionId }),
    refetchInterval: (query) =>
      anyServerPreparing(query.state.data) ? MCP_PREPARING_POLL_MS : INFRASTRUCTURE_POLL_MS,
  });
  const tools = useQuery({
    enabled: currentSection === 'tools',
    queryKey: queryKeys.key('tools', settings.endpoint, 'complete-catalog'),
    queryFn: async ({ signal }) => {
      const [builtins, live] = await Promise.all([
        repository.catalogTools(signal),
        repository.tools(signal),
      ]);
      return mergeToolCatalogs(builtins, live);
    },
    refetchInterval: INFRASTRUCTURE_POLL_MS,
  });
  const effectiveToolset = useQuery({
    enabled: currentSection === 'tools' && sessionToolScope,
    queryKey: queryKeys.key('session-toolset', settings.endpoint, sessionId),
    queryFn: async ({ signal }) =>
      sessionId ? ((await repository.effectiveAgentToolset(sessionId, signal)) ?? null) : null,
    refetchInterval: INFRASTRUCTURE_POLL_MS,
  });
  const error =
    currentSection === 'agent'
      ? health.error
      : currentSection === 'tools'
        ? ((sessionToolScope ? effectiveToolset.error : undefined) ?? tools.error ?? servers.error)
        : servers.error;
  const agentUnanswered = noAnswer(error);
  const retrySection = () => {
    for (const query of [health, servers, tools, effectiveToolset]) {
      if (query.error) void query.refetch();
    }
  };
  const displayedTools = sessionToolScope
    ? effectiveToolset.data
      ? effectiveToolCatalog(effectiveToolset.data.tools, tools.data ?? [], servers.data ?? [])
      : []
    : (tools.data ?? []);
  const toolsPending =
    tools.isPending || servers.isPending || (sessionToolScope && effectiveToolset.isPending);

  const sectionDefinition = INFRASTRUCTURE_SECTIONS.find((item) => item.id === currentSection)!;
  const sectionTabs = INFRASTRUCTURE_SECTIONS.map(({ id, icon, label }) => ({
    id,
    icon,
    label,
    to: `/infrastructure/${id}`,
    state: location.state,
  }));
  const moveSection = (step: number) => {
    const index = INFRASTRUCTURE_SECTIONS.findIndex((item) => item.id === currentSection);
    const count = INFRASTRUCTURE_SECTIONS.length;
    const next = INFRASTRUCTURE_SECTIONS[(index + step + count) % count]!;
    sectionMovedByKey = true;
    navigate(`/infrastructure/${next.id}`, { state: location.state });
  };
  // A tab change replaces the focused content, so the key hands focus to the new tab and keeps working.
  useEffect(() => {
    if (!sectionMovedByKey) return;
    sectionMovedByKey = false;
    mainRef.current?.querySelector<HTMLElement>('[aria-current=page]')?.focus();
  }, [currentSection]);
  const tabKeyRegion = useMemo<RefObject<Element | null>>(
    () => ({
      get current() {
        const active = document.activeElement;
        return !active || active === document.body ? document.body : mainRef.current;
      },
    }),
    [],
  );
  useShortcut('previous-tab', () => moveSection(-1), { region: tabKeyRegion });
  useShortcut('next-tab', () => moveSection(1), { region: tabKeyRegion });
  const [tabActions, setTabActions] = useState<HTMLElement | null>(null);
  const [tabRow, setTabRow] = useState<HTMLDivElement | null>(null);
  const scaleKey = useInterfaceScale();
  // Natural widths only, so moving the actions down never changes the answer.
  useLayoutEffect(() => {
    const nav = tabRow?.querySelector<HTMLElement>('[data-slot=nav-tabs]');
    const back = tabRow?.firstElementChild;
    if (!tabRow || !nav || !tabActions || !back) return;
    const measure = () => {
      const row = getComputedStyle(tabRow);
      const inner = tabRow.clientWidth - parseFloat(row.paddingLeft) - parseFloat(row.paddingRight);
      const gap = parseFloat(row.columnGap) || 0;
      const items = [...tabActions.children].filter((item) => item.getClientRects().length);
      const actions =
        items.reduce(
          (sum, item) => sum + Math.max(item.scrollWidth, item.getBoundingClientRect().width),
          0,
        ) +
        (parseFloat(getComputedStyle(tabActions).columnGap) || 0) * Math.max(0, items.length - 1);
      const button = back.getBoundingClientRect().width;
      const beside = button + actions + 2 * gap;
      // A host picker moves down before the name wraps; any action, even a lone icon,
      // moves down before the name would wrap past its longest word.
      tabRow.toggleAttribute(
        'data-crowded',
        (actions > 2 * button && beside + navTabsMinWidth(nav) > inner) ||
          beside + navTabsFloorWidth(nav) > inner,
      );
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(tabRow);
    resize.observe(tabActions);
    const mutation = new MutationObserver(measure);
    mutation.observe(tabRow, { childList: true, subtree: true, characterData: true });
    return () => {
      resize.disconnect();
      mutation.disconnect();
    };
  }, [tabRow, tabActions, scaleKey]);
  return (
    <main
      className="clio-scrollbar @container/infra-page h-full min-h-0 overflow-y-auto bg-background"
      ref={mainRef}
      tabIndex={-1}
    >
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
        <FrameClioMenu className="bottom-0 left-2 sm:left-3" covered={settingsWindowOpen} />
        <div className={TAB_ROW} ref={setTabRow}>
          <NamedTooltip label={t`Back to ${workspace}`}>
            <Button asChild className="text-muted-foreground" size="icon-sm" variant="ghost">
              <Link aria-label={t`Back to ${workspace}`} to={workspaceRoute}>
                <ChevronLeftIcon aria-hidden="true" />
              </Link>
            </Button>
          </NamedTooltip>
          <h1 className="sr-only">{t`Infrastructure: ${ph({ label: sectionDefinition.label })}`}</h1>
          <NavTabs active={currentSection} label={t`Infrastructure sections`} tabs={sectionTabs} />
          <span
            className={TAB_ACTIONS}
            data-slot="infrastructure-tab-actions"
            ref={setTabActions}
          />
        </div>
      </div>
      <InfraTabActionsProvider value={tabActions}>
        <AgentUnansweredProvider value={agentUnanswered}>
          <div className="mx-auto max-w-[840px] px-2 sm:px-3">
            <section
              aria-label={sectionDefinition.label}
              className={cn('min-w-0 pt-1.5', currentSection === 'overview' ? 'pb-3' : 'pb-12')}
            >
              {error ? (
                <StateView
                  className="mt-6 rounded-md border"
                  kind="error"
                  size="row"
                  icon={NetworkIcon}
                  title={
                    agentUnanswered
                      ? t`Can't reach ${ph({ name: agentIdentity(settings.endpoint, settings.label, settings.location).name })}`
                      : t`This section could not load completely`
                  }
                  detail={error.message}
                  action={{ label: t`Retry`, onClick: retrySection }}
                />
              ) : null}

              {currentSection === 'overview' ||
              currentSection === 'models' ||
              currentSection === 'activity' ? (
                <InfrastructureInventory section={currentSection} />
              ) : null}

              {currentSection === 'tools' ? (
                <InfrastructureTools
                  sessionId={sessionId}
                  sessionScoped={sessionToolScope}
                  pending={toolsPending}
                  tools={displayedTools}
                  servers={servers.data ?? []}
                  onScope={setToolScope}
                />
              ) : null}

              {currentSection === 'services' ? <InfrastructureServicesSection /> : null}

              {currentSection === 'agent' ? <InfrastructureAgentHosts health={health} /> : null}
            </section>
          </div>
        </AgentUnansweredProvider>
      </InfraTabActionsProvider>
    </main>
  );
}

function mergeToolCatalogs(
  builtins: ToolCatalogItem[],
  live: ToolCatalogItem[],
): ToolCatalogItem[] {
  const merged = new Map<string, ToolCatalogItem>();
  for (const tool of builtins) merged.set(tool.name, tool);
  for (const tool of live) {
    const baseline = merged.get(tool.name);
    merged.set(tool.name, baseline ? { ...baseline, ...tool } : tool);
  }
  return [...merged.values()];
}

/**
 * Project the global catalog onto the toolset the selected session actually received.
 *
 * The effective-toolset trace is authoritative for availability. Catalog rows only
 * enrich those recorded tools with contracts and labels; they must never make a tool
 * appear available to a session that did not mount it.
 */
function effectiveToolCatalog(
  effectiveTools: readonly EffectiveAgentTool[],
  catalog: readonly ToolCatalogItem[],
  servers: readonly McpServerDefinition[],
): ToolCatalogItem[] {
  const catalogByName = new Map(catalog.map((tool) => [tool.name, tool]));
  const serverBySource = new Map<string, McpServerDefinition>();
  for (const server of servers) {
    serverBySource.set(server.id.toLocaleLowerCase(), server);
    serverBySource.set(server.name.toLocaleLowerCase(), server);
  }

  const projected = new Map<string, ToolCatalogItem>();
  for (const effective of effectiveTools) {
    const baseline = catalogByName.get(effective.name);
    const server = serverBySource.get(effective.source.toLocaleLowerCase());
    projected.set(effective.name, {
      id: baseline?.id ?? effective.name,
      name: effective.name,
      title: effective.title || baseline?.title,
      description: baseline?.description,
      server_id: server?.id ?? baseline?.server_id,
      source: effective.source || baseline?.source,
      status: baseline?.status ?? 'available',
      enabled: true,
      owner: baseline?.owner,
      tags: baseline?.tags ?? [],
      visible_to: baseline?.visible_to ?? [],
      input_schema: baseline?.input_schema ?? {},
      output_schema: baseline?.output_schema ?? {},
      domain: baseline?.domain,
    });
  }
  return [...projected.values()];
}
