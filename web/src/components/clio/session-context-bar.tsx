import { sessionAgentRef, type Session } from '@clio/core/v3';
import { ArrowLeftIcon, ChevronDownIcon, ChevronRightIcon, GitBranchIcon } from 'lucide-react';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { cn } from '@/lib/utils';
import { canForkSession } from '@/lib/session-state';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { ClioSessionActions } from './session-actions';
import { ClioDownloadsButton } from './downloads-button';
import { SessionAgentControl } from './session-agent-control';
import type { ClioSessionActionsProps } from './session-actions';
import { WorkspaceMark } from './workspace-mark';

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
  const title = session?.title ?? 'Session unavailable';
  // Native window chrome shows the passive title on desktop, so there the
  // conversation menu is the chevron alone.
  const nativeTitle = inTauri();
  const TitleElement = nativeTitle ? 'span' : 'h1';
  return (
    <div className="flex min-w-0 items-center gap-1 overflow-hidden">
      {parentSession ? (
        <IconButton
          icon={<ArrowLeftIcon />}
          label={`Return to parent conversation ${parentSession.title}`}
          onClick={() => onReturnToParent(parentSession)}
        />
      ) : null}
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[13px]">
        {workspaceLabel && !nativeTitle ? (
          <>
            <span
              className="hidden min-w-0 max-w-40 shrink-[2] items-center gap-1.5 text-muted-foreground lg:flex"
              title={workspaceLabel}
            >
              {session ? <WorkspaceMark id={session.workspace_id} /> : null}
              <span className="truncate">{workspaceLabel}</span>
            </span>
            <ChevronRightIcon
              aria-hidden="true"
              className="hidden size-3.5 shrink-0 text-faint lg:block"
            />
          </>
        ) : null}
        <TitleElement aria-label={nativeTitle ? undefined : title} className="flex min-w-0">
          <ClioSessionActions
            disabled={!session || actionsPending}
            management={management}
            onCompact={onCompact}
            onFork={canForkSession(session) ? onFork : undefined}
            onOpenSystemTerminal={onOpenSystemTerminal}
            onShare={onShare}
            onUndo={onUndo}
            title={session?.title ?? 'session'}
            trigger={({ disabled }) => (
              <button
                aria-label={`Actions for ${session?.title ?? 'session'}`}
                className={cn(
                  'flex h-7 min-w-0 items-center gap-1 rounded-[6px] px-1.5 font-medium outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 aria-expanded:bg-hover',
                  nativeTitle && 'w-7 justify-center px-0',
                )}
                disabled={disabled}
                title={session?.branch ? `${title}\nBranch ${session.branch}` : title}
                type="button"
              >
                {nativeTitle ? null : <span className="min-w-0 truncate">{title}</span>}
                <ChevronDownIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
              </button>
            )}
          />
        </TitleElement>
      </nav>
      {session ? (
        <SessionAgentControl
          agentRef={sessionAgentRef(session)}
          fallbackLabel={agentLabel}
          onOpenAgent={onOpenAgent}
          sessionId={session.id}
        />
      ) : null}
      <ClioDownloadsButton />
      {session?.branch ? (
        <span
          className="hidden shrink-0 items-center gap-1 font-mono text-[11px] text-muted-foreground xl:flex"
          title={`Branch ${session.branch}`}
        >
          <GitBranchIcon aria-hidden="true" className="size-3" />
          {session.branch}
        </span>
      ) : null}
    </div>
  );
}
