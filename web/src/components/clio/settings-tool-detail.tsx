import type { ToolCallers, ToolCatalogItem, ToolPermission, ToolSetting } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRightIcon, ChevronLeftIcon } from 'lucide-react';
import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { scrollParent } from '@/hooks/use-seen-in-view';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { Button } from '@/components/ui/button';
import {
  CALLERS_TEXT,
  PERMISSION_TEXT,
  defaultCallers,
  defaultPermission,
  effectiveCallers,
  effectivePermission,
  flagText,
  modeLabel,
  ruleText,
  savedRules,
  sourceText,
} from './plugin-tool-settings-text';
import { StateView } from './primitives/state-view';
import { DetailPane } from './primitives/detail-pane';
import { CALLERS_ICON, PERMISSION_ICON } from './settings-tools-columns';
import type { RowStatus } from './settings-tools-editor';
import {
  callersOptions,
  permissionOptions,
  toolKind,
  valueTitle,
  type RowEditor,
} from './settings-tools-options';
import { ChoicePicker } from './settings-tools-picker';
import { Outcome } from './settings-tools-tool-row';
import { SettingsGroupLabel, SettingsRow } from './settings-row';
import { SchemaSection } from './tool-schema-section';

/** How long the agent's tool listings stay fresh for a tool's inputs. */
const SCHEMA_FRESH_MS = 5 * 60_000;

function catalogMatch(tool: ToolSetting, rows: readonly ToolCatalogItem[] | undefined) {
  if (!rows) return undefined;
  const exact = rows.find((row) => row.name === tool.name || row.id === tool.name);
  if (exact || !tool.server) return exact;
  // An MCP listing may name a server's tool without the server's prefix.
  const bare = tool.name.slice(tool.server.length + 1);
  const candidates = rows.filter(
    (row) =>
      row.name === bare &&
      [row.server_id, row.source].some((value) => value?.split(/[:/_]/u).includes(tool.server)),
  );
  return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * A tool's declared inputs: an MCP tool's schema from the tools page itself first,
 * then the agent's live tool list, then its catalog (built-in and plugin tools),
 * which is slower and read only when needed.
 */
function useToolInputs(tool: ToolSetting) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const own =
    tool.input_schema && Object.keys(tool.input_schema).length > 0 ? tool.input_schema : undefined;
  const live = useQuery({
    enabled: !own,
    queryKey: queryKeys.key('tools', settings.endpoint),
    queryFn: ({ signal }) => repository.tools(signal),
    staleTime: SCHEMA_FRESH_MS,
  });
  const inLive = catalogMatch(tool, live.data);
  const catalog = useQuery({
    enabled: !own && !live.isPending && !inLive,
    queryKey: queryKeys.key('tools', settings.endpoint, 'catalog'),
    queryFn: ({ signal }) => repository.catalogTools(signal),
    staleTime: SCHEMA_FRESH_MS,
  });
  if (own) return { schema: own, pending: false, error: undefined, retry: () => undefined };
  const row = inLive ?? catalogMatch(tool, catalog.data);
  return {
    schema: row?.input_schema,
    pending: !row && (live.isPending || catalog.isPending),
    error: !row && catalog.error ? catalog.error : undefined,
    retry: () => void catalog.refetch(),
  };
}

/**
 * One tool's details: what it is and where it comes from, its Permission and I/O
 * (the same choices as its row), what a call does, the person's rules and its inputs.
 * The spec draws no tool detail; this follows its Detail pane (E) and setting rows.
 */
export function ToolDetailBody({
  tool,
  mode,
  editor,
  status,
  busy,
  origin,
}: {
  tool: ToolSetting;
  mode: string;
  editor: RowEditor;
  status?: RowStatus;
  busy: boolean;
  /** Where the tool comes from ("web server, from the web plugin"). */
  origin?: string;
}) {
  const inputs = useToolInputs(tool);
  const permission = effectivePermission(tool, mode);
  const callers = effectiveCallers(tool);
  const permissionDefault = defaultPermission(tool, mode);
  const callersDefault = defaultCallers(tool);
  const outcome = tool.outcomes[mode];
  const kind = toolKind(tool);
  const rules = savedRules(tool);
  const permissionLabel = PERMISSION_TEXT[permission.value].label;
  const callersLabel = callers.value ? CALLERS_TEXT[callers.value].label : 'Unknown';
  const customized = Boolean(tool.permission || tool.configured_callers);
  return (
    <div className="grid min-w-0" data-slot="tool-detail">
      {tool.description ? (
        <p className="pb-2 text-ui leading-relaxed whitespace-pre-line text-muted-foreground">
          {tool.description}
        </p>
      ) : null}
      <SettingsGroupLabel
        actions={
          customized ? (
            <Button
              disabled={busy}
              onClick={() => editor.save({ tools: [tool.name], permission: null, callers: null })}
              size="compact"
              variant="ghost"
            >
              Use defaults
            </Button>
          ) : undefined
        }
        className="mt-1"
      >
        Settings
      </SettingsGroupLabel>
      <SettingsRow fullWidth note={sourceText(tool)} title="Permission">
        <ChoicePicker
          chosen={!permission.isDefault}
          disabled={busy}
          icon={PERMISSION_ICON[permission.value]}
          isDefault={permission.isDefault}
          label={permissionLabel}
          name={`Permission for ${tool.name}`}
          onChoose={(value: ToolPermission) =>
            editor.save({
              tools: [tool.name],
              permission: value === permissionDefault ? null : value,
            })
          }
          options={permissionOptions(permissionDefault)}
          search={`Permission for ${tool.name}`}
          selected={permission.value}
          title={valueTitle(permissionLabel, permission.isDefault)}
        />
      </SettingsRow>
      <SettingsRow
        fullWidth
        note={callers.value ? CALLERS_TEXT[callers.value].detail : undefined}
        title="I/O"
      >
        <ChoicePicker
          chosen={!callers.isDefault}
          disabled={busy}
          icon={callers.value ? CALLERS_ICON[callers.value] : ArrowLeftRightIcon}
          isDefault={callers.isDefault && Boolean(callers.value)}
          label={callersLabel}
          name={`I/O for ${tool.name}`}
          onChoose={(value: ToolCallers) =>
            editor.save({ tools: [tool.name], callers: value === callersDefault ? null : value })
          }
          options={callersOptions(callersDefault)}
          search={`I/O for ${tool.name}`}
          selected={callers.value || undefined}
          title={
            callers.value
              ? valueTitle(callersLabel, callers.isDefault)
              : "The plugin's default is known once a conversation loads the tool."
          }
        />
      </SettingsRow>
      {status ? (
        <p
          className={
            status.kind === 'error'
              ? 'pt-1.5 text-xs text-destructive'
              : 'pt-1.5 text-xs text-muted-foreground'
          }
          role={status.kind === 'error' ? 'alert' : 'status'}
        >
          {status.kind === 'error' ? status.message : 'Saved'}
        </p>
      ) : null}
      {outcome ? (
        <>
          <SettingsGroupLabel>What a call does</SettingsGroupLabel>
          <SettingsRow fullWidth inlineControl title={`In ${modeLabel(mode)}`}>
            <Outcome value={outcome.direct} />
          </SettingsRow>
          <SettingsRow fullWidth inlineControl title="From a script">
            <Outcome value={outcome.script} />
          </SettingsRow>
        </>
      ) : null}
      {rules.length ? (
        <>
          <SettingsGroupLabel>Your rules</SettingsGroupLabel>
          {rules.map((rule, index) => {
            const text = ruleText(rule.action, rule.where, rule.path_pattern);
            return (
              <SettingsRow
                fullWidth
                inlineControl
                key={`${rule.scope}:${rule.scope_id}:${rule.action}:${rule.path_pattern}:${index}`}
                title={text}
              >
                <Button
                  aria-label={`Remove rule: ${text}`}
                  disabled={busy}
                  onClick={() => editor.removeRule(tool.name, rule)}
                  size="compact"
                  variant="ghost"
                >
                  Remove
                </Button>
              </SettingsRow>
            );
          })}
        </>
      ) : null}
      <SettingsGroupLabel>About</SettingsGroupLabel>
      <SettingsRow fullWidth inlineControl title="Kind">
        <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <kind.icon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="truncate">{kind.label}</span>
        </span>
      </SettingsRow>
      <SettingsRow fullWidth inlineControl title="Flags">
        <span className="truncate text-muted-foreground">{flagText(tool)}</span>
      </SettingsRow>
      {origin || tool.server ? (
        <SettingsRow fullWidth inlineControl title="Source">
          <span className="truncate text-muted-foreground" title={origin || tool.server}>
            {origin || `${tool.server} server`}
          </span>
        </SettingsRow>
      ) : null}
      <SettingsGroupLabel>Inputs</SettingsGroupLabel>
      <div className="min-w-0 pt-1">
        {inputs.schema ? (
          <SchemaSection empty="No inputs declared." schema={inputs.schema} title="" />
        ) : inputs.pending ? (
          <StateView kind="loading" size="row" title="Loading inputs…" />
        ) : inputs.error ? (
          <div title={inputs.error.message}>
            <StateView
              action={{ label: 'Retry', onClick: inputs.retry }}
              kind="error"
              size="row"
              title="Inputs couldn’t be loaded."
            />
          </div>
        ) : (
          <p className="text-ui text-muted-foreground">
            {tool.server
              ? 'This server doesn’t report its inputs here yet.'
              : 'Its inputs are known once a conversation loads the tool.'}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * A tool's details beside the Tools table, opened from its name. The table is long,
 * so the pane stays in view while the page scrolls and scrolls on its own.
 */
export function ToolDetailPane({
  onClose,
  ...body
}: Parameters<typeof ToolDetailBody>[0] & { onClose: () => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();
  useLayoutEffect(() => {
    const scroller = frame.current ? scrollParent(frame.current) : null;
    if (!scroller) return;
    const read = () => setHeight(scroller.clientHeight);
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);
  const kind = toolKind(body.tool);
  return (
    <div
      className="sticky top-0 flex min-w-0 flex-1 self-start"
      data-slot="tool-detail-frame"
      ref={frame}
      style={height ? { height } : undefined}
    >
      <DetailPane icon={<kind.icon />} onClose={onClose} title={body.tool.name}>
        <ToolDetailBody {...body} />
      </DetailPane>
    </div>
  );
}

/**
 * A tool's details inside a pane that already shows its server or plugin: the
 * tool replaces the list, with a way back to it. Esc goes back too.
 */
export function NestedToolDetail({
  tool,
  backLabel,
  onBack,
  ...body
}: Parameters<typeof ToolDetailBody>[0] & { backLabel: string; onBack: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const kind = toolKind(tool);
  useLayoutEffect(() => {
    root.current?.querySelector<HTMLElement>('[data-slot=tool-detail-back]')?.focus({
      preventScroll: true,
    });
  }, []);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // No `defaultPrevented` check: the window marks every Esc inside a scope as handled.
    if (event.key !== 'Escape') return;
    // A picker's menu portals out of the pane and closes itself.
    if (!event.currentTarget.contains(event.target as Node)) return;
    event.stopPropagation();
    onBack();
  };
  return (
    <div
      className="grid min-w-0"
      data-escape-scope=""
      data-slot="nested-tool-detail"
      onKeyDown={onKeyDown}
      ref={root}
    >
      <div className="flex min-w-0 items-center gap-2 border-b border-border/70 pb-2">
        <Button
          className="-ms-2 h-7 shrink-0 gap-1 px-1.5 text-xs text-muted-foreground"
          data-slot="tool-detail-back"
          onClick={onBack}
          size="compact"
          title={`Back to ${backLabel}`}
          variant="ghost"
        >
          <ChevronLeftIcon aria-hidden="true" className="size-3.5" />
          <span className="max-w-32 truncate">{backLabel}</span>
        </Button>
        <span aria-hidden="true" className="flex shrink-0 text-muted-foreground">
          <kind.icon className="size-4" />
        </span>
        <h3
          className="min-w-0 truncate font-mono text-menu font-semibold text-foreground"
          title={tool.name}
        >
          {tool.name}
        </h3>
      </div>
      <div className="pt-2">
        <ToolDetailBody tool={tool} {...body} />
      </div>
    </div>
  );
}
