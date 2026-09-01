import type { AgentBlueprintReference, Session } from '@clio/core/v3';
import {
  ArchiveIcon,
  DownloadIcon,
  LoaderCircleIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
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
import { isSessionRunning } from '@/lib/session-state';
import { ClioInteractiveRow } from './interactive-row';
import { ClioRelativeTime } from './relative-time';
import type { ResourceActions, ResourceTarget } from './resource-dialogs';
import { sessionModeLabel } from './session-behavior-options';

interface SessionNavigationRowProps {
  session: Session;
  workspaceId: string;
  activeSessionId: string;
  seenRevision?: string;
  blueprint?: AgentBlueprintReference;
  actions: ResourceActions;
  onRename: (target: ResourceTarget) => void;
  onDelete: (target: ResourceTarget) => void;
  onDownloadSession: (sessionId: string, title: string) => Promise<void>;
  onAction: (action: () => Promise<void>, success: string) => void;
  onVisit: (session: Session) => void;
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
}: SessionNavigationRowProps) {
  const running = isSessionRunning(session.state);
  const unseen =
    !running && session.id !== activeSessionId && seenRevision !== sessionInteractionAt(session);
  return (
    <ClioInteractiveRow
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Session actions for ${session.title}`}
              size="icon-xs"
              type="button"
              variant="ghost"
            >
              <MoreHorizontalIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem
              className="whitespace-nowrap"
              onSelect={() =>
                onAction(
                  () => actions.setSessionPinned(session.id, !session.pinned),
                  session.pinned ? 'Session unpinned' : 'Session pinned',
                )
              }
            >
              {session.pinned ? <PinOffIcon aria-hidden="true" /> : <PinIcon aria-hidden="true" />}
              {session.pinned ? 'Unpin session' : 'Pin session'}
            </DropdownMenuItem>
            <DropdownMenuItem
              className="whitespace-nowrap"
              onSelect={() => onRename({ kind: 'session', id: session.id, label: session.title })}
            >
              <PencilIcon aria-hidden="true" /> Rename session
            </DropdownMenuItem>
            <DropdownMenuItem
              className="whitespace-nowrap"
              onSelect={() =>
                onAction(() => actions.archiveSession(session.id), 'Session archived')
              }
            >
              <ArchiveIcon aria-hidden="true" /> Archive session
            </DropdownMenuItem>
            <DropdownMenuItem
              className="whitespace-nowrap"
              onSelect={() =>
                onAction(
                  () => onDownloadSession(session.id, session.title),
                  'Session export downloaded',
                )
              }
            >
              <DownloadIcon aria-hidden="true" /> Export session
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="whitespace-nowrap"
              onSelect={() => onDelete({ kind: 'session', id: session.id, label: session.title })}
              variant="destructive"
            >
              <Trash2Icon aria-hidden="true" /> Delete session
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      }
      className="h-8 min-h-8 gap-1.5 px-2 py-0"
      running={running}
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
            <span className="min-w-0 flex-1 truncate">{session.title || 'Untitled session'}</span>
            {running ? (
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
              <Badge className="h-5 px-1.5 text-[10px]" variant="default">
                New
              </Badge>
            ) : (
              <ClioRelativeTime compact timestamp={sessionInteractionAt(session)} />
            )}
          </Link>
        </HoverCardTrigger>
        <HoverCardContent align="start" className="w-72 p-3" side="right" sideOffset={52}>
          <div className="flex min-w-0 items-start gap-2">
            <div className="min-w-0 flex-1">
              <button
                className="group/name flex max-w-full items-center gap-1 rounded-sm text-left font-medium outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => onRename({ kind: 'session', id: session.id, label: session.title })}
                type="button"
              >
                <span className="truncate">{session.title || 'Untitled session'}</span>
                <PencilIcon
                  aria-hidden="true"
                  className="size-3 shrink-0 opacity-0 transition-opacity group-hover/name:opacity-100 group-focus/name:opacity-100"
                />
              </button>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {running ? 'Working now' : sessionStateLabel(session.state)}
              </p>
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
