import type { CommandDefinition } from '@clio/core/v3';
import { ScrollTextIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { commandGroups, commandSource } from '@/lib/command-table';
import { DetailPane } from './primitives/detail-pane';
import { ItemList, ItemRow } from './primitives/item-row';
import { StatusIndicator, type StatusTone } from './primitives/status-indicator';
import { commandKey } from './settings-prompts-model';
import { SettingsGroupLabel } from './settings-row';

const COMMAND_KIND_LABELS: Record<string, string> = {
  builtin: 'Built-in',
  command: 'Command file',
  mcp_prompt: 'MCP prompt',
  skill: 'Skill',
};

/** The command's state in words, with the reason the service gave. */
function commandState(command: CommandDefinition): {
  tone: StatusTone;
  label: string;
  detail?: string;
} {
  const detail = command.disabled_detail || command.disabled_reason || undefined;
  if (command.disabled_reason === 'command_shadowed')
    return {
      tone: 'idle',
      label: 'Shadowed',
      detail: detail ?? 'Another command file of the same name wins.',
    };
  if (command.disabled_reason === 'command_name_reserved')
    return {
      tone: 'idle',
      label: 'Reserved name',
      detail: detail ?? 'A built-in command already has this name.',
    };
  if (!command.enabled)
    return { tone: 'error', label: 'Unavailable', detail: detail ?? 'This command cannot run.' };
  if (command.ambiguous)
    return {
      tone: 'warning',
      label: 'Same name elsewhere',
      detail: `Another source also has ${command.name}; this one runs as ${command.qualified_id}.`,
    };
  if (command.unsupported_fields.length)
    return {
      tone: 'warning',
      label: 'Some fields ignored',
      detail: `This file’s ${command.unsupported_fields.join(', ')} settings are not used.`,
    };
  return { tone: 'success', label: 'Available' };
}

export function CommandList({
  commands,
  openKey,
  onOpen,
}: {
  commands: readonly CommandDefinition[];
  openKey?: string;
  onOpen: (key: string) => void;
}) {
  return (
    <>
      {commandGroups([...commands]).map((group) => (
        <div key={group.heading}>
          <SettingsGroupLabel>{group.heading}</SettingsGroupLabel>
          <ItemList label={group.heading}>
            {group.rows.map((command) => {
              const key = commandKey(command);
              const state = commandState(command);
              const source = commandSource(command);
              const summary =
                command.disabled_detail || command.description || 'No description provided.';
              return (
                <ItemRow
                  aria-expanded={openKey === key}
                  className="cursor-pointer"
                  icon={<ScrollTextIcon />}
                  key={key}
                  meta={
                    <>
                      <span className="mr-2.5 font-mono">{command.id}</span>
                      {source ? <span className="mr-2.5">{source}</span> : null}
                      <span title={summary}>{summary}</span>
                    </>
                  }
                  onClick={() => onOpen(key)}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    onOpen(key);
                  }}
                  role="button"
                  selected={openKey === key}
                  status={
                    <span title={state.detail}>
                      <StatusIndicator label={state.label} tone={state.tone} />
                    </span>
                  }
                  statusWidth={150}
                  tabIndex={0}
                  title={command.title}
                />
              );
            })}
          </ItemList>
        </div>
      ))}
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-2 py-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

/** What a command is, where it comes from, how to call it and why it may not run. */
export function CommandDetail({
  command,
  onClose,
}: {
  command: CommandDefinition;
  onClose: () => void;
}) {
  const state = commandState(command);
  const source = commandSource(command);
  return (
    <DetailPane icon={<ScrollTextIcon />} onClose={onClose} title={command.title}>
      <div className="grid gap-3 pt-1 leading-5">
        <p className="text-muted-foreground">
          {command.description || 'The service did not provide a description.'}
        </p>
        <dl className="grid">
          <Fact label="Status">
            <StatusIndicator label={state.label} tone={state.tone} />
          </Fact>
          {state.detail ? (
            <Fact label="Reason">
              <span>{state.detail}</span>
            </Fact>
          ) : null}
          <Fact label="Kind">
            <span>{COMMAND_KIND_LABELS[command.kind] ?? command.kind}</span>
          </Fact>
          {source ? (
            <Fact label="Source">
              <span>{source}</span>
            </Fact>
          ) : null}
          {command.argument_hint ? (
            <Fact label="Usage">
              <span className="font-mono text-xs break-all">
                {command.id} {command.argument_hint}
              </span>
            </Fact>
          ) : null}
          <Fact label="Runs as">
            <span className="font-mono text-xs break-all">{command.id}</span>
          </Fact>
        </dl>
        {command.aliases.length ? (
          <p className="text-muted-foreground">Also available as {command.aliases.join(', ')}</p>
        ) : null}
      </div>
    </DetailPane>
  );
}
