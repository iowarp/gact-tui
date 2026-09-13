import type { AgentBlueprintReference, Session } from '@clio/core/v3';
import { ArrowLeftIcon, GitBranchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClioSessionActions } from './session-actions';

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
  const showsBaseAgent = Boolean(
    session &&
      !session.parent_session_id &&
      !activeBlueprint &&
      (!session.agent_id || session.agent_id === 'main'),
  );

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
      <div className="flex min-w-0 items-center gap-1.5">
        <h1 className="truncate text-base font-medium">
          {session?.title ?? 'Session unavailable'}
        </h1>
        {activeBlueprint ? (
          <>
            <span aria-hidden="true" className="shrink-0 text-muted-foreground">
              /
            </span>
            <Button
              className="h-7 min-w-0 max-w-full justify-start px-1.5 text-xs font-normal text-muted-foreground"
              onClick={() => onOpenBlueprint(activeBlueprint)}
              size="xs"
              title={`Open ${activeBlueprint.display_name}`}
              variant="ghost"
            >
              <span className="truncate">{activeBlueprint.display_name}</span>
            </Button>
          </>
        ) : showsBaseAgent ? (
          <>
            <span aria-hidden="true" className="shrink-0 text-muted-foreground">
              /
            </span>
            <span className="truncate px-1.5 text-xs text-muted-foreground">Base agent</span>
          </>
        ) : null}
      </div>
      <ClioSessionActions
        disabled={!session || actionsPending}
        onCompact={onCompact}
        onFork={onFork}
        onShare={onShare}
        onUndo={onUndo}
        title={session?.title ?? 'session'}
      />
      {session?.branch ? (
        <span className="hidden items-center gap-1 font-mono text-[10px] text-muted-foreground lg:flex">
          <GitBranchIcon aria-hidden="true" className="size-3" />
          {session.branch}
        </span>
      ) : null}
    </div>
  );
}
