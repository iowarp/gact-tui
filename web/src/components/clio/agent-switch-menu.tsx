import type { AgentEntry } from '@clio/core/v3';
import { BotIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface AgentSwitchMenuProps {
  /** Installed and saved agents; `undefined` while loading. */
  agents?: readonly AgentEntry[];
  agentsError?: string;
  /** The agent the conversation runs now. */
  current: string;
  disabled?: boolean;
  onSwitch: (agent: AgentEntry) => void;
  children: ReactNode;
}

/** Pick another agent for this conversation: installed agents and the person's own. */
export function AgentSwitchMenu({
  agents,
  agentsError,
  current,
  disabled,
  onSwitch,
  children,
}: AgentSwitchMenuProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {children}
      </PopoverTrigger>
      <PopoverContent
        aria-label="Switch agent"
        align="start"
        className="w-[min(24rem,calc(100vw-2rem))] p-0"
      >
        <Command label="Search agents">
          <CommandInput aria-label="Search agents" placeholder="Search agents…" />
          <CommandList className="max-h-[min(20rem,60dvh)]">
            {agents === undefined && !agentsError ? (
              <p className="p-4 text-sm text-muted-foreground" role="status">
                Loading agents…
              </p>
            ) : null}
            {agentsError ? (
              <p className="p-4 text-sm text-destructive" role="alert">
                Agents could not be listed: {agentsError}
              </p>
            ) : null}
            {agents !== undefined ? <CommandEmpty>No matching agents.</CommandEmpty> : null}
            {agents?.length ? (
              <CommandGroup heading="Agents">
                {agents.map((agent) => {
                  const active = agent.ref === current;
                  return (
                    <CommandItem
                      className="items-start gap-2 py-2"
                      disabled={active}
                      key={agent.ref}
                      keywords={[agent.id, agent.name, agent.description].filter(Boolean)}
                      onSelect={() => {
                        if (active) return;
                        onSwitch(agent);
                        setOpen(false);
                      }}
                      value={agent.ref}
                    >
                      <BotIcon
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="truncate font-medium">{agent.name || agent.id}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {active ? 'Current' : agent.kind === 'user' ? 'Yours' : agent.ref}
                          </span>
                        </span>
                        {agent.description ? (
                          <span className="line-clamp-2 text-xs text-muted-foreground">
                            {agent.description}
                          </span>
                        ) : null}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
