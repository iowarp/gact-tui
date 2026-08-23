import type { Session } from '@clio/core/v3';
import { ArrowLeftIcon, GitBranchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClioSessionBehaviorMenu, type SessionBehaviorPatch } from './session-behavior-menu';
import { ClioSessionActions } from './session-actions';
import { ClioStatus } from './status';

export interface ClioSessionContextBarProps {
  session?: Session;
  parentSession?: Session;
  workspaceDisplayName?: string;
  actionsPending: boolean;
  onCompact: () => Promise<void>;
  onBehaviorChange: (patch: SessionBehaviorPatch) => Promise<void>;
  onFork: () => Promise<void>;
  onShare: (ttlSeconds: number) => Promise<string>;
  onReturnToParent: (session: Session) => void;
  onUndo: () => Promise<void>;
}

export function ClioSessionContextBar({
  session,
  parentSession,
  workspaceDisplayName,
  actionsPending,
  onCompact,
  onBehaviorChange,
  onFork,
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
        <p className="truncate text-[10px] text-muted-foreground">
          {workspaceDisplayName ?? 'Workspace unavailable'}
        </p>
      </div>
      <ClioSessionActions
        disabled={!session || actionsPending}
        onCompact={onCompact}
        onFork={onFork}
        onShare={onShare}
        onUndo={onUndo}
        title={session?.title ?? 'session'}
      />
      {session ? (
        <ClioSessionBehaviorMenu
          disabled={actionsPending}
          onChange={onBehaviorChange}
          session={session}
        />
      ) : null}
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
