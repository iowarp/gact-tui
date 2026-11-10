import type { Session, SessionExportMode } from '@clio/core/v3';
import {
  BellRingIcon,
  ExternalLinkIcon,
  GitForkIcon,
  MessageSquareIcon,
  PinIcon,
  PinOffIcon,
} from 'lucide-react';
import { EditIcon, MoreIcon } from '@/lib/icon-vocabulary';
import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { toast } from 'sonner';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { ListRow } from '@/components/clio/primitives/list-row';
import { RingSpinner } from '@/components/clio/primitives/ring-spinner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { useIsMobile } from '@/hooks/use-mobile';
import { sessionInteractionAt } from '@/lib/recent-sessions';
import { canForkSession, isSessionRunning, isUserBranch } from '@/lib/session-state';
import { type SessionAttention, sessionAttentionLabel } from '@/lib/session-attention';
import { cn } from '@/lib/utils';
import { conversationForkOrigin, forkAuthorLabel } from './conversation-fork-origin';
import { KeyMenuItem } from './menu-key-items';
import { selectMenuKey } from './select-menu-key';
import { ClioRelativeTime } from './relative-time';
import type { ResourceActions, ResourceTarget } from './resource-dialogs';
import { SessionAttentionIndicators } from './session-attention-indicators';
import { sessionModeLabel } from './session-behavior-options';
import { SessionExportMenu } from './session-export-menu';
import {
  SessionHistoryConfirmDialog,
  type SessionHistoryConfirmation,
} from './session-history-confirm-dialog';
import {
  SessionForkMenuItem,
  SessionHistoryMenuItems,
  SessionLifecycleMenuItems,
  SessionOrganizeMenuItems,
  SessionShareMenuItem,
} from './session-management-menu';
import { ClioShareSessionDialog } from './share-session-dialog';

/*
 * Opening a conversation can reorder the list (the draft row goes away), which
 * moves another row under a pointer that never moved. Previews stay closed
 * until the pointer really moves.
 */
let previewsHeldAt: { x: number; y: number } | null = null;

function releasePreviews(event: PointerEvent) {
  if (
    !previewsHeldAt ||
    Math.hypot(event.clientX - previewsHeldAt.x, event.clientY - previewsHeldAt.y) > 3
  ) {
    previewsHeldAt = null;
    window.removeEventListener('pointermove', releasePreviews);
  }
}

function holdPreviews(x: number, y: number) {
  previewsHeldAt = { x, y };
  window.addEventListener('pointermove', releasePreviews);
}

interface SessionNavigationRowProps {
  session: Session;
  workspaceId: string;
  /** The workspace folder, when known; desktop offers the system terminal there. */
  workspacePath?: string;
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
  workspacePath,
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
      workspacePath={workspacePath}
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
  workspacePath,
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
  const [sharing, setSharing] = useState(false);
  // One menu for ⋯ and right-click; the hover card stays out of its way while open.
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  // The phone sheet leaves no room beside it for the preview, and touch has no hover.
  const isMobile = useIsMobile();
  const [confirmation, setConfirmation] = useState<SessionHistoryConfirmation>();
  const [historyPending, setHistoryPending] = useState(false);
  const { forkSession, shareSession, openSystemTerminal, compactSession, undoSession } = actions;
  const hasHistoryActions = Boolean(compactSession && undoSession);
  const confirmHistory = async () => {
    const action = confirmation === 'compact' ? compactSession : undoSession;
    if (!action) return;
    setHistoryPending(true);
    try {
      await action(session.id);
      setConfirmation(undefined);
    } catch (error) {
      toast.error(
        confirmation === 'compact'
          ? 'Unable to compact this conversation'
          : 'Unable to remove the last message',
        { description: error instanceof Error ? error.message : String(error) },
      );
    } finally {
      setHistoryPending(false);
    }
  };
  const href = `/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(session.id)}`;
  return (
    <>
      <HoverCard
        closeDelay={100}
        onOpenChange={(next) => {
          if (next && previewsHeldAt) return;
          setHoverOpen(next);
        }}
        open={hoverOpen && !menuOpen && !isMobile}
        openDelay={260}
      >
        <HoverCardTrigger asChild>
          {/* Its own slot wins over the trigger's, so the left bar can style the row. */}
          <ListRow
            data-slot="list-row"
            onContextMenu={(event) => {
              event.preventDefault();
              setHoverOpen(false);
              setMenuOpen(true);
            }}
            actions={
              <DropdownMenu
                onOpenChange={(open) => {
                  setMenuOpen(open);
                  if (open) setHoverOpen(false);
                }}
                open={menuOpen}
              >
                <DropdownMenuTrigger asChild>
                  <IconButton
                    icon={<MoreIcon />}
                    label={`Session actions for ${session.title}`}
                    size="sm"
                    tooltip={false}
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-[290px]" onKeyDown={selectMenuKey}>
                  <KeyMenuItem
                    icon={MessageSquareIcon}
                    label="Open"
                    menuKey="Enter"
                    onSelect={() => {
                      onVisit(session);
                      navigate(href);
                    }}
                  />
                  <SessionOrganizeMenuItems
                    actions={actions}
                    onAction={onAction}
                    onRename={onRename}
                    session={session}
                  />
                  {forkSession && canForkSession(session) ? (
                    <SessionForkMenuItem
                      onSelect={() =>
                        onAction(() => forkSession(session.id), 'Forked into a new conversation')
                      }
                    />
                  ) : null}
                  {shareSession ? <SessionShareMenuItem onSelect={() => setSharing(true)} /> : null}
                  <SessionExportMenu
                    onExport={(mode) =>
                      onAction(
                        () => onDownloadSession(session.id, session.title, mode),
                        'Session archive prepared for download',
                      )
                    }
                  />
                  {(openSystemTerminal && workspacePath) || hasHistoryActions ? (
                    <DropdownMenuSeparator />
                  ) : null}
                  {openSystemTerminal && workspacePath ? (
                    <KeyMenuItem
                      icon={ExternalLinkIcon}
                      label="Open in system terminal"
                      menuKey="T"
                      onSelect={() => void openSystemTerminal(workspacePath)}
                    />
                  ) : null}
                  {hasHistoryActions ? (
                    <SessionHistoryMenuItems onConfirm={setConfirmation} />
                  ) : null}
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
              'data-selected:bg-accent data-selected:text-accent-foreground',
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
                  <RingSpinner />
                </span>
              ) : (
                <span className="inline-flex items-center">
                  {unseen ? <span className="sr-only">New activity, </span> : null}
                  <ClioRelativeTime
                    className={cn(
                      'text-[11px] group-data-selected/list-row:text-accent-foreground/80',
                      unseen ? 'text-foreground' : 'text-muted-foreground',
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
                )}
                data-active={active}
                onClick={(event) => {
                  holdPreviews(event.clientX, event.clientY);
                  setHoverOpen(false);
                  onVisit(session);
                }}
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
      {sharing && shareSession ? (
        <ClioShareSessionDialog
          onOpenChange={setSharing}
          onShare={async (ttlSeconds) => {
            try {
              return await shareSession(session.id, ttlSeconds);
            } catch (error) {
              toast.error('Unable to create a share link', {
                description: error instanceof Error ? error.message : String(error),
              });
              throw error;
            }
          }}
          open
          title={session.title || 'Untitled session'}
        />
      ) : null}
      {hasHistoryActions ? (
        <SessionHistoryConfirmDialog
          confirmation={confirmation}
          onCancel={() => setConfirmation(undefined)}
          onConfirm={() => void confirmHistory()}
          pending={historyPending}
        />
      ) : null}
    </>
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
