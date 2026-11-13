import type { RunState, Session, Workspace } from '@clio/core/v3';
import type { SessionAttention } from '@/lib/session-attention';
import type { NotificationReads } from '@/lib/notification-reads';
import { select, t } from '@lingui/core/macro';

export type AwayTone = 'success' | 'error' | 'warning' | 'stopped';

/** What happened to the run, as a stable id; `awaySentence` words it. */
export type AwayVerb = 'finished' | 'stopped' | 'needsRecovery' | 'paused';

/** The conversation's name with what happened to it: "Survey finished". */
export function awaySentence(verb: AwayVerb, title: string): string {
  return select(verb, {
    finished: `${title} finished`,
    stopped: `${title} stopped`,
    needsRecovery: `${title} needs recovery`,
    paused: `${title} paused`,
    other: `${title} stopped`,
  });
}

interface AwayKind {
  verb: AwayVerb;
  /** What happened, when the conversation's place is unknown. */
  detail?: string;
  tone: AwayTone;
  /** The row's one action word; a finished run needs none. */
  action?: string;
  /** The action retries the run. */
  retry?: boolean;
  /** The run is over: Finished work "Off" leaves these out. Paused and recovery wait on a person. */
  ended: boolean;
}

/** How a run ended while the person was elsewhere. Running and waiting states are not news here. */
const AWAY_KINDS: Partial<Record<RunState, AwayKind>> = {
  completed: { verb: 'finished', tone: 'success', ended: true },
  failed: {
    verb: 'stopped',
    detail: t`The run ended with an error`,
    tone: 'error',
    action: t`Retry`,
    retry: true,
    ended: true,
  },
  interrupted: {
    verb: 'stopped',
    detail: t`The run stopped before it finished`,
    tone: 'error',
    action: t`Retry`,
    retry: true,
    ended: true,
  },
  recovery_required: {
    verb: 'needsRecovery',
    detail: t`Open it to recover the run`,
    tone: 'warning',
    action: t`Open`,
    ended: false,
  },
  paused: {
    verb: 'paused',
    detail: t`The run is waiting to continue`,
    tone: 'warning',
    action: t`Review`,
    ended: false,
  },
  stopped: { verb: 'stopped', detail: t`The run was stopped`, tone: 'stopped', ended: true },
  cancelled: { verb: 'stopped', detail: t`The run was cancelled`, tone: 'stopped', ended: true },
};

export interface AwayRow {
  session: Session;
  verb: AwayVerb;
  detail: string;
  tone: AwayTone;
  action?: string;
  retry: boolean;
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
    // The run's own reason is not in the session yet, so the place is the detail.
    const detail = place ? t`In ${place}` : (kind.detail ?? t`Its turn is done`);
    rows.push({
      session,
      verb: kind.verb,
      detail,
      tone: kind.tone,
      action: kind.action,
      retry: Boolean(kind.retry),
      ended: kind.ended,
      timestamp: session.updated_at,
      read: ended <= readThrough,
    });
  }
  return rows.sort((a, b) => time(b.timestamp) - time(a.timestamp));
}
