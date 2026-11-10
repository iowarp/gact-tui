import type { Session } from '@clio/core/v3';
import { ArrowLeftIcon, ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { MoreIcon } from '@/lib/icon-vocabulary';
import { canForkSession } from '@/lib/session-state';
import { DEFAULT_WORKSPACE_ID } from '@/lib/workspace-labels';
import { ClioSessionActions } from './session-actions';
import { ClioDownloadsButton } from './downloads-button';
import type { ClioSessionActionsProps } from './session-actions';
import { WorkspaceMark } from './workspace-mark';

export interface ClioSessionContextBarProps {
  session?: Session;
  parentSession?: Session;
  workspaceLabel?: string;
  /** The breadcrumb's workspace name opens the workspace. */
  onOpenWorkspace?: () => void;
  actionsPending: boolean;
  management?: ClioSessionActionsProps['management'];
  onCompact: () => Promise<void>;
  onFork: () => Promise<void>;
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
  workspaceLabel,
  onOpenWorkspace,
  actionsPending,
  management,
  onCompact,
  onFork,
  onOpenSystemTerminal,
  onShare,
  onReturnToParent,
  onUndo,
}: ClioSessionContextBarProps) {
  const title = session?.title ?? 'Session unavailable';
  return (
    <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
      {parentSession ? (
        <IconButton
          icon={<ArrowLeftIcon />}
          label={`Return to parent conversation ${parentSession.title}`}
          onClick={() => onReturnToParent(parentSession)}
        />
      ) : null}
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-0.5 text-[13px]">
        {workspaceLabel ? (
          <>
            {/* Spec narrow order: on phones the top bar drops the workspace crumb, so the title gets the width. */}
            <button
              className="flex h-7 max-w-44 shrink-0 items-center gap-1.5 rounded-[6px] px-1.5 text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring disabled:hover:bg-transparent max-md:max-w-28 max-sm:hidden"
              disabled={!onOpenWorkspace}
              onClick={onOpenWorkspace}
              title={`Open ${workspaceLabel}`}
              type="button"
            >
              {/* Loose conversations have no workspace mark, as in the left bar. */}
              {session && session.workspace_id !== DEFAULT_WORKSPACE_ID ? (
                <WorkspaceMark id={session.workspace_id} />
              ) : null}
              <span className="truncate">{workspaceLabel}</span>
            </button>
            <ChevronRightIcon
              aria-hidden="true"
              className="size-3 shrink-0 text-faint max-sm:hidden"
            />
          </>
        ) : null}
        <h1 aria-label={title} className="flex min-w-0">
          <ClioSessionActions
            disabled={!session || actionsPending}
            management={management}
            onCompact={onCompact}
            onFork={canForkSession(session) ? onFork : undefined}
            onOpenSystemTerminal={onOpenSystemTerminal}
            onShare={onShare}
            onUndo={onUndo}
            title={session?.title ?? 'session'}
            more={({ disabled }) => (
              <IconButton
                disabled={disabled}
                icon={<MoreIcon />}
                label="Conversation menu"
                shortcut="conversation-menu"
              />
            )}
            trigger={({ disabled }) => (
              <button
                aria-label={`Actions for ${session?.title ?? 'session'}`}
                className="flex h-7 min-w-0 items-center gap-1 rounded-[6px] px-1.5 font-semibold outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 aria-expanded:bg-hover"
                disabled={disabled}
                title={session?.branch ? `${title}\nBranch ${session.branch}` : title}
                type="button"
              >
                <span className="min-w-0 truncate">{title}</span>
                <ChevronDownIcon
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
              </button>
            )}
          />
        </h1>
      </nav>
      <ClioDownloadsButton />
    </div>
  );
}
