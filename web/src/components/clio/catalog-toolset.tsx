import { SchemaSection } from './tool-schema-section';
import type { McpServerDefinition, ToolCatalogItem } from '@clio/core/v3';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ListFilterIcon,
  SearchIcon,
  WrenchIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { PROTOCOL, capitalize, vocab } from '@/lib/brand-vocabulary';
import { toolDomainLabel } from '@/lib/tool-domain-labels';
import { TechnicalDetails } from '@/components/clio/technical-details';

interface ToolDomain {
  id: string;
  title: string;
  description?: string;
  server?: McpServerDefinition;
  tools: ToolCatalogItem[];
}

interface ToolBundle {
  id: string;
  title: string;
  description: string;
  domains: ToolDomain[];
}

/** Unified, inspectable catalog for CLIO-owned tools and installed MCPs. */
export function CatalogToolset({
  servers = [],
  tools,
}: {
  servers?: McpServerDefinition[];
  tools: ToolCatalogItem[];
}) {
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<'all' | 'builtin' | 'mcp'>('all');
  const [browserOpen, setBrowserOpen] = useState(false);
  const bundles = useMemo(() => toolBundles(tools, servers, query), [query, servers, tools]);
  const [selectedKey, setSelectedKey] = useState('');
  const visibleTools = bundles
    .filter((bundle) => catalog === 'all' || bundle.id === catalog)
    .flatMap((bundle) => bundle.domains.flatMap((domain) => domain.tools));
  const selected = visibleTools.find((tool) => toolKey(tool) === selectedKey) ?? visibleTools[0];
  const selectTool = (tool: ToolCatalogItem) => {
    setSelectedKey(toolKey(tool));
    setBrowserOpen(false);
  };

  if (!tools.length) {
    return <p className="py-10 text-sm text-muted-foreground">No tools were reported.</p>;
  }

  return (
    <div className="grid min-w-0 gap-4" data-slot="tool-catalog">
      <div className="flex flex-wrap items-center gap-3 lg:hidden">
        <Button onClick={() => setBrowserOpen(true)}>
          <ListFilterIcon aria-hidden="true" /> View tool list
        </Button>
        <p className="text-sm text-muted-foreground">
          Choose from {tools.length} available tool{tools.length === 1 ? '' : 's'}.
        </p>
      </div>
      <div className="lg:grid lg:grid-cols-[minmax(14rem,17rem)_minmax(0,1fr)] lg:gap-8">
        <aside className="hidden min-h-0 min-w-0 self-start overflow-hidden lg:sticky lg:top-0 lg:flex lg:max-h-[calc(100dvh-4rem)]">
          <ToolBrowser
            bundles={bundles}
            catalog={catalog}
            onCatalog={setCatalog}
            onQuery={setQuery}
            onSelect={selectTool}
            query={query}
            selected={selected}
          />
        </aside>
        <div className="min-h-0 min-w-0">
          {selected ? (
            <ToolContract key={toolKey(selected)} tool={selected} />
          ) : (
            <p className="p-8 text-sm text-muted-foreground">No tools match “{query}”.</p>
          )}
        </div>
      </div>
      <Sheet onOpenChange={setBrowserOpen} open={browserOpen}>
        <SheetContent className="w-[min(92vw,25rem)] gap-0 p-0 sm:max-w-md" side="left">
          <SheetHeader className="border-b pr-12">
            <SheetTitle>Browse tools</SheetTitle>
            <SheetDescription>Choose a built-in capability or an MCP tool.</SheetDescription>
          </SheetHeader>
          <ToolBrowser
            bundles={bundles}
            catalog={catalog}
            onCatalog={setCatalog}
            onQuery={setQuery}
            onSelect={selectTool}
            query={query}
            selected={selected}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ToolBrowser({
  bundles,
  catalog,
  onCatalog,
  onQuery,
  onSelect,
  query,
  selected,
}: {
  bundles: ToolBundle[];
  catalog: 'all' | 'builtin' | 'mcp';
  onCatalog: (catalog: 'all' | 'builtin' | 'mcp') => void;
  onQuery: (query: string) => void;
  onSelect: (tool: ToolCatalogItem) => void;
  query: string;
  selected?: ToolCatalogItem;
}) {
  const counts = Object.fromEntries(
    bundles.map((bundle) => [
      bundle.id,
      bundle.domains.reduce((count, domain) => count + domain.tools.length, 0),
    ]),
  );
  const domains = bundles
    .filter((bundle) => catalog === 'all' || bundle.id === catalog)
    .flatMap((bundle) => bundle.domains);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="grid gap-3 p-1 pb-4">
        <label className="relative block">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search tools"
            className="pl-9"
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search tools"
            value={query}
          />
        </label>
        <div
          aria-label="Tool source"
          role="group"
          className="grid grid-cols-3 items-stretch gap-0.5 rounded-lg border p-0.5"
        >
          <SourceButton
            active={catalog === 'all'}
            count={(counts.builtin ?? 0) + (counts.mcp ?? 0)}
            label="All"
            onClick={() => onCatalog('all')}
          />
          <SourceButton
            active={catalog === 'builtin'}
            count={counts.builtin ?? 0}
            label="Built-in"
            onClick={() => onCatalog('builtin')}
          />
          <SourceButton
            active={catalog === 'mcp'}
            count={counts.mcp ?? 0}
            label="MCP"
            onClick={() => onCatalog('mcp')}
          />
        </div>
      </div>
      <div className="clio-scrollbar grid min-h-0 flex-1 grid-cols-1 content-start gap-2 overflow-y-auto px-1 pb-2">
        {domains.map((domain, index) => (
          <ToolDomainGroup
            defaultOpen={Boolean(query) || index === 0 || domain.tools.includes(selected!)}
            domain={domain}
            key={`${catalog}:${domain.id}:${Boolean(query)}`}
            onSelect={onSelect}
            selected={selected}
          />
        ))}
        {!domains.length ? (
          <div className="p-5 text-sm text-muted-foreground">
            <p>No tools match “{query}”.</p>
            <Button
              className="mt-2"
              size="sm"
              variant="ghost"
              onClick={() => {
                onQuery('');
                onCatalog('all');
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SourceButton({
  active,
  count,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`inline-flex min-w-0 items-baseline justify-center gap-1.5 whitespace-nowrap rounded-md px-1.5 py-2 text-sm leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active
          ? 'bg-accent font-medium text-accent-foreground'
          : 'text-muted-foreground hover:text-foreground'
      }`}
      onClick={onClick}
      type="button"
    >
      <span>{label}</span> <span className="font-normal tabular-nums">{count}</span>
    </button>
  );
}

function ToolDomainGroup({
  defaultOpen,
  domain,
  onSelect,
  selected,
}: {
  defaultOpen: boolean;
  domain: ToolDomain;
  onSelect: (tool: ToolCatalogItem) => void;
  selected?: ToolCatalogItem;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className="group min-w-0"
      onToggle={(event) => setOpen(event.currentTarget.open)}
      open={open}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
        <ChevronDownIcon
          aria-hidden="true"
          className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180"
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-muted-foreground">
          {domain.title}
        </span>
        {domain.server ? <McpOriginBadge server={domain.server} /> : null}
        <span className="text-xs tabular-nums text-muted-foreground">{domain.tools.length}</span>
      </summary>
      {domain.server ? <McpProvenance server={domain.server} /> : null}
      <div className="grid gap-0.5 pb-1">
        {domain.tools.map((tool) => {
          const current = selected && toolKey(selected) === toolKey(tool);
          return (
            <button
              aria-current={current ? 'true' : undefined}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
                current ? 'bg-accent text-accent-foreground' : 'hover:bg-muted/50'
              }`}
              key={toolKey(tool)}
              onClick={() => onSelect(tool)}
              type="button"
            >
              <WrenchIcon
                aria-hidden="true"
                className={`size-3.5 shrink-0 ${current ? 'text-primary' : 'text-muted-foreground'}`}
              />
              <span className="min-w-0 flex-1 truncate">
                {tool.title?.trim() || humanize(tool.name)}
              </span>
              <ChevronRightIcon
                aria-hidden="true"
                className="size-3.5 shrink-0 text-muted-foreground"
              />
            </button>
          );
        })}
      </div>
    </details>
  );
}

function McpOriginBadge({ server }: { server: McpServerDefinition }) {
  const label =
    server.plugin || server.session_id
      ? 'Session'
      : isBuiltinMcp(server)
        ? 'Built in'
        : 'Connected';
  return <Badge variant="outline">{label}</Badge>;
}

function McpProvenance({ server }: { server: McpServerDefinition }) {
  if (server.plugin) {
    return (
      <p className="px-8 pb-2 text-xs text-muted-foreground">
        From the{' '}
        <Link className="font-medium text-primary hover:underline" to="/settings/plugins">
          {server.plugin}
        </Link>{' '}
        plugin{server.session_id ? ' of this conversation’s agent' : ''}.
      </p>
    );
  }
  return domainDescription(server) ? (
    <p className="px-8 pb-2 text-xs text-muted-foreground">{domainDescription(server)}</p>
  ) : null;
}

function ToolContract({ tool }: { tool: ToolCatalogItem }) {
  const title = tool.title?.trim() || humanize(tool.name);
  const [expanded, setExpanded] = useState(false);
  const description = tool.description?.trim() || 'This provider did not supply a description.';
  return (
    <article className="grid min-w-0 content-start gap-7 py-1">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
          <code className="mt-1 block break-all text-xs text-muted-foreground">{tool.name}</code>
        </div>
        <span className="text-sm text-muted-foreground">{toolDomainTitle(tool)}</span>
      </div>

      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">Description</h3>
        <p
          className={`whitespace-pre-wrap text-sm leading-6 ${description.length > 420 && !expanded ? 'line-clamp-4' : ''}`}
        >
          {description}
        </p>
        {description.length > 420 ? (
          <Button
            className="h-auto justify-self-start px-0 py-1"
            size="sm"
            variant="ghost"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Show less' : 'Read full description'}
          </Button>
        ) : null}
      </section>

      <SchemaSection
        empty="This tool accepts no declared inputs."
        schema={tool.input_schema}
        title="Inputs"
      />
      <SchemaSection
        empty="This provider did not declare the tool’s return schema."
        schema={tool.output_schema}
        title="Returns"
      />

      <TechnicalDetails
        className="text-sm"
        summaryClassName="font-medium"
        title="Provider metadata and raw schemas"
      >
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <Metadata label="Source" value={tool.source || 'Not reported'} />
          <Metadata label="MCP or domain" value={tool.server_id || vocab.agent} />
          <Metadata label="Owner" value={tool.owner || 'Not reported'} />
          <Metadata label="Visible to" value={tool.visible_to.join(', ') || 'Not restricted'} />
        </dl>
        <pre className="clio-scrollbar mt-4 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-[11px] leading-5">
          {JSON.stringify(
            { input_schema: tool.input_schema, output_schema: tool.output_schema },
            null,
            2,
          )}
        </pre>
      </TechnicalDetails>
    </article>
  );
}

function Metadata({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-foreground">{value}</dd>
    </div>
  );
}

function toolBundles(
  tools: ToolCatalogItem[],
  servers: McpServerDefinition[],
  query: string,
): ToolBundle[] {
  const needle = query.trim().toLocaleLowerCase();
  const filtered = needle
    ? tools.filter((tool) =>
        [tool.name, tool.title, tool.description, tool.server_id]
          .filter(Boolean)
          .some((value) => String(value).toLocaleLowerCase().includes(needle)),
      )
    : tools;
  const serverMap = new Map(servers.map((server) => [server.id, server]));
  const clio = new Map<string, ToolCatalogItem[]>();
  const mcps = new Map<string, ToolCatalogItem[]>();

  for (const tool of filtered) {
    if (!tool.server_id) {
      const domain = clioDomain(tool);
      clio.set(domain, [...(clio.get(domain) ?? []), tool]);
    } else {
      const domain = tool.server_id || tool.source || 'connected-mcp';
      mcps.set(domain, [...(mcps.get(domain) ?? []), tool]);
    }
  }

  const bundles: ToolBundle[] = [];
  if (clio.size) {
    bundles.push({
      id: 'builtin',
      title: 'Built-in',
      description: `Capabilities included with ${vocab.agent}.`,
      domains: [...clio.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([title, domainTools]) => ({
          id: `clio:${title}`,
          title,
          tools: domainTools.sort(toolTitleSort),
        })),
    });
  }
  if (mcps.size) {
    bundles.push({
      id: 'mcp',
      title: 'Installed MCPs',
      description: 'Tools advertised by connected MCP services.',
      domains: [...mcps.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, domainTools]) => {
          const server = serverMap.get(id);
          return {
            id: `mcp:${id}`,
            title: serverTitle(server, id),
            description: serverDescription(server),
            server,
            tools: domainTools.sort(toolTitleSort),
          };
        }),
    });
  }
  return bundles;
}

function clioDomain(tool: ToolCatalogItem): string {
  // The server's own declared domain (#1350) always wins; the name regex
  // below is the fallback for a tool that declared none.
  return (
    toolDomainLabel(tool.domain) ||
    clioDomainForName(tool.name) ||
    humanize(tool.server_id?.replace(/^mcp_/u, '') || 'Other')
  );
}

function clioDomainForName(name: string): string | undefined {
  const groups: Array<[RegExp, string]> = [
    [/^(fs_|shell_)/u, capitalize(vocab.workspace)],
    [/^(workspace_resource_|resource_)/u, 'Resources'],
    [/^memory_/u, 'Memory'],
    [/^(spawn_|observe_|wait_agent|get_agent|send_message|message_agent|loop_wakeup)/u, 'Agents'],
    [/^(create_artifact|update_artifact|artifact_)/u, 'Artifacts'],
    [
      /^(create_plan|update_plan|plan_|create_todo|update_todo|write_todos|create_goal|update_goal|goal_|schedule_|cron_)/u,
      'Planning',
    ],
    [/^(create_a2ui|update_a2ui|a2ui_|raise_alert_card)/u, `${PROTOCOL.a2ui} surfaces`],
    [/^(provider_|refresh_provider)/u, 'Models'],
    [/^(run_flow|run_workflow|workflow_add_step|workflow_cancel_step)/u, 'Flows'],
    [/^(log_entry|link|set_status|query_log|export_measurements)$/u, 'Science log'],
  ];
  return groups.find(([pattern]) => pattern.test(name))?.[1];
}

function toolDomainTitle(tool: ToolCatalogItem): string {
  return (
    toolDomainLabel(tool.domain) ||
    clioDomainForName(tool.name) ||
    humanize(tool.server_id?.replace(/^mcp_/u, '') || vocab.agent)
  );
}

function serverTitle(server: McpServerDefinition | undefined, fallback: string): string {
  if (!server) return humanize(fallback.replace(/^mcp_/u, ''));
  const title = server.spec.title;
  if (typeof title === 'string' && title.trim()) return title;
  return humanize(server.name);
}

function serverDescription(server: McpServerDefinition | undefined): string | undefined {
  const description = server?.spec.description;
  return typeof description === 'string' && description.trim() ? description : undefined;
}

function isBuiltinMcp(server: McpServerDefinition): boolean {
  return server.transport === 'in_process' || server.source === 'builtin';
}

function domainDescription(server: McpServerDefinition): string | undefined {
  if (isBuiltinMcp(server))
    return `Included with ${vocab.agent} and available in this ${vocab.workspace}.`;
  return serverDescription(server);
}

function toolTitleSort(left: ToolCatalogItem, right: ToolCatalogItem): number {
  return (left.title || left.name).localeCompare(right.title || right.name);
}

function toolKey(tool: ToolCatalogItem | undefined): string {
  return tool ? `${tool.server_id || tool.source || 'clio'}:${tool.name}` : '';
}

function humanize(value: string): string {
  return value
    .replace(/^mcp_/u, '')
    .replaceAll(/[-_]+/gu, ' ')
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}
