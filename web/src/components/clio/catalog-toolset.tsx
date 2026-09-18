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
  const [catalog, setCatalog] = useState<'builtin' | 'mcp'>('builtin');
  const [browserOpen, setBrowserOpen] = useState(false);
  const bundles = useMemo(() => toolBundles(tools, servers, query), [query, servers, tools]);
  const [selectedKey, setSelectedKey] = useState(() => toolKey(tools[0]));
  const activeBundle = bundles.find((bundle) => bundle.id === catalog);
  const visibleTools = activeBundle?.domains.flatMap((domain) => domain.tools) ?? [];
  const selected =
    visibleTools.find((tool) => toolKey(tool) === selectedKey) ?? visibleTools[0];
  const selectTool = (tool: ToolCatalogItem) => {
    setSelectedKey(toolKey(tool));
    setBrowserOpen(false);
  };

  if (!tools.length) {
    return <p className="py-10 text-sm text-muted-foreground">No tools were reported.</p>;
  }

  return (
    <div className="border-y bg-card xl:grid xl:min-h-[38rem] xl:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
      <div className="flex items-center justify-between gap-3 border-b p-3 xl:hidden">
        <Button onClick={() => setBrowserOpen(true)} size="sm" variant="outline">
          <ListFilterIcon aria-hidden="true" /> Browse tools
        </Button>
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          {selected ? selected.title?.trim() || humanize(selected.name) : 'Choose a tool'}
        </span>
      </div>
      <aside className="hidden border-r xl:block">
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
      <div className="min-w-0">
        {selected ? (
          <ToolContract tool={selected} />
        ) : (
          <p className="p-8 text-sm text-muted-foreground">No tools match “{query}”.</p>
        )}
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
  catalog: 'builtin' | 'mcp';
  onCatalog: (catalog: 'builtin' | 'mcp') => void;
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
  const active = bundles.find((bundle) => bundle.id === catalog);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-3 border-b p-3">
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
        <div aria-label="Tool source" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
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
      <div className="clio-scrollbar min-h-0 flex-1 overflow-y-auto">
        {active?.domains.map((domain, index) => (
          <ToolDomainGroup
            defaultOpen={Boolean(query) || index === 0 || domain.tools.includes(selected!)}
            domain={domain}
            key={domain.id}
            onSelect={onSelect}
            selected={selected}
          />
        ))}
        {!active?.domains.length ? (
          <p className="p-5 text-sm text-muted-foreground">No tools match “{query}”.</p>
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
      className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors ${
        active ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'
      }`}
      onClick={onClick}
      type="button"
    >
      {label} <span className="text-xs tabular-nums">{count}</span>
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
      className="group border-b"
      onToggle={(event) => setOpen(event.currentTarget.open)}
      open={open}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3">
        <ChevronDownIcon
          aria-hidden="true"
          className="size-3.5 text-muted-foreground transition-transform group-open:rotate-180"
        />
        <span className="min-w-0 flex-1 truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {domain.title}
        </span>
        {domain.server ? <McpOriginBadge server={domain.server} /> : null}
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {domain.tools.length}
        </span>
      </summary>
      {domain.server ? <McpProvenance server={domain.server} /> : null}
      <div className="pb-2">
        {domain.tools.map((tool) => {
          const current = selected && toolKey(selected) === toolKey(tool);
          return (
            <button
              aria-current={current ? 'true' : undefined}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                current ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/60'
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
  const label = server.agent_blueprint_id || server.session_id ? 'Session' : isBuiltinMcp(server) ? 'Built in' : 'Connected';
  return <Badge variant="outline">{label}</Badge>;
}

function McpProvenance({ server }: { server: McpServerDefinition }) {
  if (server.agent_blueprint_id) {
    return (
      <p className="px-8 pb-2 text-xs text-muted-foreground">
        Enabled by{' '}
        <Link
          className="font-medium text-primary hover:underline"
          to={`/settings/blueprints?blueprint=${encodeURIComponent(server.agent_blueprint_id)}`}
        >
          {server.agent_blueprint_name || server.agent_blueprint_id}
        </Link>
        {server.session_id ? ' for this session' : ''}.
      </p>
    );
  }
  return domainDescription(server) ? (
    <p className="px-8 pb-2 text-xs text-muted-foreground">{domainDescription(server)}</p>
  ) : null;
}

function ToolContract({ tool }: { tool: ToolCatalogItem }) {
  const title = tool.title?.trim() || humanize(tool.name);
  return (
    <article className="p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-primary">Tool</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h2>
          <code className="mt-1 block break-all text-xs text-muted-foreground">{tool.name}</code>
        </div>
        <Badge variant="outline">{toolDomainTitle(tool)}</Badge>
      </div>

      <section className="border-b py-5">
        <h3 className="text-sm font-semibold">Description</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
          {tool.description?.trim() || 'This provider did not supply a description.'}
        </p>
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
        className="border-t py-4 text-xs"
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

function SchemaSection({
  empty,
  schema,
  title,
}: {
  empty: string;
  schema: Record<string, unknown>;
  title: string;
}) {
  const properties = schemaProperties(schema);
  const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : []);
  return (
    <section className="border-b py-5 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {schemaType(schema) ? (
          <code className="text-[11px] text-muted-foreground">{schemaType(schema)}</code>
        ) : null}
      </div>
      {properties.length ? (
        <dl className="mt-3 divide-y border-y">
          {properties.map(([name, value]) => (
            <div
              className="grid gap-1 py-3 sm:grid-cols-[minmax(9rem,0.35fr)_minmax(0,1fr)]"
              key={name}
            >
              <dt className="min-w-0">
                <code className="break-all text-xs font-semibold text-foreground">{name}</code>
                {required.has(name) ? (
                  <span className="ml-2 text-[10px] font-medium uppercase tracking-wide text-primary">
                    required
                  </span>
                ) : (
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                    optional
                  </span>
                )}
              </dt>
              <dd className="min-w-0 text-xs leading-5 text-muted-foreground">
                <code className="mr-2 text-foreground">{schemaType(value)}</code>
                {schemaDescription(value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : Object.keys(schema).length ? (
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {schemaDescription(schema) ||
            `Declared as ${schemaType(schema) || 'a structured value'}.`}
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
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
  return clioDomainForName(tool.name) || humanize(tool.server_id?.replace(/^mcp_/u, '') || 'Other');
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
    [/^(create_a2ui|update_a2ui|a2ui_|raise_alert_card)/u, PROTOCOL.a2ui],
    [/^(provider_|refresh_provider)/u, 'Models'],
    [/^(workflow_|run_workflow)/u, 'Workflows'],
  ];
  return groups.find(([pattern]) => pattern.test(name))?.[1];
}

function toolDomainTitle(tool: ToolCatalogItem): string {
  return clioDomainForName(tool.name) || humanize(tool.server_id?.replace(/^mcp_/u, '') || vocab.agent);
}

function serverTitle(server: McpServerDefinition | undefined, fallback: string): string {
  if (!server) return humanize(fallback.replace(/^mcp_/u, ''));
  const title = server.spec.title;
  if (typeof title === 'string' && title.trim()) return title;
  if (server.agent_blueprint_name?.trim()) return server.agent_blueprint_name;
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
  if (isBuiltinMcp(server)) return `Included with ${vocab.agent} and available in this ${vocab.workspace}.`;
  return serverDescription(server);
}

function schemaProperties(
  schema: Record<string, unknown>,
): Array<[string, Record<string, unknown>]> {
  const value = schema.properties;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  return Object.entries(value).map(([name, property]) => [
    name,
    property && typeof property === 'object' && !Array.isArray(property)
      ? (property as Record<string, unknown>)
      : {},
  ]);
}

function schemaType(schema: Record<string, unknown>): string {
  if (Array.isArray(schema.type)) return schema.type.join(' | ');
  if (typeof schema.type === 'string') {
    if (schema.type === 'array' && schema.items && typeof schema.items === 'object') {
      return `${schemaType(schema.items as Record<string, unknown>) || 'value'}[]`;
    }
    return schema.type;
  }
  if (Array.isArray(schema.enum)) return schema.enum.map(String).join(' | ');
  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf
      .filter(
        (value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object',
      )
      .map(schemaType)
      .filter(Boolean)
      .join(' | ');
  }
  return '';
}

function schemaDescription(schema: Record<string, unknown>): string {
  const description = typeof schema.description === 'string' ? schema.description.trim() : '';
  const choices = Array.isArray(schema.enum)
    ? `Options: ${schema.enum.map(String).join(', ')}.`
    : '';
  const fallback = schema.default === undefined ? '' : `Default: ${String(schema.default)}.`;
  return [description, choices, fallback].filter(Boolean).join(' ');
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
