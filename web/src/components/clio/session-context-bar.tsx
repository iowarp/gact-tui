import { sessionAgentRef, type Session } from '@clio/core/v3';
import { ArrowLeftIcon, GitBranchIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { canForkSession } from '@/lib/session-state';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { ClioSessionActions } from './session-actions';
import { ClioDownloadsButton } from './downloads-button';
import { SessionAgentControl } from './session-agent-control';
import type { ClioSessionActionsProps } from './session-actions';

export interface ClioSessionContextBarProps {
  session?: Session;
  parentSession?: Session;
  /** The agent's name while its resolution loads (from the session's pinned reference). */
  agentLabel?: string;
  workspaceLabel?: string;
  actionsPending: boolean;
  management?: ClioSessionActionsProps['management'];
  onCompact: () => Promise<void>;
  onFork: () => Promise<void>;
  onOpenAgent: () => void;
  /** Secondary escape hatch: opens the workspace in the OS's own terminal
   * app instead of the embedded tab. */
  onOpenSystemTerminal?: () => Promise<void>;
  onShare: (ttlSeconds: number) => Promise<string>;
  onReturnToParent: (session: Session) => void;
  onUndo: () => Promise<void>;
}

export function ClioSessionContextBar({
  session,
  parentSession,
  agentLabel,
  workspaceLabel,
  actionsPending,
  management,
  onCompact,
  onFork,
  onOpenAgent,
  onOpenSystemTerminal,
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
      {/* Native window chrome owns the passive title. Agent controls remain
          available in the workspace toolbar in every host. */}
      {inTauri() ? null : (
        <div className="flex min-w-0 items-center gap-1.5">
          <h1 className="min-w-[4ch] shrink-[3] truncate text-sm font-medium">
            {session?.title ?? 'Session unavailable'}
          </h1>
          {workspaceLabel ? (
            <span className="hidden min-w-0 items-center gap-1.5 text-sm sm:flex">
              <span className="text-muted-foreground">in</span>
              <span className="max-w-28 truncate" title={workspaceLabel}>
                {workspaceLabel}
              </span>
            </span>
          ) : null}
        </div>
      )}
      {session ? (
        <SessionAgentControl
          agentRef={sessionAgentRef(session)}
          fallbackLabel={agentLabel}
          onOpenAgent={onOpenAgent}
          sessionId={session.id}
        />
      ) : null}
      {/* Keep conversation actions apart from agent customization. */}
      <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
      <ClioSessionActions
        disabled={!session || actionsPending}
        management={management}
        onCompact={onCompact}
        onFork={canForkSession(session) ? onFork : undefined}
        onOpenSystemTerminal={onOpenSystemTerminal}
        onShare={onShare}
        onUndo={onUndo}
        title={session?.title ?? 'session'}
      />
      <ClioDownloadsButton />
      {session?.branch ? (
        <span className="hidden items-center gap-1 font-mono text-[0.625rem] text-muted-foreground lg:flex">
          <GitBranchIcon aria-hidden="true" className="size-3" />
          {session.branch}
        </span>
      ) : null}
    </div>
  );
}
