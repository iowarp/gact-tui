import type { Session, SessionExportMode } from '@clio/core/v3';
import {
  BellRingIcon,
  CornerDownLeftIcon,
  GitForkIcon,
  LoaderCircleIcon,
  PinIcon,
  PinOffIcon,
} from 'lucide-react';
import { EditIcon, MoreIcon } from '@/lib/icon-vocabulary';
import { Link, useNavigate } from 'react-router-dom';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { ListRow } from '@/components/clio/primitives/list-row';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { sessionInteractionAt } from '@/lib/recent-sessions';
import { isSessionRunning, isUserBranch } from '@/lib/session-state';
import { type SessionAttention, sessionAttentionLabel } from '@/lib/session-attention';
import { cn } from '@/lib/utils';
import { conversationForkOrigin, forkAuthorLabel } from './conversation-fork-origin';
import { ClioRelativeTime } from './relative-time';
import type { ResourceActions, ResourceTarget } from './resource-dialogs';
import { SessionAttentionIndicators } from './session-attention-indicators';
import { sessionModeLabel } from './session-behavior-options';
import { SessionExportMenu } from './session-export-menu';
import { SessionLifecycleMenuItems, SessionOrganizeMenuItems } from './session-management-menu';

interface SessionNavigationRowProps {
  session: Session;
  workspaceId: string;
  activeSessionId: string;
  seenRevision?: string;
  /** The name of the agent the conversation runs. */
  agentLabel?: string;
  actions: ResourceActions;
  onRename: (target: ResourceTarget) => void;
  onDelete: (target: ResourceTarget) => void;
  onDownloadSession: (sessionId: string, title: string, mode: SessionExportMode) => Promise<void>;
  onAction: (action: () => Promise<void>, success: string) => void;
  onVisit: (session: Session) => void;
  attention?: SessionAttention;
  /** How many agent forks deep this row sits under its origin's row. */
  nestedDepth?: number;
  /** A row of its own (Pinned, Conversations) rather than one under a workspace. */
  topLevel?: boolean;
}

export function SessionNavigationRow({
  session,
  workspaceId,
  activeSessionId,
  seenRevision,
  agentLabel,
  actions,
  onRename,
  onDelete,
  onDownloadSession,
  onAction,
  onVisit,
  attention,
  nestedDepth = 0,
  topLevel = false,
}: SessionNavigationRowProps) {
  const forkLabel = forkAuthorLabel(conversationForkOrigin(session));
  const row = (
    <SessionRow
      actions={actions}
      activeSessionId={activeSessionId}
      agentLabel={agentLabel}
      attention={attention}
      forkLabel={forkLabel}
      onAction={onAction}
      onDelete={onDelete}
      onDownloadSession={onDownloadSession}
      onRename={onRename}
      onVisit={onVisit}
      seenRevision={seenRevision}
      session={session}
      topLevel={topLevel}
      workspaceId={workspaceId}
    />
  );
  if (!forkLabel && !nestedDepth) return row;
  // An agent's fork sits under its origin and names its author and note in text.
  return (
    <div
      className={cn('grid min-w-0', nestedDepth > 0 && 'ml-3 border-l border-sidebar-border pl-1')}
      data-slot="agent-fork-row"
    >
      {row}
      {forkLabel ? (
        <p
          className="truncate px-2 pb-1 text-[11px] leading-4 text-muted-foreground"
          title={forkLabel}
        >
          {forkLabel}
        </p>
      ) : null}
    </div>
  );
}

function SessionRow({
  session,
  workspaceId,
  activeSessionId,
  seenRevision,
  agentLabel,
  actions,
  onRename,
  onDelete,
  onDownloadSession,
  onAction,
  onVisit,
  attention,
  forkLabel,
  topLevel,
}: Omit<SessionNavigationRowProps, 'nestedDepth'> & { forkLabel?: string }) {
  const running = isSessionRunning(session.state);
  const needsAttention = Boolean(attention?.total);
  const unseen =
    !running &&
    !needsAttention &&
    session.id !== activeSessionId &&
    seenRevision !== sessionInteractionAt(session);
  const active = session.id === activeSessionId;
  const navigate = useNavigate();
  const href = `/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(session.id)}`;
  return (
    <HoverCard closeDelay={100} openDelay={260}>
      <HoverCardTrigger asChild>
        <ListRow
          actions={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton
                  icon={<MoreIcon />}
                  label={`Session actions for ${session.title}`}
                  size="sm"
                  tooltip={false}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[290px]">
                <DropdownMenuItem
                  menuKey="↵"
                  onSelect={() => {
                    onVisit(session);
                    navigate(href);
                  }}
                >
                  <CornerDownLeftIcon aria-hidden="true" /> Open
                </DropdownMenuItem>
                <SessionOrganizeMenuItems
                  actions={actions}
                  onAction={onAction}
                  onRename={onRename}
                  session={session}
                />
                <DropdownMenuSeparator />
                <SessionExportMenu
                  onExport={(mode) =>
                    onAction(
                      () => onDownloadSession(session.id, session.title, mode),
                      'Session archive prepared for download',
                    )
                  }
                />
                <DropdownMenuSeparator />
                <SessionLifecycleMenuItems
                  actions={actions}
                  onAction={onAction}
                  onDelete={onDelete}
                  session={session}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          }
          actionsOverlay
          actionsWidth={24}
          className={cn(
            'data-selected:bg-accent data-selected:text-accent-foreground data-selected:shadow-[inset_2px_0_0_var(--primary)]',
            topLevel ? 'pl-2.5' : 'pl-[34px]',
          )}
          data-session-row={session.id}
          meta={
            needsAttention && attention ? (
              <span
                aria-label={`Needs your response: ${sessionAttentionLabel(attention)}`}
                aria-live="polite"
                className="inline-flex size-4 cursor-pointer items-center justify-center text-action"
                role="status"
                title={`Needs your response: ${sessionAttentionLabel(attention)}`}
              >
                <BellRingIcon aria-hidden="true" className="size-3.5" />
              </span>
            ) : running ? (
              <span
                aria-label="Working now"
                aria-live="polite"
                className="inline-flex size-4 cursor-pointer items-center justify-center text-info"
                role="status"
                title="Working now"
              >
                <LoaderCircleIcon aria-hidden="true" className="size-3.5 animate-spin" />
              </span>
            ) : (
              <span className="inline-flex items-center">
                {unseen ? <span className="sr-only">New activity, </span> : null}
                <ClioRelativeTime
                  className={cn(
                    'text-[11px] group-data-selected/list-row:text-accent-foreground/80',
                    unseen ? 'font-semibold text-foreground' : 'text-muted-foreground',
                  )}
                  compact
                  timestamp={sessionInteractionAt(session)}
                />
              </span>
            )
          }
          selected={active}
          title={
            <Link
              className={cn(
                'rounded-[6px] outline-none after:absolute after:inset-0 after:rounded-[6px] focus-visible:after:ring-1 focus-visible:after:ring-ring',
                active
                  ? 'text-accent-foreground'
                  : unseen || needsAttention
                    ? 'text-foreground'
                    : 'text-foreground/85 group-hover/list-row:text-foreground',
                unseen && 'font-medium',
              )}
              data-active={active}
              onClick={() => onVisit(session)}
              onMouseDown={(event) => event.preventDefault()}
              to={href}
            >
              {session.pinned ? (
                <PinIcon aria-hidden="true" className="mr-1 inline size-3 align-[-1px]" />
              ) : null}
              {isUserBranch(session) ? (
                <span title={forkLabel ?? 'Conversation branch'}>
                  <GitForkIcon aria-hidden="true" className="mr-1 inline size-3 align-[-1px]" />
                </span>
              ) : null}
              {session.title || 'Untitled session'}
            </Link>
          }
        />
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-80 p-3" side="right" sideOffset={8}>
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <button
              className="group/name flex max-w-full items-center gap-1 rounded-sm text-left font-medium outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onRename({ kind: 'session', id: session.id, label: session.title })}
              type="button"
            >
              <span className="truncate">{session.title || 'Untitled session'}</span>
              <EditIcon
                aria-hidden="true"
                className="size-3 shrink-0 opacity-0 transition-opacity group-hover/name:opacity-100 group-focus/name:opacity-100"
              />
            </button>
            {needsAttention && attention ? (
              <div className="mt-1">
                <SessionAttentionIndicators attention={attention} showResponseLabel />
              </div>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {running ? 'Working now' : sessionStateLabel(session.state)}
              </p>
            )}
          </div>
          <Button
            aria-label={`${session.pinned ? 'Unpin' : 'Pin'} ${session.title}`}
            onClick={() =>
              onAction(
                () => actions.setSessionPinned(session.id, !session.pinned),
                session.pinned ? 'Session unpinned' : 'Session pinned',
              )
            }
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            {session.pinned ? <PinOffIcon aria-hidden="true" /> : <PinIcon aria-hidden="true" />}
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 border-t pt-3 text-xs">
          {forkLabel ? (
            <>
              <span className="text-muted-foreground">Origin</span>
              <span className="[overflow-wrap:anywhere]">{forkLabel}</span>
            </>
          ) : null}
          <span className="text-muted-foreground">Started</span>
          <span>{startedLabel(session.created_at)}</span>
          {session.message_count !== undefined ? (
            <>
              <span className="text-muted-foreground">Messages</span>
              <span>{messageCountLabel(session.message_count)}</span>
            </>
          ) : null}
          <span className="text-muted-foreground">Agent</span>
          <span className="truncate">{agentLabel || 'Agent unavailable'}</span>
          <span className="text-muted-foreground">Model</span>
          <span className="truncate">{session.model_id || 'Inherited workspace default'}</span>
          <span className="text-muted-foreground">Last interaction</span>
          <ClioRelativeTime timestamp={sessionInteractionAt(session)} />
          <span className="text-muted-foreground">Work mode</span>
          <span>{sessionModeLabel(session.mode)}</span>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function sessionStateLabel(state: Session['state']): string {
  return (
    {
      queued: 'Queued',
      running: 'Working now',
      stopping: 'Stopping the model execution',
      stopped: 'Model stopped; accepted background work continues',
      cancellation_requested: 'Cancellation requested; waiting for settlement',
      task_state_uncertain: 'Inspect work before deciding to retry',
      recovering: 'Recovering recorded work',
      pause_requested: 'Pause requested',
      paused: 'Paused',
      yielded: 'Assignment waiting for results or messages',
      recovery_required: 'Inspect work before continuing',
      waiting_permission: 'Waiting for approval',
      waiting_user: 'Waiting for you',
      completed: 'Completed',
      failed: 'Needs attention',
      cancelled: 'Cancelled',
      interrupted: 'Interrupted',
      unknown: 'Unknown state',
    } satisfies Record<Session['state'], string>
  )[state];
}

function startedLabel(timestamp: string): string {
  const time = new Date(timestamp);
  if (Number.isNaN(time.getTime())) return 'at an unknown time';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    time,
  );
}

function messageCountLabel(count: number | undefined): string {
  if (count === undefined) return '';
  if (count === 0) return 'No messages yet';
  return count === 1 ? '1 message' : `${count} messages`;
}
