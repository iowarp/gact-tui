/**
 * The prototype's shift-click RIGHT peek (goPkrd/goElsc with shiftKey →
 * setStack): a read-only view of a child session in the 480px detail slot.
 * The main transcript stays put and the composer keeps talking to whatever
 * it talked to before — reading, not steering. Steering is the CENTER
 * drill-in (plain click), which this view deliberately is not.
 *
 * The child renders through ChildFocusView — its own "prompt from …" fold,
 * the shared transcript grammar — which is read-only by construction (the
 * composer is owned by SessionView and never mounts here). ChildFocusView's
 * own status footer is suppressed here: this view's header already states
 * the child's status in its "AGENT · <status>" eyebrow row.
 */
import { useEffect, useState } from 'react';
import { mergeMessages, prependOlderPage, subscribeSessionMessageEvents, type Client, type Message } from '@clio/core';
import { Icon, StatusDot, ToolbarButton, type SessionStatus } from '../kit';
import { ChildFocusView } from './ChildFocusView';
import { applyMessageLifecycleEvent, backfillChildMessages, CHILD_PAGE_SIZE } from './messageEvents';
import './agentpeek.css';

/** The child session's raw status word mapped onto the shared dot vocabulary
 *  (the same mapping the delegation box uses: running pulses, failed is red,
 *  everything settled is the neutral idle dot). */
function dotStatus(status: string): SessionStatus {
  if (status === 'running') return 'running';
  if (status === 'failed' || status === 'error') return 'error';
  if (status === 'queued') return 'queued';
  return 'idle';
}

export interface AgentPeekViewProps {
  client: Client;
  /** The peeked child session. */
  sessionId: string;
  /** The child agent's name — the header names WHAT is being peeked. */
  agent: string;
  /** Names the delegating parent in the "prompt from …" fold. */
  parentLabel: string;
  onClose: () => void;
}

/** A read-only right-panel view of a child session; the header carries the
 *  AGENT eyebrow + the agent's name, with the live status as its own chip. */
export function AgentPeekView({ client, sessionId, agent, parentLabel, onClose }: AgentPeekViewProps) {
  const [view, setView] = useState<{ messages: Message[]; status: string } | null>(null);

  // Same live-ish contract as the center child view: an initial progressive
  // pull (round-6 paging ruling, 2026-08-06 — the same #232 idiom the main
  // transcript and ChildFocusView's own data source use: newest page first,
  // older pages backfilled silently in the background via the shared
  // `backfillChildMessages` helper), the child's own SSE wire for streamed
  // parts, and a poll backstop for everything the part events don't carry
  // (status transitions, adopted messages) — the poll now MERGES
  // (`mergeMessages`) rather than replacing, so it can never clobber the
  // progressively-loaded feed with a stale full re-read.
  useEffect(() => {
    let cancelled = false;
    setView(null);

    const pullFirst = async () => {
      try {
        const [first, row] = await Promise.all([
          client.messages(sessionId, { limit: CHILD_PAGE_SIZE }),
          Promise.resolve()
            .then(() => client.getSession(sessionId))
            .catch(() => null),
        ]);
        if (cancelled) return;
        setView({
          messages: first.messages ?? [],
          status: String((row as { status?: unknown } | null)?.status ?? ''),
        });
        const cursor = first.next_cursor ?? null;
        if (cursor) {
          void backfillChildMessages(client, sessionId, cursor, {
            onOlderPage: (older) =>
              setView((cur) => (cur ? { ...cur, messages: prependOlderPage(cur.messages, older) } : cur)),
            isStale: () => cancelled,
          });
        }
      } catch {
        if (!cancelled) setView({ messages: [], status: 'failed' });
      }
    };
    const reconcile = async () => {
      try {
        const [result, row] = await Promise.all([
          client.messages(sessionId),
          Promise.resolve()
            .then(() => client.getSession(sessionId))
            .catch(() => null),
        ]);
        if (cancelled) return;
        setView((cur) =>
          cur
            ? {
                messages: mergeMessages(cur.messages, result.messages ?? []),
                status: String((row as { status?: unknown } | null)?.status ?? cur.status),
              }
            : cur,
        );
      } catch {
        // Keeps whatever the progressive load/SSE stream already produced.
      }
    };

    void pullFirst();
    const subscription =
      typeof EventSource !== 'undefined'
        ? subscribeSessionMessageEvents(client.sseUrl(sessionId), (event) => {
            setView((cur) => {
              if (!cur) return cur;
              const next = applyMessageLifecycleEvent(cur.messages, event);
              return next ? { ...cur, messages: next } : cur;
            });
          })
        : null;
    const timer = window.setInterval(() => void reconcile(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      subscription?.close();
    };
  }, [client, sessionId]);

  const status = view?.status ?? '';
  return (
    <aside className="agentpeek" aria-label="Agent peek" data-testid="agent-peek">
      {/*
       * Two rows (final-sxs ledger #3), not the single chip-row this used to
       * be: an "AGENT · <status>" eyebrow naming WHAT is being peeked and its
       * live state in one glance, then a "session › <agent>" breadcrumb row
       * underneath. The StatusDot survives the restructure — it still rides
       * the eyebrow row, just no longer inside its own bordered chip.
       */}
      <header className="agentpeek__head">
        <div className="agentpeek__eyebrowrow">
          <span className="agentpeek__eyebrow" data-testid="agent-peek-eyebrow">
            AGENT{status ? ` · ${status}` : ''}
          </span>
          {status ? <StatusDot status={dotStatus(status)} quiet={status !== 'running'} /> : null}
          <span className="agentpeek__spacer" />
          <ToolbarButton
            label="Close peek"
            title="Close"
            iconOnly
            size="small"
            icon={<Icon name="x" size={11} />}
            onClick={onClose}
          />
        </div>
        <div className="agentpeek__crumbrow">
          <span className="agentpeek__crumblabel">session</span>
          <span className="agentpeek__crumbsep" aria-hidden="true">
            ›
          </span>
          <span className="agentpeek__name" data-testid="agent-peek-name">
            {agent}
          </span>
        </div>
      </header>
      <div className="agentpeek__body">
        {view ? (
          <ChildFocusView
            agent={agent}
            parentLabel={parentLabel}
            messages={view.messages}
            status={view.status}
            // This view's own eyebrow row above already states the child's
            // status — ChildFocusView's footer would only repeat it as a
            // trailing "<agent> · idle" line the prototype never shows here.
            showStatusFooter={false}
          />
        ) : (
          <p className="agentpeek__loading">Loading agent…</p>
        )}
      </div>
    </aside>
  );
}
