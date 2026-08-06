/**
 * The prototype's CENTER child view (proto-walk 04c/05b): a focused child
 * agent's own transcript for maximum reading + steering — `▸ prompt from
 * <parent>` folded at the top (the child's first user message IS the
 * delegation brief), then the child's transcript in the shared grammar, then
 * a status footer. The composer beneath it (owned by SessionView) targets
 * this child while focused.
 */
import { useState } from 'react';
import type { Message } from '@clio/core';
import { Transcript } from '../transcript/Transcript';
import { formatDurationMs } from '../transcript/parts/HandoffPart';
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
}

function briefText(first: Message | undefined): string {
  if (!first || first.role !== 'user') return '';
  const parts = (first.parts ?? []) as { type?: string; text?: string }[];
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
  createdAt,
  updatedAt,
  showStatusFooter = true,
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
      <Transcript
        messages={rest}
        {...(onOpenChild ? { onOpenChild } : {})}
        {...(onOpenArtifact ? { onOpenArtifact } : {})}
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
