import type { AgentBlueprintReference, Session } from '@clio/core/v3';
import { ArrowLeftIcon, GitBranchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClioSessionActions } from './session-actions';
import { ClioStatus } from './status';

export interface ClioSessionContextBarProps {
  session?: Session;
  parentSession?: Session;
  activeBlueprint?: AgentBlueprintReference;
  actionsPending: boolean;
  onCompact: () => Promise<void>;
  onFork: () => Promise<void>;
  onOpenBlueprint: (blueprint: AgentBlueprintReference) => void;
  onShare: (ttlSeconds: number) => Promise<string>;
  onReturnToParent: (session: Session) => void;
  onUndo: () => Promise<void>;
}

export function ClioSessionContextBar({
  session,
  parentSession,
  activeBlueprint,
  actionsPending,
  onCompact,
  onFork,
  onOpenBlueprint,
  onShare,
  onReturnToParent,
  onUndo,
}: ClioSessionContextBarProps) {
  return (
    <div className="flex min-w-0 items-center gap-2 overflow-hidden">
      {parentSession ? (
        <Button
          aria-label={`Return to parent conversation ${parentSession.title}`}
          className="shrink-0"
          onClick={() => onReturnToParent(parentSession)}
          size="icon-xs"
          title={`Return to ${parentSession.title}`}
          variant="ghost"
        >
          <ArrowLeftIcon aria-hidden="true" />
        </Button>
      ) : null}
      <div className="min-w-0">
        <h1 className="truncate text-sm font-medium">{session?.title ?? 'Session unavailable'}</h1>
        {activeBlueprint ? (
          <Button
            className="-ml-1 h-auto max-w-full justify-start px-1 py-0 text-[10px] font-normal text-muted-foreground"
            onClick={() => onOpenBlueprint(activeBlueprint)}
            size="xs"
            title={`Open ${activeBlueprint.display_name}`}
            variant="ghost"
          >
            <span className="truncate">{activeBlueprint.display_name}</span>
          </Button>
        ) : (
          <p className="truncate text-[10px] text-muted-foreground">Default agent</p>
        )}
      </div>
      <ClioSessionActions
        disabled={!session || actionsPending}
        onCompact={onCompact}
        onFork={onFork}
        onShare={onShare}
        onUndo={onUndo}
        title={session?.title ?? 'session'}
      />
      <ClioStatus className="hidden sm:inline-flex" value={session?.state ?? 'unavailable'} />
      {session?.branch ? (
        <span className="hidden items-center gap-1 font-mono text-[10px] text-muted-foreground lg:flex">
          <GitBranchIcon aria-hidden="true" className="size-3" />
          {session.branch}
        </span>
      ) : null}
    </div>
  );
}
