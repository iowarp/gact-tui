import type { CommandDefinition } from '@clio/core/v3';
import { AlertTriangleIcon, BanIcon, CopyIcon, EyeOffIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  PromptInputCommand,
  PromptInputCommandEmpty,
  PromptInputCommandGroup,
  PromptInputCommandItem,
  PromptInputCommandList,
} from '@/components/ai-elements/prompt-input';
import { Badge } from '@/components/ui/badge';
import { commandGroups, commandMatches, commandSource } from '@/lib/command-table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

function StatusNote({ icon, label, detail }: { icon: ReactNode; label: string; detail: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="shrink-0 gap-1" variant="outline">
            {icon}
            <span>{label}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>{detail}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** The row's state in words, with its reason on hover: never an unexplained icon. */
export function CommandStatus({ command }: { command: CommandDefinition }): ReactNode {
  const detail = command.disabled_detail || command.disabled_reason || '';
  if (command.disabled_reason === 'command_shadowed')
    return (
      <StatusNote
        detail={detail || 'Another command file of the same name wins.'}
        icon={<EyeOffIcon aria-hidden="true" />}
        label="Shadowed"
      />
    );
  if (command.disabled_reason === 'command_name_reserved')
    return (
      <StatusNote
        detail={detail || 'A built-in command already has this name.'}
        icon={<BanIcon aria-hidden="true" />}
        label="Reserved name"
      />
    );
  if (!command.enabled)
    return (
      <StatusNote
        detail={detail || 'This command cannot run.'}
        icon={<BanIcon aria-hidden="true" />}
        label="Unavailable"
      />
    );
  if (command.ambiguous)
    return (
      <StatusNote
        detail={`Another source also has ${command.name}; this one runs as ${command.qualified_id}.`}
        icon={<CopyIcon aria-hidden="true" />}
        label="Same name elsewhere"
      />
    );
  if (command.unsupported_fields.length)
    return (
      <StatusNote
        detail={`This file’s ${command.unsupported_fields.join(', ')} settings are not used.`}
        icon={<AlertTriangleIcon aria-hidden="true" />}
        label="Some fields ignored"
      />
    );
  return null;
}

export function ClioComposerCommandMenu({
  commands,
  query,
  onPick,
  popoverId,
}: {
  commands: readonly CommandDefinition[];
  query: string;
  onPick: (command: CommandDefinition) => void;
  popoverId: string;
}) {
  const matching = commands.filter((command) => commandMatches(command, query));
  return (
    <div
      className="absolute inset-x-4 bottom-full z-20 mx-auto max-w-4xl pb-2 lg:inset-x-6"
      id={popoverId}
    >
      <PromptInputCommand className="rounded-xl border bg-popover text-popover-foreground shadow-xl">
        <PromptInputCommandList className="max-h-64">
          <PromptInputCommandEmpty>No command matches.</PromptInputCommandEmpty>
          {commandGroups(matching).map((group) => (
            <PromptInputCommandGroup heading={group.heading} key={group.heading}>
              {group.rows.map((command) => {
                const source = commandSource(command);
                return (
                  <PromptInputCommandItem
                    aria-label={`${command.title} ${command.id}`}
                    disabled={!command.enabled}
                    key={`${command.kind}:${command.qualified_id}:${command.source}`}
                    onSelect={() => onPick(command)}
                    value={`${command.id} ${command.qualified_id} ${command.title} ${command.aliases.join(' ')}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-baseline gap-x-2 font-medium">
                        <span className="min-w-0 break-all font-mono">{command.id}</span>
                        {command.title && command.title !== command.id ? (
                          <span className="hidden min-w-0 truncate font-normal text-muted-foreground sm:inline">
                            {command.title}
                          </span>
                        ) : null}
                      </span>
                      {/* Its state, where it comes from and what it does, on one line. */}
                      <span className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                        <CommandStatus command={command} />
                        {source ? <span className="shrink-0">{source}</span> : null}
                        <span className="min-w-0 truncate">
                          {command.enabled
                            ? [command.argument_hint, command.description]
                                .filter(Boolean)
                                .join(' — ') || 'Run this command'
                            : command.disabled_detail || command.disabled_reason || 'Unavailable'}
                        </span>
                      </span>
                    </span>
                  </PromptInputCommandItem>
                );
              })}
            </PromptInputCommandGroup>
          ))}
        </PromptInputCommandList>
      </PromptInputCommand>
    </div>
  );
}
