import { SchemaSection } from './tool-schema-section';
import type { McpServerDefinition, ToolCatalogItem, ToolPermission } from '@clio/core/v3';
import {
  BrainIcon,
  EyeIcon,
  FilePenLineIcon,
  FileTextIcon,
  FolderIcon,
  GlobeIcon,
  ListTodoIcon,
  NotebookPenIcon,
  PlugIcon,
  ShapesIcon,
  SquareTerminalIcon,
  TextSearchIcon,
  WrenchIcon,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { vocab } from '@/lib/brand-vocabulary';
import { TechnicalDetails } from '@/components/clio/technical-details';
import { InfraList, InfraRow, type InfraStatus } from './infrastructure-row';
import { IconButton } from './primitives/icon-button';
import { StateView } from './primitives/state-view';
import { permissionOperationLabel } from './permission-operation-labels';
import { TOOL_OPERATIONS } from './tool-operation-contract';
import {
  domainDescription,
  humanize,
  isBuiltinMcp,
  toolBundles,
  toolKey,
  type ToolEntry,
  type ToolSource,
} from './catalog-tool-bundles';

/**
 * Unified, inspectable catalog for CLIO-owned tools and installed MCPs: one
 * row per tool under Built in and MCP servers. A row opens its contract.
 */
export function CatalogToolset({
  servers = [],
  tools,
  query = '',
  source = 'all',
  permissions,
  checking,
  onClearFilters,
}: {
  servers?: McpServerDefinition[];
  tools: ToolCatalogItem[];
  query?: string;
  source?: ToolSource;
  /** Each tool's permission by name (Settings › Tools); the status column says it. */
  permissions?: ReadonlyMap<string, ToolPermission>;
  /** Tools whose permission is still being read; they say Loading rather than Available. */
  checking?: ReadonlySet<string>;
  onClearFilters?: () => void;
}) {
  const bundles = useMemo(() => toolBundles(tools, servers, query), [query, servers, tools]);
  const [selected, setSelected] = useState<ToolEntry>();
  const builtin = source === 'mcp' ? [] : bundles.builtin;
  const mcp = source === 'builtin' ? [] : bundles.mcp;

  if (!tools.length) {
    return <StateView kind="empty" size="row" title="No tools were reported." />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-2" data-slot="tool-catalog">
      {builtin.length ? (
        <InfraList heading="Built in" hover={26} meta={128} pinned={false}>
          {builtin.map((entry) => (
            <ToolRow
              checking={checking?.has(entry.tool.name)}
              entry={entry}
              key={toolKey(entry.tool)}
              onInspect={setSelected}
              permission={permissions?.get(entry.tool.name)}
            />
          ))}
        </InfraList>
      ) : null}
      {mcp.length ? (
        <InfraList heading="MCP servers" hover={26} meta={128} pinned={false}>
          {mcp.map((entry) => (
            <ToolRow
              checking={checking?.has(entry.tool.name)}
              entry={entry}
              key={toolKey(entry.tool)}
              onInspect={setSelected}
              permission={permissions?.get(entry.tool.name)}
            />
          ))}
        </InfraList>
      ) : null}
      {!builtin.length && !mcp.length ? (
        <StateView
          action={onClearFilters ? { label: 'Clear filters', onClick: onClearFilters } : undefined}
          kind="empty"
          size="row"
          title={query.trim() ? `No tools match “${query.trim()}”.` : 'No tools from this source.'}
        />
      ) : null}
      <Sheet
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
        open={Boolean(selected)}
      >
        <SheetContent
          className="w-[min(94vw,40rem)] gap-0 overflow-y-auto p-0 sm:max-w-xl"
          side="right"
        >
          {selected ? <ToolContract entry={selected} key={toolKey(selected.tool)} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ToolRow({
  entry,
  onInspect,
  permission,
  checking,
}: {
  entry: ToolEntry;
  onInspect: (entry: ToolEntry) => void;
  permission?: ToolPermission;
  checking?: boolean;
}) {
  const { tool } = entry;
  const inspect = (event: MouseEvent) => {
    event.stopPropagation();
    onInspect(entry);
  };
  return (
    <InfraRow
      className="cursor-pointer"
      data-tool-name={tool.name}
      description={toolSummary(tool)}
      icon={<ToolIcon tool={tool} />}
      // The meta column names where the tool comes from: the agent itself or its server.
      meta={tool.server_id ? entry.group : vocab.agent}
      onClick={() => onInspect(entry)}
      status={toolStatus(tool, permission, checking)}
      title={
        <button className="max-w-full truncate text-left" onClick={inspect} type="button">
          {tool.name}
        </button>
      }
      actions={
        // On a narrow list the row itself is the only inspect control it needs.
        <IconButton
          className="@max-[480px]/infra:hidden"
          icon={<EyeIcon />}
          label={`Inspect ${tool.name}`}
          onClick={inspect}
          size="sm"
        />
      }
    />
  );
}

const BUILTIN_TOOL_ICONS: Array<[RegExp, LucideIcon]> = [
  [/^(shell_|run_command)/u, SquareTerminalIcon],
  [/^(fs_read|read_)/u, FileTextIcon],
  [/^(fs_write|fs_edit|write_|edit_)/u, FilePenLineIcon],
  [/^fs_list/u, FolderIcon],
  [/^(fs_search|search_)/u, TextSearchIcon],
  [/^web_/u, GlobeIcon],
  [/^memory_/u, BrainIcon],
  [/artifact/u, ShapesIcon],
  [/(plan|todo|goal)/u, ListTodoIcon],
  [/^(log_entry|query_log|export_measurements)$/u, NotebookPenIcon],
];

/** What a built-in tool does at a glance; every connected server's tool is a plug. */
function ToolIcon({ tool }: { tool: ToolCatalogItem }) {
  if (tool.server_id) return <PlugIcon />;
  const Icon = BUILTIN_TOOL_ICONS.find(([pattern]) => pattern.test(tool.name))?.[1] ?? WrenchIcon;
  return <Icon />;
}

const PERMISSION_STATUS: Record<ToolPermission, InfraStatus> = {
  allow: { tone: 'success', label: 'Allowed' },
  ask: { tone: 'warning', label: 'Asks first' },
  deny: { tone: 'idle', label: 'Off' },
};

/** The permission when Settings knows it (spec: Allowed, Asks first, Off), else availability. */
function toolStatus(
  tool: ToolCatalogItem,
  permission?: ToolPermission,
  checking?: boolean,
): InfraStatus {
  if (tool.enabled === false) return { tone: 'idle', label: 'Off' };
  const status = tool.status?.trim().toLocaleLowerCase();
  const healthy = !status || ['available', 'enabled', 'ready', 'healthy'].includes(status);
  if (permission && healthy) return PERMISSION_STATUS[permission];
  if (checking && healthy) return { tone: 'running', label: 'Loading' };
  if (healthy) {
    return { tone: 'success', label: 'Available' };
  }
  return { tone: 'warning', label: humanize(status) };
}

function toolSummary(tool: ToolCatalogItem): string | undefined {
  // Descriptions are written for the model; their RST/Markdown code quotes read as plain words here.
  const line = tool.description
    ?.trim()
    .split(/\r?\n/u)[0]
    ?.replace(/``(.+?)``/gu, '$1')
    .replace(/`([^`]+)`/gu, '$1')
    .trim();
  return line || tool.title?.trim() || undefined;
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
      <p className="text-xs text-muted-foreground">
        From the{' '}
        <Link className="font-medium text-primary hover:underline" to="/settings/plugins">
          {server.plugin}
        </Link>{' '}
        plugin{server.session_id ? ' of this conversation’s agent' : ''}.
      </p>
    );
  }
  return domainDescription(server) ? (
    <p className="text-xs text-muted-foreground">{domainDescription(server)}</p>
  ) : null;
}

function ToolContract({ entry }: { entry: ToolEntry }) {
  const { tool, server } = entry;
  // Some providers send the id title-cased as the title; a known label reads better.
  const supplied = tool.title?.trim();
  const plain = (text: string) =>
    text
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/gu, ' ')
      .trim();
  const title =
    (supplied && plain(supplied) !== plain(tool.name) ? supplied : undefined) ||
    permissionOperationLabel(tool.name) ||
    TOOL_OPERATIONS[tool.name]?.action ||
    supplied ||
    humanize(tool.name);
  const [expanded, setExpanded] = useState(false);
  const description = tool.description?.trim() || 'This provider did not supply a description.';
  return (
    <article className="grid min-w-0 content-start gap-6 p-5 pr-12">
      <SheetHeader className="gap-1 p-0">
        <SheetTitle className="text-lg">{title}</SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs">{entry.group}</span>
          {server ? <McpOriginBadge server={server} /> : null}
        </SheetDescription>
        {server ? <McpProvenance server={server} /> : null}
      </SheetHeader>

      <section className="grid gap-2">
        <h3 className="text-sm font-semibold">Description</h3>
        <p
          className={`text-sm leading-6 whitespace-pre-wrap ${description.length > 420 && !expanded ? 'line-clamp-4' : ''}`}
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
          <Metadata label="Tool id" value={tool.name} />
          <Metadata label="Source" value={tool.source || 'Not reported'} />
          <Metadata label="MCP or domain" value={tool.server_id || vocab.agent} />
          <Metadata label="Owner" value={tool.owner || 'Not reported'} />
          <Metadata label="Visible to" value={tool.visible_to.join(', ') || 'Not restricted'} />
        </dl>
        <pre className="clio-scrollbar mt-4 max-h-72 overflow-auto rounded-lg bg-muted/40 p-3 text-caption leading-5 whitespace-pre-wrap">
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
