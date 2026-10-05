import type { SubagentRun } from '@clio/core/v3';
import {
  ActivityIcon,
  BotIcon,
  BoxesIcon,
  BoxIcon,
  FolderIcon,
  PaperclipIcon,
  TerminalSquareIcon,
} from 'lucide-react';
import { AddIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ClioStatus } from './status';

export type CanvasResourceKind =
  | 'session'
  | 'work'
  | 'files'
  | 'resources'
  | 'artifacts'
  | 'blueprints';

/** Opens one peer canvas tab instead of nesting unrelated resource types. */
export function CanvasLauncher({
  onOpen,
  onOpenSubagent,
  onOpenTerminal,
  subagents = [],
}: {
  onOpen: (kind: CanvasResourceKind) => void;
  /** Opens one child agent of this session as a canvas tab beside the conversation. */
  onOpenSubagent?: (subagent: SubagentRun) => void;
  onOpenTerminal?: () => void;
  subagents?: readonly SubagentRun[];
}) {
  const openableSubagents = subagents.filter((subagent) => subagent.child_session_id);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Open a canvas tab"
          className="size-9 shrink-0 rounded-lg"
          size="icon"
          title="Open a canvas tab"
          variant="ghost"
        >
          <AddIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Add to canvas</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onOpen('session')}>
          <ActivityIcon aria-hidden="true" /> Observability
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpen('work')}>
          <ActivityIcon aria-hidden="true" /> Work
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onOpen('files')}>
          <FolderIcon aria-hidden="true" /> File explorer
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpen('resources')}>
          <PaperclipIcon aria-hidden="true" /> Workspace resources
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpen('artifacts')}>
          <BoxIcon aria-hidden="true" /> Session artifacts
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOpen('blueprints')}>
          <BoxesIcon aria-hidden="true" /> Agent blueprints
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {openableSubagents.length && onOpenSubagent ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <BotIcon aria-hidden="true" /> Child agent
              <span className="ml-auto text-[10px] text-muted-foreground">
                {openableSubagents.length}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-80 w-64 overflow-y-auto">
              {openableSubagents.map((subagent) => (
                <DropdownMenuItem key={subagent.id} onSelect={() => onOpenSubagent(subagent)}>
                  <BotIcon aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{subagent.title}</span>
                  <ClioStatus className="shrink-0 py-0" compact value={subagent.state} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : (
          <DropdownMenuItem disabled>
            <BotIcon aria-hidden="true" /> Child agent
            <span className="ml-auto text-[10px] text-muted-foreground">None yet</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={!onOpenTerminal} onSelect={onOpenTerminal}>
          <TerminalSquareIcon aria-hidden="true" /> Terminal
          {!onOpenTerminal ? (
            <span className="ml-auto text-[10px] text-muted-foreground">Unavailable</span>
          ) : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
