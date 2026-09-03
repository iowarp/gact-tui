import type { Session, Workspace } from '@clio/core/v3';
import {
  ActivityIcon,
  ArrowRightIcon,
  FolderIcon,
  MessagesSquareIcon,
  ServerIcon,
  Settings2Icon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { isPrimarySession, sessionInteractionAt } from '@/lib/recent-sessions';
import { ClioStatus } from './status';

interface ConnectionWorkspaceHomeProps {
  endpoint: string;
  label?: string;
  sessions: readonly Session[];
  workspaces: readonly Workspace[];
  onChangeConnection: () => void;
  onOpenSession: (workspaceId: string, sessionId: string) => void;
}

/** Connection-level home that does not require an arbitrarily selected session. */
export function ConnectionWorkspaceHome({
  endpoint,
  label,
  sessions,
  workspaces,
  onChangeConnection,
  onOpenSession,
}: ConnectionWorkspaceHomeProps) {
  const visibleSessions = sessions
    .filter((session) => isPrimarySession(session) && !session.archived)
    .toSorted((left, right) =>
      sessionInteractionAt(right).localeCompare(sessionInteractionAt(left)),
    );

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b bg-background/92 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-5 lg:px-8">
          <ServerIcon aria-hidden="true" className="size-4 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{label || 'Agent service'}</p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">{endpoint}</p>
          </div>
          <ClioStatus label="Connected" value="live" />
          <Button onClick={onChangeConnection} size="sm" variant="ghost">
            Connections
          </Button>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-8 lg:grid-cols-[minmax(0,1fr)_15rem] lg:px-8">
        <div className="min-w-0">
          <div className="mb-7">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Workspace home
            </p>
            <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight">
              Choose where to continue
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              The service is connected. Open a conversation when you need one; the connection itself
              does not depend on a selected session.
            </p>
          </div>

          <div className="grid gap-4">
            {workspaces.map((workspace) => {
              const workspaceSessions = visibleSessions.filter(
                (session) => session.workspace_id === workspace.id,
              );
              return (
                <section className="overflow-hidden rounded-xl border bg-card" key={workspace.id}>
                  <header className="flex items-start gap-3 border-b px-4 py-3">
                    <FolderIcon aria-hidden="true" className="mt-0.5 size-4 text-primary" />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate text-sm font-semibold">{workspace.display_name}</h2>
                      <p className="truncate font-mono text-[11px] text-muted-foreground">
                        {workspace.path || 'No working folder'}
                      </p>
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {workspaceSessions.length}{' '}
                      {workspaceSessions.length === 1 ? 'conversation' : 'conversations'}
                    </span>
                  </header>
                  {workspaceSessions.length ? (
                    <div className="divide-y">
                      {workspaceSessions.map((session) => (
                        <button
                          className="group flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                          key={session.id}
                          onClick={() => onOpenSession(workspace.id, session.id)}
                          type="button"
                        >
                          <MessagesSquareIcon
                            aria-hidden="true"
                            className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground"
                          />
                          <span className="min-w-0 flex-1 truncate text-sm">{session.title}</span>
                          <ArrowRightIcon
                            aria-hidden="true"
                            className="size-4 shrink-0 text-muted-foreground"
                          />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="px-4 py-5 text-sm text-muted-foreground">
                      No active conversations in this workspace.
                    </p>
                  )}
                </section>
              );
            })}
            {!workspaces.length ? (
              <div className="rounded-xl border border-dashed p-8 text-center">
                <FolderIcon aria-hidden="true" className="mx-auto size-5 text-muted-foreground" />
                <p className="mt-3 text-sm font-medium">No workspaces yet</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Create the first workspace from the connected-service setup.
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <nav aria-label="Service navigation" className="grid content-start gap-2">
          <p className="mb-1 px-2 text-xs font-medium text-muted-foreground">Service</p>
          <Button asChild className="justify-start" variant="ghost">
            <Link state={{ endpoint, from: '/' }} to="/runs">
              <ActivityIcon aria-hidden="true" />
              Runs
            </Link>
          </Button>
          <Button asChild className="justify-start" variant="ghost">
            <Link state={{ endpoint, from: '/' }} to="/infrastructure">
              <ServerIcon aria-hidden="true" />
              Infrastructure
            </Link>
          </Button>
          <Button asChild className="justify-start" variant="ghost">
            <Link state={{ endpoint, from: '/' }} to="/settings/appearance">
              <Settings2Icon aria-hidden="true" />
              Settings
            </Link>
          </Button>
        </nav>
      </section>
    </main>
  );
}
