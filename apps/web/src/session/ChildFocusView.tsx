/**
 * The prototype's CENTER child view (proto-walk 04c/05b): a focused child
 * agent's own transcript for maximum reading + steering — `▸ prompt from
 * <parent>` folded at the top WHEN the child's first user message is a real
 * delegation brief (see {@link briefText}), then the child's transcript in
 * the shared grammar, then a status footer. The composer beneath it (owned
 * by SessionView) targets this child while focused.
 */
import { useState, type Ref } from 'react';
import type { Message } from '@clio/core';
import type { ActionCardAction } from '../transcript/parts/ActionCardPart';
import { formatDurationMs } from '../transcript/parts/HandoffPart';
import { Transcript } from '../transcript/Transcript';
import type { WirePart } from '../transcript/registry';
import './childfocus.css';

// Matches HandoffPart.tsx's own `delegateStatus()` classification exactly
// (and this file's existing `.childfocus__status[data-state=...]` CSS,
// childfocus.css) — only these two raw values earn the red "failed ✗"
// reading; every other settled value (idle, completed, cancelled, ...)
// falls to the neutral "completed ✓" reading, same as a delegation's own
// Call-box footer does.
const FAILED_STATUSES = new Set(['error', 'failed']);

export interface ChildFocusViewProps {
  agent: string;
  parentLabel: string;
  messages: Message[];
  status: string;
  onOpenChild?: ((handleId: string, agent: string, opts: { peek: boolean }) => void) | undefined;
  onOpenArtifact?: ((artifactId: string, name: string) => void) | undefined;
  /** An action_card's button click, forwarded straight to the inner
   *  `<Transcript>` — same "just forward it" convention as `onOpenChild`. */
  onCardAction?: ((part: WirePart, action: ActionCardAction) => void) | undefined;
  /** The child session's own `created_at`/`updated_at` (SessionView's
   *  `getSession` pull) — real wire timestamps the settled footer's
   *  duration is computed from, never a guessed number. Absent = the
   *  footer shows the status word alone, same as no duration on the wire. */
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
  /** AgentPeekView's read-only header already carries the child's status as
   *  its own "AGENT · <status>" eyebrow row (final-sxs ledger #3), so ITS
   *  mount of this view suppresses the footer entirely rather than stating
   *  the same status twice. The center view (SessionView) never sets this —
   *  it has no other status affordance, so the footer is its only one. */
  showStatusFooter?: boolean | undefined;
  /** Forwarded straight to the inner `<Transcript>`'s own scroll container
   *  (SessionView's shared "whichever center view is visible" ref) — the
   *  center-nav back/forward feature captures/restores scrollTop through
   *  this exactly the same way it does for the main transcript. */
  scrollContainerRef?: Ref<HTMLDivElement> | undefined;
  /** A one-level-back affordance in the brief row, alongside the existing
   *  breadcrumb ribbon (owner: "small on-screen back affordance ... if
   *  trivially consistent with the breadcrumb"). Absent = no button, same
   *  as today — AgentPeekView's read-only mount never passes this. */
  onBack?: (() => void) | undefined;
}

/**
 * A first user message is only a "delegation brief" — worth the special
 * collapsed `▸ prompt from <parent>` fold — when a PARENT TURN actually
 * handed it down at spawn time. Owner correction (clio#1218d): a SPOTTER-
 * style ARMED WATCHER is not a one-shot delegated child; its periodic wake
 * lands in its own session as an ordinary pushed user message (clio's
 * `_push_wake` -> `_start_background_user_turn` with no `metadata=` at all),
 * and folding that first wake into the delegation-brief object read as
 * internal spawn machinery leaking into the transcript. A genuine
 * delegation launch (clio's real `spawn_agent_task`/`spawn_agents_parallel`
 * path) stamps `metadata.agent_task_id` on that first message — the SAME
 * task id the parent's own Call box drilled in by — so this checks for that
 * marker rather than guessing from role/position alone. Its absence (a
 * watcher wake, or any other push with no delegation marker) falls through
 * to plain rendering: the message stays in `messages` and renders through
 * the ordinary <Transcript> path, same as any other user message.
 */
function isDelegationBrief(first: Message | undefined): boolean {
  if (!first || first.role !== 'user') return false;
  const metadata = first.metadata as Record<string, unknown> | undefined;
  const taskId = metadata?.['agent_task_id'];
  return typeof taskId === 'string' && taskId.length > 0;
}

function briefText(first: Message | undefined): string {
  if (!isDelegationBrief(first)) return '';
  const parts = (first!.parts ?? []) as { type?: string; text?: string }[];
  return parts
    .filter((p) => p.type === 'text' && p.text)
    .map((p) => p.text)
    .join('\n');
}

export function ChildFocusView({
  agent,
  parentLabel,
  messages,
  status,
  onOpenChild,
  onOpenArtifact,
  onCardAction,
  createdAt,
  updatedAt,
  showStatusFooter = true,
  scrollContainerRef,
  onBack,
}: ChildFocusViewProps) {
  const [briefOpen, setBriefOpen] = useState(false);
  const first = messages[0];
  const brief = briefText(first);
  const rest = brief ? messages.slice(1) : messages;
  const running = status === 'running';
  const failed = FAILED_STATUSES.has(status);

  // Real wire timestamps only — never a guessed number when either end is
  // missing (a session still settling its `updated_at`, an older backend
  // that never sent one, ...).
  const startedMs = createdAt ? Date.parse(createdAt) : NaN;
  const endedMs = updatedAt ? Date.parse(updatedAt) : NaN;
  const duration =
    !running && Number.isFinite(startedMs) && Number.isFinite(endedMs) && endedMs >= startedMs
      ? formatDurationMs(endedMs - startedMs)
      : '';

  // "completed ✓ <dur>" / "failed ✗ <dur>" — the same terminal vocabulary
  // MergedHandoff's own Call-box footer uses (HandoffPart.tsx), so a
  // delegation reads the same way whether it's a footer in the parent's
  // transcript or this child's own settled view (final-sxs ledger #2).
  const footerText = running
    ? `● ${agent} running`
    : status
      ? failed
        ? `failed ✗${duration ? ` ${duration}` : ''}`
        : `completed ✓${duration ? ` ${duration}` : ''}`
      : agent;

  return (
    <div className="childfocus" data-testid="child-focus-view">
      {onBack || brief ? (
        <div className="childfocus__toprow">
          {onBack ? (
            // One level back — the SAME transition as clicking the crumb
            // just before this one in the breadcrumb ribbon (both go
            // through navigateCenter), kept here as a closer-at-hand
            // affordance since the ribbon can be a long reach up top.
            <button
              type="button"
              className="childfocus__back"
              onClick={onBack}
              aria-label={`back to ${parentLabel}`}
              title={`back to ${parentLabel}`}
            >
              ‹ back
            </button>
          ) : null}
          {brief ? (
            <div className="childfocus__brief">
              <button
                type="button"
                className="childfocus__brieftoggle"
                onClick={() => setBriefOpen((v) => !v)}
                aria-expanded={briefOpen}
              >
                {briefOpen ? '▾' : '▸'} prompt from {parentLabel}
              </button>
              {briefOpen ? <pre className="childfocus__briefbody">{brief}</pre> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <Transcript
        messages={rest}
        {...(onOpenChild ? { onOpenChild } : {})}
        {...(onOpenArtifact ? { onOpenArtifact } : {})}
        {...(onCardAction ? { onCardAction } : {})}
        {...(scrollContainerRef ? { scrollContainerRef } : {})}
      />
      {/* Renders AFTER the transcript (and so after any return card inside
          it) — the settled duration is the LAST word on this child's own
          view, per the prototype's r4 pair. */}
      {showStatusFooter ? (
        <p className="childfocus__status" data-state={running ? 'running' : status}>
          {footerText}
        </p>
      ) : null}
    </div>
  );
}
