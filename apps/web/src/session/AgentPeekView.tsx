/**
 * The prototype's shift-click RIGHT peek (goPkrd/goElsc with shiftKey →
 * setStack): a read-only view of a child session in the 480px detail slot.
 * The main transcript stays put and the composer keeps talking to whatever
 * it talked to before — reading, not steering. Steering is the CENTER
 * drill-in (plain click), which this view deliberately is not.
 *
 * The child renders through ChildFocusView — its own "prompt from …" fold,
 * the shared transcript grammar, the status footer — which is read-only by
 * construction (the composer is owned by SessionView and never mounts here).
 */
import { useEffect, useState } from 'react';
import { subscribeSessionMessageEvents, type Client, type Message } from '@clio/core';
import { Chip, Icon, StatusDot, ToolbarButton, type SessionStatus } from '../kit';
import { ChildFocusView } from './ChildFocusView';
import { applyMessageLifecycleEvent } from './messageEvents';
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

  // Same live-ish contract as the center child view: an initial pull, the
  // child's own SSE wire for streamed parts, and a poll backstop for
  // everything the part events don't carry (status transitions, adopted
  // messages).
  useEffect(() => {
    let cancelled = false;
    setView(null);
    const pull = async () => {
      try {
        const [result, row] = await Promise.all([
          client.messages(sessionId),
          Promise.resolve()
            .then(() => client.getSession(sessionId))
            .catch(() => null),
        ]);
        if (!cancelled) {
          setView({
            messages: result.messages ?? [],
            status: String((row as { status?: unknown } | null)?.status ?? ''),
          });
        }
      } catch {
        if (!cancelled) setView({ messages: [], status: 'failed' });
      }
    };
    void pull();
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
    const timer = window.setInterval(() => void pull(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      subscription?.close();
    };
  }, [client, sessionId]);

  const status = view?.status ?? '';
  return (
    <aside className="agentpeek" aria-label="Agent peek" data-testid="agent-peek">
      <header className="agentpeek__head">
        <Chip tone="accent">AGENT</Chip>
        <span className="agentpeek__name" data-testid="agent-peek-name">
          {agent}
        </span>
        {status ? (
          // The status is its OWN chip — dot + word, the same grammar as the
          // rail's session rows — never text glued onto the header label.
          <span className="agentpeek__status" data-state={status} data-testid="agent-peek-status">
            <StatusDot status={dotStatus(status)} quiet={status !== 'running'} />
            <span className="agentpeek__statusword">{status}</span>
          </span>
        ) : null}
        <span className="agentpeek__spacer" />
        <ToolbarButton
          label="Close peek"
          title="Close"
          iconOnly
          size="small"
          icon={<Icon name="x" size={11} />}
          onClick={onClose}
        />
      </header>
      <div className="agentpeek__body">
        {view ? (
          <ChildFocusView
            agent={agent}
            parentLabel={parentLabel}
            messages={view.messages}
            status={view.status}
          />
        ) : (
          <p className="agentpeek__loading">Loading agent…</p>
        )}
      </div>
    </aside>
  );
}
