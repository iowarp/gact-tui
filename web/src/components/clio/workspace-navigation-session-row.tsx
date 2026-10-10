import type { AgentBlueprintReference, Session, SessionExportMode } from '@clio/core/v3';
import { BellRingIcon, GitForkIcon, LoaderCircleIcon, PinIcon, PinOffIcon } from 'lucide-react';
import { EditIcon, MoreIcon } from '@/lib/icon-vocabulary';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { sessionInteractionAt } from '@/lib/recent-sessions';
import { isSessionRunning, isUserBranch } from '@/lib/session-state';
import { type SessionAttention, sessionAttentionLabel } from '@/lib/session-attention';
import { cn } from '@/lib/utils';
import { ClioInteractiveRow } from './interactive-row';
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
  blueprint?: AgentBlueprintReference;
  actions: ResourceActions;
  onRename: (target: ResourceTarget) => void;
  onDelete: (target: ResourceTarget) => void;
  onDownloadSession: (sessionId: string, title: string, mode: SessionExportMode) => Promise<void>;
  onAction: (action: () => Promise<void>, success: string) => void;
  onVisit: (session: Session) => void;
  attention?: SessionAttention;
}

export function SessionNavigationRow({
  session,
  workspaceId,
  activeSessionId,
  seenRevision,
  blueprint,
  actions,
  onRename,
  onDelete,
  onDownloadSession,
  onAction,
  onVisit,
  attention,
}: SessionNavigationRowProps) {
  const running = isSessionRunning(session.state);
  const needsAttention = Boolean(attention?.total);
  const unseen =
    !running &&
    !needsAttention &&
    session.id !== activeSessionId &&
    seenRevision !== sessionInteractionAt(session);
  return (
    <ClioInteractiveRow
      appearance="navigation"
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Session actions for ${session.title}`}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <MoreIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
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
      className={cn(
        'h-8 min-h-8 gap-1.5 px-2 py-0',
        needsAttention &&
          'bg-warning/10 text-sidebar-foreground hover:bg-warning/15 focus-within:bg-warning/15',
      )}
      running={running && !needsAttention}
      selected={session.id === activeSessionId}
    >
      <HoverCard closeDelay={100} openDelay={260}>
        <HoverCardTrigger asChild>
          <Link
            className="flex h-full min-w-0 items-center gap-1.5 rounded-md text-sm text-muted-foreground outline-none hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[active=true]:text-sidebar-foreground"
            data-active={session.id === activeSessionId}
            onClick={() => onVisit(session)}
            onMouseDown={(event) => event.preventDefault()}
            to={`/workspaces/${encodeURIComponent(workspaceId)}/sessions/${encodeURIComponent(session.id)}`}
          >
            {session.pinned ? <PinIcon aria-hidden="true" className="mr-1 inline size-3" /> : null}
            {isUserBranch(session) ? (
              <span title="Conversation branch" className="inline-flex shrink-0">
                <GitForkIcon aria-hidden="true" className="size-3" />
              </span>
            ) : null}
            <span className="min-w-0 flex-1 truncate">{session.title || 'Untitled session'}</span>
            {needsAttention && attention ? (
              <span
                aria-label={`Needs your response: ${sessionAttentionLabel(attention)}`}
                aria-live="polite"
                className="inline-flex size-5 shrink-0 items-center justify-center text-action"
                role="status"
                title={`Needs your response: ${sessionAttentionLabel(attention)}`}
              >
                <BellRingIcon aria-hidden="true" className="size-3.5" />
              </span>
            ) : running ? (
              <span
                aria-label="Working now"
                aria-live="polite"
                className="inline-flex size-5 shrink-0 items-center justify-center text-info"
                role="status"
                title="Working now"
              >
                <LoaderCircleIcon aria-hidden="true" className="size-3.5 animate-spin" />
              </span>
            ) : unseen ? (
              <Badge className="h-5 px-1.5 text-[0.625rem]" variant="default">
                New
              </Badge>
            ) : (
              <ClioRelativeTime compact timestamp={sessionInteractionAt(session)} />
            )}
          </Link>
        </HoverCardTrigger>
        <HoverCardContent align="start" className="w-80 p-3" side="right" sideOffset={52}>
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
            <span className="text-muted-foreground">Started</span>
            <span>{startedLabel(session.created_at)}</span>
            {session.message_count !== undefined ? (
              <>
                <span className="text-muted-foreground">Messages</span>
                <span>{messageCountLabel(session.message_count)}</span>
              </>
            ) : null}
            <span className="text-muted-foreground">Agent</span>
            <span className="truncate">
              {blueprint?.display_name || session.agent_id || 'Agent unavailable'}
            </span>
            <span className="text-muted-foreground">Model</span>
            <span className="truncate">{session.model_id || 'Inherited workspace default'}</span>
            <span className="text-muted-foreground">Last interaction</span>
            <ClioRelativeTime timestamp={sessionInteractionAt(session)} />
            <span className="text-muted-foreground">Work mode</span>
            <span>{sessionModeLabel(session.mode)}</span>
          </div>
        </HoverCardContent>
      </HoverCard>
    </ClioInteractiveRow>
  );
}

function sessionStateLabel(state: Session['state']): string {
  return (
    {
      queued: 'Queued',
      running: 'Working now',
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
