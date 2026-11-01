import type { ToolRule, ToolSetting, ToolSettingsUpdate } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  CALLERS_TEXT,
  OUTCOME_TEXT,
  PERMISSION_TEXT,
  callersChoice,
  flagText,
  groupModeText,
  modeLabel,
  permissionChoice,
  pluginCallersText,
  pluginDefaultSource,
  pluginPermissionText,
  ruleText,
  type CallersChoice,
  type PermissionChoice,
} from './plugin-tool-settings-text';

const GROUPS = [
  { id: 'read', title: 'Read-only tools' },
  { id: 'write', title: 'Write and delete tools' },
] as const;
type GroupId = (typeof GROUPS)[number]['id'];
type Detail = { kind: 'tool'; name: string } | { kind: 'group'; group: GroupId };

/** A plugin's tools: permission and I/O per tool, grouped by read-only flags. */
export function PluginToolSettings({ reference }: { reference: string }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const wide = useMediaQuery('(min-width: 640px)');
  const key = ['tool-settings', connectionScope(settings), reference];
  const view = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => repository.toolSettings(reference, signal),
  });
  const [mode, setMode] = useState('');
  const [detail, setDetail] = useState<Detail>();
  const save = useMutation({
    mutationFn: (update: ToolSettingsUpdate) => repository.updateToolSettings(update),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: (error: Error) =>
      toast.error('Tool setting not saved', { description: error.message }),
  });
  const remove = useMutation({
    mutationFn: ({ tool, rule }: { tool: string; rule: ToolRule }) =>
      repository.removeToolRule(tool, rule),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
    onError: (error: Error) => toast.error('Rule not removed', { description: error.message }),
  });
  if (view.isPending) return <p role="status">Reading tool settings…</p>;
  if (view.error) {
    return (
      <div role="alert" className="grid gap-2 text-sm">
        <p>Tool settings could not be loaded: {view.error.message}</p>
        <Button className="w-fit" variant="outline" onClick={() => void view.refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  const data = view.data;
  const shown = mode || data.approval_modes[0] || 'ask';
  const setPermission = (tools: string[], choice: PermissionChoice) =>
    save.mutate({ tools, permission: choice === 'default' ? null : choice });
  const setCallers = (tools: string[], choice: CallersChoice) =>
    save.mutate({ tools, callers: choice === 'default' ? null : choice });
  const groups = GROUPS.map((group) => ({
    ...group,
    tools: data.tools.filter((tool) => tool.group === group.id),
  })).filter((group) => group.tools.length);
  const editors = { setPermission, setCallers, busy: save.isPending };

  if (!wide && detail) {
    const tools =
      detail.kind === 'tool'
        ? data.tools.filter((tool) => tool.name === detail.name)
        : (groups.find((group) => group.id === detail.group)?.tools ?? []);
    return (
      <MobileDetail
        title={
          detail.kind === 'tool'
            ? detail.name
            : `All ${GROUPS.find((g) => g.id === detail.group)!.title.toLowerCase()}`
        }
        tools={tools}
        onBack={() => setDetail(undefined)}
        onRemoveRule={(tool, rule) => remove.mutate({ tool, rule })}
        {...editors}
      />
    );
  }
  return (
    <div className="grid gap-5 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span id="tool-settings-mode" className="text-muted-foreground">
          Show what happens in
        </span>
        <Select value={shown} onValueChange={setMode}>
          <SelectTrigger size="sm" aria-labelledby="tool-settings-mode" className="w-auto">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {data.approval_modes.map((value) => (
              <SelectItem key={value} value={value}>
                {modeLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {data.servers_not_loaded.length ? (
        <p className="text-muted-foreground">
          Tools of {data.servers_not_loaded.join(', ')} appear here once a conversation has
          connected the server.
        </p>
      ) : null}
      {!groups.length ? <p className="text-muted-foreground">This plugin has no tools.</p> : null}
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`tool-group-${group.id}`} className="grid gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
            <h3 id={`tool-group-${group.id}`} className="font-medium">
              {group.title} <span className="text-muted-foreground">({group.tools.length})</span>
            </h3>
            {wide ? (
              <Controls
                label={`All ${group.title.toLowerCase()}`}
                permission={shared(group.tools.map(permissionChoice))}
                callers={shared(group.tools.map(callersChoice))}
                names={group.tools.map((tool) => tool.name)}
                {...editors}
              />
            ) : null}
          </div>
          <p className="text-muted-foreground">
            {groupModeText(group.id, shown, data.covering_modes)}
          </p>
          <ul className="grid divide-y">
            {!wide ? (
              <li>
                <MobileRow
                  name="All tools"
                  value={summary(
                    shared(group.tools.map(permissionChoice)),
                    shared(group.tools.map(callersChoice)),
                  )}
                  onOpen={() => setDetail({ kind: 'group', group: group.id })}
                />
              </li>
            ) : null}
            {group.tools.map((tool) => (
              <li key={tool.name}>
                {wide ? (
                  <ToolRow
                    tool={tool}
                    mode={shown}
                    onRemoveRule={(rule) => remove.mutate({ tool: tool.name, rule })}
                    {...editors}
                  />
                ) : (
                  <MobileRow
                    name={tool.name}
                    value={summary(permissionChoice(tool), callersChoice(tool), tool)}
                    outcome={outcome(tool, shown)}
                    onOpen={() => setDetail({ kind: 'tool', name: tool.name })}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

type Editors = {
  setPermission: (tools: string[], choice: PermissionChoice) => void;
  setCallers: (tools: string[], choice: CallersChoice) => void;
  busy: boolean;
};

function shared<T extends string>(values: T[]): T | 'mixed' {
  return values.every((value) => value === values[0]) && values.length ? values[0]! : 'mixed';
}

function choiceLabel(
  choice: PermissionChoice | CallersChoice | 'mixed',
  table: Record<string, { label: string }>,
  fallback: string,
): string {
  if (choice === 'mixed') return 'Mixed';
  if (choice === 'default') return fallback;
  return table[choice]!.label;
}

function summary(
  permission: PermissionChoice | 'mixed',
  callers: CallersChoice | 'mixed',
  tool?: ToolSetting,
): string {
  return [
    choiceLabel(permission, PERMISSION_TEXT, tool ? pluginPermissionText(tool) : 'Plugin default'),
    choiceLabel(callers, CALLERS_TEXT, tool ? pluginCallersText(tool) : 'Plugin default'),
  ].join(', ');
}

function outcome(tool: ToolSetting, mode: string): string {
  const found = tool.outcomes[mode];
  if (!found) return '';
  return `In ${modeLabel(mode)}: ${OUTCOME_TEXT[found.direct]}. From a script: ${
    OUTCOME_TEXT[found.script]
  }.`;
}

function Controls({
  label,
  permission,
  callers,
  names,
  defaults,
  setPermission,
  setCallers,
  busy,
}: Editors & {
  label: string;
  permission: PermissionChoice | 'mixed';
  callers: CallersChoice | 'mixed';
  names: string[];
  defaults?: { permission: string; callers: string };
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={permission === 'mixed' ? '' : permission}
        onValueChange={(value) => setPermission(names, value as PermissionChoice)}
        disabled={busy}
      >
        <SelectTrigger size="sm" aria-label={`Permission: ${label}`} className="w-40">
          <SelectValue placeholder="Mixed" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">
            Plugin default{defaults ? `: ${defaults.permission}` : ''}
          </SelectItem>
          {(['allow', 'ask', 'deny'] as const).map((value) => (
            <SelectItem key={value} value={value}>
              {PERMISSION_TEXT[value].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={callers === 'mixed' ? '' : callers}
        onValueChange={(value) => setCallers(names, value as CallersChoice)}
        disabled={busy}
      >
        <SelectTrigger size="sm" aria-label={`I/O: ${label}`} className="w-32">
          <SelectValue placeholder="Mixed" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">
            Plugin default{defaults ? `: ${defaults.callers}` : ''}
          </SelectItem>
          {(['direct', 'code', 'both'] as const).map((value) => (
            <SelectItem key={value} value={value}>
              {CALLERS_TEXT[value].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SavedRules({
  tool,
  onRemoveRule,
}: {
  tool: ToolSetting;
  onRemoveRule: (rule: ToolRule) => void;
}) {
  const saved = tool.rules.filter((rule) => rule.where !== 'everywhere' || rule.path_pattern);
  if (!saved.length) return null;
  return (
    <ul aria-label={`Saved rules for ${tool.name}`} className="grid gap-1">
      {saved.map((rule, index) => (
        <li key={index} className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <span>{ruleText(rule.action, rule.where, rule.path_pattern)}</span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7"
            aria-label={`Remove rule: ${ruleText(rule.action, rule.where, rule.path_pattern)}`}
            onClick={() => onRemoveRule(rule)}
          >
            Remove
          </Button>
        </li>
      ))}
    </ul>
  );
}

function ToolRow({
  tool,
  mode,
  onRemoveRule,
  ...editors
}: Editors & { tool: ToolSetting; mode: string; onRemoveRule: (rule: ToolRule) => void }) {
  return (
    <div className="grid gap-1 py-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-4">
      <div className="grid min-w-0 gap-0.5">
        <span className="break-all font-medium">{tool.name}</span>
        <span className="text-muted-foreground">
          {flagText(tool)}. Plugin default: {pluginPermissionText(tool)} (
          {pluginDefaultSource(tool)}); I/O {pluginCallersText(tool)}.
        </span>
        <span>{outcome(tool, mode)}</span>
        <SavedRules tool={tool} onRemoveRule={onRemoveRule} />
      </div>
      <Controls
        label={tool.name}
        permission={permissionChoice(tool)}
        callers={callersChoice(tool)}
        names={[tool.name]}
        defaults={{ permission: pluginPermissionText(tool), callers: pluginCallersText(tool) }}
        {...editors}
      />
    </div>
  );
}

function MobileRow({
  name,
  value,
  outcome: result,
  onOpen,
}: {
  name: string;
  value: string;
  outcome?: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 py-3 text-left"
      onClick={onOpen}
      aria-label={`${name}: ${value}`}
    >
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="break-all font-medium">{name}</span>
        <span className="text-muted-foreground">{value}</span>
        {result ? <span className="text-muted-foreground">{result}</span> : null}
      </span>
      <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function Options<T extends string>({
  legend,
  selected,
  options,
  onChoose,
  busy,
}: {
  legend: string;
  selected: T | 'mixed';
  options: { value: T; label: string; detail: string }[];
  onChoose: (value: T) => void;
  busy: boolean;
}) {
  return (
    <fieldset className="grid gap-1">
      <legend className="mb-1 font-medium">{legend}</legend>
      <div role="radiogroup" aria-label={legend} className="grid divide-y rounded-md border">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected === option.value}
            disabled={busy}
            className="flex items-start gap-2 px-3 py-2 text-left"
            onClick={() => onChoose(option.value)}
          >
            <span className="grid flex-1 gap-0.5">
              <span>{option.label}</span>
              <span className="text-muted-foreground">{option.detail}</span>
            </span>
            {selected === option.value ? (
              <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
            ) : null}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function MobileDetail({
  title,
  tools,
  onBack,
  onRemoveRule,
  setPermission,
  setCallers,
  busy,
}: Editors & {
  title: string;
  tools: ToolSetting[];
  onBack: () => void;
  onRemoveRule: (tool: string, rule: ToolRule) => void;
}) {
  const names = tools.map((tool) => tool.name);
  const one = tools.length === 1 ? tools[0] : undefined;
  const permissionDefault = one
    ? `${pluginPermissionText(one)}, ${pluginDefaultSource(one)}`
    : 'each tool keeps its plugin default';
  const callersDefault = one ? pluginCallersText(one) : 'each tool keeps its plugin default';
  return (
    <div className="grid gap-4 text-sm">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={onBack} aria-label="Back to tools">
          <ChevronLeftIcon aria-hidden className="size-4" />
          Back
        </Button>
        <h3 className="break-all font-medium">{title}</h3>
      </div>
      <Options<PermissionChoice>
        legend="Permission"
        selected={shared(tools.map(permissionChoice))}
        busy={busy}
        onChoose={(value) => setPermission(names, value)}
        options={[
          {
            value: 'default',
            label: 'Plugin default',
            detail: `Follow the plugin: ${permissionDefault}.`,
          },
          ...(['allow', 'ask', 'deny'] as const).map((value) => ({
            value,
            ...PERMISSION_TEXT[value],
          })),
        ]}
      />
      <Options<CallersChoice>
        legend="I/O"
        selected={shared(tools.map(callersChoice))}
        busy={busy}
        onChoose={(value) => setCallers(names, value)}
        options={[
          {
            value: 'default',
            label: 'Plugin default',
            detail: `Follow the plugin: ${callersDefault}.`,
          },
          ...(['direct', 'code', 'both'] as const).map((value) => ({
            value,
            ...CALLERS_TEXT[value],
          })),
        ]}
      />
      {one ? (
        <>
          <SavedRules tool={one} onRemoveRule={(rule) => onRemoveRule(one.name, rule)} />
          {one.description ? <p className="text-muted-foreground">{one.description}</p> : null}
        </>
      ) : null}
    </div>
  );
}
