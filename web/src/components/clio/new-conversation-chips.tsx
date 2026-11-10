import type { AgentEntry } from '@clio/core/v3';
import { BotIcon, ChevronDownIcon, FolderIcon } from 'lucide-react';
import { useId, type ComponentProps, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfigureIcon } from '@/lib/icon-vocabulary';
import { NamedTooltip } from './primitives/icon-button';
import { agentDisplayName } from '@/lib/plugin-presentation';
import { cn } from '@/lib/utils';
import { workspaceName } from '@/lib/workspace-labels';
import { ListGroupLabel } from './primitives/list-row';
import { MenuRow } from './primitives/menu-row';

const chipClass =
  'h-7 min-w-0 gap-1.5 rounded-md bg-hover/60 px-2 text-[13px] font-normal text-foreground hover:bg-hover aria-expanded:bg-hover';

/** A compact menu trigger: icon, a truncating name, an optional note and a chevron. */
function ChipTrigger({
  icon,
  label,
  note,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, 'children'> & {
  icon: ReactNode;
  label: string;
  note?: ReactNode;
}) {
  return (
    <Button className={cn(chipClass, className)} size="sm" variant="ghost" {...props}>
      <span aria-hidden="true" className="text-muted-foreground [&_svg]:size-3.5">
        {icon}
      </span>
      <span className="min-w-0 truncate">{label}</span>
      {note}
      <ChevronDownIcon aria-hidden="true" className="size-3 text-muted-foreground" />
    </Button>
  );
}

export interface DraftWorkspaceOption {
  id: string;
  display_name: string;
}

/** Where the draft will be created; choosing another workspace moves the draft there. */
export function DraftWorkspaceChip({
  workspaces,
  workspaceId,
  disabled,
  onSelect,
}: {
  workspaces: readonly DraftWorkspaceOption[];
  workspaceId: string;
  disabled?: boolean;
  onSelect: (workspaceId: string) => void;
}) {
  const current = workspaces.find((item) => item.id === workspaceId);
  const label = current ? workspaceName(current) : workspaceId;
  const groupId = useId();
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ChipTrigger
          aria-label={`Conversation workspace: ${label}`}
          className="max-w-44 shrink"
          disabled={disabled}
          icon={<FolderIcon />}
          label={label}
          title={label}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup aria-labelledby={groupId}>
          <ListGroupLabel id={groupId}>Workspaces</ListGroupLabel>
          <DropdownMenuRadioGroup
            value={workspaceId}
            onValueChange={(id) => {
              if (id !== workspaceId) onSelect(id);
            }}
          >
            {workspaces.map((item) => (
              <DropdownMenuRadioItem key={item.id} value={item.id}>
                <MenuRow icon={<FolderIcon />} label={workspaceName(item)} />
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function changeCount(changes: number) {
  return `${changes} ${changes === 1 ? 'change' : 'changes'}`;
}

function AgentGroup({
  title,
  agents,
  defaultRef,
}: {
  title: string;
  agents: readonly AgentEntry[];
  defaultRef?: string;
}) {
  const id = useId();
  if (!agents.length) return null;
  return (
    <DropdownMenuGroup aria-labelledby={id}>
      <ListGroupLabel id={id}>{title}</ListGroupLabel>
      {agents.map((agent) => (
        <DropdownMenuRadioItem key={agent.ref} value={agent.ref}>
          <MenuRow
            icon={<BotIcon />}
            label={agent.name || agent.id}
            description={agent.description || undefined}
            tag={agent.ref === defaultRef ? { text: 'Default' } : undefined}
          />
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuGroup>
  );
}

/**
 * The agent the draft will run, chosen from installed agents and the user's
 * own; changes made in the Agent tab show beside its name.
 */
export function DraftAgentChip({
  agents,
  agentsError,
  pending = agents === undefined,
  agentRef,
  defaultRef,
  changes = 0,
  disabled,
  onSelect,
  onManageAgents,
}: {
  agents?: readonly AgentEntry[];
  agentsError?: string;
  pending?: boolean;
  agentRef: string;
  defaultRef?: string;
  changes?: number;
  disabled?: boolean;
  onSelect: (ref: string) => void;
  onManageAgents: () => void;
}) {
  const installed = agents?.filter((agent) => agent.kind !== 'user') ?? [];
  const own = agents?.filter((agent) => agent.kind === 'user') ?? [];
  const label = agentRef
    ? agentDisplayName(agentRef, agents)
    : pending
      ? 'Loading agents…'
      : agentsError
        ? 'Agents unavailable'
        : 'Default agent';
  const unavailable = pending || Boolean(agentsError && !agents?.length);
  const changed = changes > 0 ? changeCount(changes) : undefined;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <ChipTrigger
          aria-label={`Conversation agent: ${label}${changed ? `, ${changed}` : ''}`}
          // On a narrow row the agent's name truncates before anything else.
          className="max-w-56 shrink-[100]"
          disabled={disabled || unavailable}
          icon={<BotIcon />}
          label={label}
          note={
            changed ? (
              <span className="shrink-0 text-[12px] text-primary">{changed}</span>
            ) : undefined
          }
          title={agentsError || undefined}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuRadioGroup
          value={agentRef}
          onValueChange={(ref) => {
            if (ref !== agentRef) onSelect(ref);
          }}
        >
          <AgentGroup title="Installed agents" agents={installed} defaultRef={defaultRef} />
          {installed.length && own.length ? <DropdownMenuSeparator /> : null}
          <AgentGroup title="Your agents" agents={own} defaultRef={defaultRef} />
        </DropdownMenuRadioGroup>
        {installed.length || own.length ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem onSelect={onManageAgents}>
          <MenuRow label="Manage agents…" />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Opens the Agent tab in the workbench, where plugins, prompt and tools are
 * changed. On a narrow draft it folds to its gear, named by its tooltip.
 */
export function DraftCustomizeChip({
  changes = 0,
  disabled,
  onCustomize,
}: {
  changes?: number;
  disabled?: boolean;
  onCustomize: () => void;
}) {
  return (
    <NamedTooltip label="Customize the agent">
      <Button
        aria-label={
          changes ? `Customize the agent (${changeCount(changes)})` : 'Customize the agent'
        }
        className="h-7 gap-1.5 px-1.5 text-[13px] font-normal text-muted-foreground hover:text-foreground [&_svg]:size-3.5"
        disabled={disabled}
        onClick={onCustomize}
        size="sm"
        variant="ghost"
      >
        <ConfigureIcon aria-hidden="true" />
        <span className="hidden @min-[30rem]/draft:inline">Customize</span>
      </Button>
    </NamedTooltip>
  );
}
