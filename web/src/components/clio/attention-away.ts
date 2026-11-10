import type { RunState, Session, Workspace } from '@clio/core/v3';
import type { SessionAttention } from '@/lib/session-attention';
import type { NotificationReads } from '@/lib/notification-reads';

export type AwayTone = 'success' | 'error' | 'warning' | 'stopped';

interface AwayKind {
  /** Follows the conversation's name: "Survey finished". */
  verb: string;
  /** What happened, when the place alone does not say it. */
  detail?: string;
  tone: AwayTone;
  /** The row's one action word; a finished run needs none. */
  action?: string;
  /** The run is over: Finished work "Off" leaves these out. Paused and recovery wait on a person. */
  ended: boolean;
}

/** How a run ended while the person was elsewhere. Running and waiting states are not news here. */
const AWAY_KINDS: Partial<Record<RunState, AwayKind>> = {
  completed: { verb: 'finished', tone: 'success', ended: true },
  failed: {
    verb: 'failed',
    detail: 'The run ended with an error',
    tone: 'error',
    action: 'Open',
    ended: true,
  },
  interrupted: {
    verb: 'was interrupted',
    detail: 'The run stopped before it finished',
    tone: 'warning',
    action: 'Open',
    ended: true,
  },
  recovery_required: {
    verb: 'needs recovery',
    detail: 'Open it to recover the run',
    tone: 'warning',
    action: 'Open',
    ended: false,
  },
  paused: {
    verb: 'paused',
    detail: 'The run is waiting to continue',
    tone: 'warning',
    action: 'Review',
    ended: false,
  },
  stopped: { verb: 'stopped', detail: 'The run was stopped', tone: 'stopped', ended: true },
  cancelled: { verb: 'stopped', detail: 'The run was cancelled', tone: 'stopped', ended: true },
};

export interface AwayRow {
  session: Session;
  verb: string;
  detail: string;
  tone: AwayTone;
  action?: string;
  ended: boolean;
  timestamp: string;
  /** Before "Mark all read": shown faint. */
  read: boolean;
}

function time(value: string | undefined): number {
  const parsed = Date.parse(value ?? '');
  return Number.isNaN(parsed) ? 0 : parsed;
}

/**
 * Conversations whose run ended since the person last had them open, newest
 * first. The open conversation, archived ones and those that need a response
 * (already in Needs you) are left out.
 */
export function awayRows(
  sessions: readonly Session[],
  attentions: Readonly<Record<string, SessionAttention>>,
  activeSessionId: string,
  reads: NotificationReads,
  workspaces: readonly Workspace[] = [],
): AwayRow[] {
  const since = time(reads.since);
  const readThrough = time(reads.readThrough);
  const names = new Map(
    workspaces.map((workspace) => [workspace.id, workspace.display_name || workspace.name]),
  );
  const rows: AwayRow[] = [];
  for (const session of sessions) {
    if (session.archived || session.id === activeSessionId) continue;
    if (attentions[session.id]?.total) continue;
    const kind = AWAY_KINDS[session.state];
    if (!kind) continue;
    const ended = time(session.updated_at);
    if (ended <= since || ended <= time(reads.seen[session.id])) continue;
    const place = names.get(session.workspace_id);
    const detail = kind.detail
      ? place
        ? `${kind.detail} in ${place}`
        : kind.detail
      : place
        ? `In ${place}`
        : 'Its turn is done';
    rows.push({
      session,
      verb: kind.verb,
      detail,
      tone: kind.tone,
      action: kind.action,
      ended: kind.ended,
      timestamp: session.updated_at,
      read: ended <= readThrough,
    });
  }
  return rows.sort((a, b) => time(b.timestamp) - time(a.timestamp));
}
