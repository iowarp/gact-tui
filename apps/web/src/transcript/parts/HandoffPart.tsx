import { useEffect, useState } from 'react';
import { StatusDot, type SessionStatus } from '../../kit';
import { Markdown } from '../markdown';
import type { WirePart } from '../registry';

export interface HandoffPartProps {
  part: WirePart;
  /** A returning handoff renders the child's answer rather than its question. */
  returned?: boolean;
}

/**
 * A RUNNING delegation's live preview: the child's own streamed text tail
 * (SessionView's `childPreviews`, resolved by handle_id) plus the task's
 * `created_at` the elapsed clock ticks against. Absent until a child-session
 * subscription resolves real text — the box never fabricates one.
 */
export interface ChildPreview {
  text: string;
  startedAt?: string;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined ? '' : String(v));

function metadataOf(part: WirePart): Record<string, unknown> {
  const meta = part['metadata'];
  return meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {};
}

/**
 * Maps the delegate's own status/stage onto the shared status vocabulary.
 *
 * `delegate.failed` is the real terminal signal (live-observed:
 * "delegate.failed, error_reason=agent_error") and must never fall through
 * to the neutral idle dot the way a completed run does — a failed child is
 * never visually identical to a successful one anywhere else in the
 * prototype, and this is the one place that rule was being broken.
 */
function delegateStatus(part: WirePart, returned: boolean): SessionStatus {
  const raw = str(part['status'] ?? part['live_state']).toLowerCase();
  const stage = str(part['stage']);
  if (raw === 'error' || raw === 'failed' || stage === 'delegate.failed') return 'error';
  if (!returned && (raw === 'running' || stage === 'delegate.started')) return 'running';
  return 'idle';
}

/**
 * Expert handoff — the prototype's `Call(child)` block.
 *
 * Structure is the prototype's, not an approximation of it: a `Call(child)`
 * heading, the question indented 18px beneath it, and the child's return as a
 * SEPARATE bordered card indented to the same 18px. The card is its own object
 * because a child's answer is a thing you can open, not a paragraph of the
 * parent's message.
 *
 * `expert_handoff` (the kind the backend actually emits for delegation —
 * `subagent_call`/`subagent_result` are a declared SPEC shape never yet
 * observed on a live wire) carries BOTH directions through this one part
 * type via `stage`, so it always shows the Call()+question AND the child
 * card together — the card's status dot is what tells running from failed
 * from done, not a structural swap between two shapes.
 */
export function HandoffPart({ part, returned = false }: HandoffPartProps) {
  const isExpertHandoff = part['type'] === 'expert_handoff';
  const meta = metadataOf(part);
  const child = str(part['expert'] ?? part['agent'] ?? part['name'] ?? part['child_agent']);
  const runLabel = str(part['run_label']);
  const placement = str(part['placement']);
  const duration = str(part['duration'] ?? part['elapsed']);
  // The prototype's optional isTask `sg.handle` pill (design/prototype/Clio
  // Session.html ~8451822, handleRows/hasHandle): live-verified across 10
  // delegate.started/delegate.completed pairs (2026-08) — clio-agent's real
  // expert_handoff wire carries `handle_id` on every sample, though the
  // bundled PROTOTYPE fixture (what a prior pass measured) never populates
  // its own `sg.handle`. The two are different questions; the app's live
  // wire answers the first one "yes".
  const handleId = str(part['handle_id']);
  const rawState = str(part['status'] ?? part['live_state']).toLowerCase();
  // expert_handoff's `text` is a router-only arrow summary ("main ->
  // geospatial"), never a question — the real question rides in
  // `metadata.question` (contract/testdata/observed-parts-v0.3.json). Reading
  // `text` here would leak that arrow prose onto the screen.
  const question = isExpertHandoff
    ? str(meta['question'])
    : str(part['question'] ?? part['task'] ?? part['text']);
  // Never fall back to `text` for the same reason: it is arrow prose, not an
  // answer excerpt. expert_handoff's own excerpt rides in `metadata.output`
  // (live-observed, delegate.completed) — the same place `question` rides
  // for delegate.started.
  const answer = isExpertHandoff
    ? str(meta['output'])
    : str(part['excerpt'] ?? part['result'] ?? part['summary']);
  const status = delegateStatus(part, returned);

  if (returned) {
    return (
      <div className="part-handoff">
        <ChildCard
          child={child}
          runLabel={runLabel}
          placement={placement}
          duration={duration}
          body={answer}
          status={status}
        />
      </div>
    );
  }

  return (
    <div className="part-handoff">
      <p className="part-handoff__title">Call({child})</p>
      {question ? <p className="part-handoff__question">{question}</p> : null}
      {isExpertHandoff ? (
        <ChildCard
          child={child}
          runLabel={runLabel}
          placement={placement}
          duration={duration}
          body={answer}
          status={status}
        />
      ) : null}
    </div>
  );
}

/** `72000` → `"1m 12s"`, `4300` → `"4.3s"` — the prototype's duration idiom. */
function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    const rounded = Math.round(totalSeconds * 10) / 10;
    return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}m ${seconds}s`;
}

export interface MergedHandoffProps {
  /** The delegation's ONE part (clean wire): started fields updated in place
   *  at the terminal; metadata carries the brief AND the output. */
  terminal: WirePart;
  /** When present, the box becomes the prototype's open-agent target. */
  onOpenChild?: (handleId: string, agent: string, opts: { peek: boolean }) => void;
  /** The child's live streamed text while this delegation is still running
   *  (SessionView's `childPreviews`, resolved by this box's own handle_id).
   *  Absent while no child text has arrived yet — the box never fabricates
   *  a preview, it just keeps showing the plain footer until one exists. */
  preview?: ChildPreview;
}

/**
 * ONE Call block per delegation (the prototype's grammar): the started and
 * terminal `expert_handoff` parts of one handle merge into a single
 * `Call(child)` heading, one brief, one handle pill at the FINAL state, and
 * one child card carrying the child's answer with its duration. Rendering
 * each stage as its own full block duplicated every Call and drew an empty
 * running card next to the completed one — the "unreadable transcript".
 */
export function MergedHandoff({ terminal, onOpenChild, preview }: MergedHandoffProps) {
  const [answerExpanded, setAnswerExpanded] = useState(false);
  const final = terminal;
  const finalMeta = metadataOf(final);
  const child = str(final['child_agent'] ?? final['expert'] ?? final['agent']);
  const runLabel = str(final['run_label']);
  const placement = str(final['placement']);
  const handleId = str(final['handle_id']);
  const rawState = str(final['status'] ?? final['live_state']).toLowerCase();
  const settled = str(final['stage']) !== 'delegate.started';
  const status = delegateStatus(final, settled);
  const question = str(finalMeta['question']);
  const answer = settled ? str(finalMeta['output']) : '';
  // The child's full return rides the wire; the box shows ~4 lines (owner:
  // 3-5) — expand in place, or open the box for the whole child transcript.
  const answerLong = answer.length > 320 || answer.split('\n').length > 4;
  const durationRaw = Number(final['duration_ms'] ?? 0);

  // The running elapsed clock: while the delegation streams, the wire's own
  // `duration_ms` isn't populated yet (it lands only at settle), so a live
  // "running (1m 22s)" reading ticks off the task's real `created_at`
  // (`preview.startedAt`) against a 1s interval clock instead. Settled boxes
  // never tick — they show the wire's own final duration exactly as before.
  const running = status === 'running';
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running || !preview?.startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [running, preview?.startedAt]);
  const startedAtMs = preview?.startedAt ? Date.parse(preview.startedAt) : NaN;
  const liveElapsedMs = running && Number.isFinite(startedAtMs) ? Math.max(0, now - startedAtMs) : undefined;
  const duration =
    (liveElapsedMs !== undefined ? formatDurationMs(liveElapsedMs) : '') ||
    formatDurationMs(durationRaw) ||
    str(final['duration'] ?? final['elapsed']);

  // The live preview tail (SessionView streams the child's own SSE wire into
  // it) only ever shows while running — a settled box always shows the
  // wire's real `metadata.output` instead, never a stale streamed fragment.
  const previewText = running ? (preview?.text ?? '') : '';

  const remote = Boolean(placement) && placement !== 'local';
  // ONE unified box (owner correction 2026-08-05 + prototype div.scpg): the
  // whole delegation — heading, brief, answer, status — is a single bordered
  // container, clickable as a whole (click → center, shift-click → right
  // peek). NO handle pill in this presentation.
  const interactive =
    onOpenChild && handleId
      ? {
          role: 'button' as const,
          tabIndex: 0,
          title:
            status === 'running'
              ? 'Open live agent · shift-click to peek in the side panel'
              : 'Open agent · shift-click to peek in the side panel',
          onClick: (e: { shiftKey: boolean }) => onOpenChild(handleId, child, { peek: Boolean(e.shiftKey) }),
          // Shift-click means "peek", but the browser's DEFAULT shift-mousedown
          // extends the native text selection from its last anchor to the click
          // point before our click handler ever runs. Killing the default at
          // mousedown kills the selection extension without harming the click.
          onMouseDown: (e: { shiftKey: boolean; preventDefault: () => void }) => {
            if (e.shiftKey) e.preventDefault();
          },
          onKeyDown: (e: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenChild(handleId, child, { peek: Boolean(e.shiftKey) });
            }
          },
          'data-interactive': 'true' as const,
        }
      : {};

  return (
    <div className="part-handoff">
      <p className="part-handoff__title">Call({child})</p>
      {question ? <ClampedBrief text={question} /> : null}
      <div
        className="part-handoff__box"
        data-testid="part-child-card"
        data-state={status}
        {...interactive}
      >
        <div className="part-childcard__head">
          {status !== 'idle' ? <StatusDot status={status} quiet={status !== 'running'} /> : null}
          {/* ONE identity token (owner: the head duplicated "geospatial
              geospatial #1") — the run label IS the name plus its ordinal. */}
          <span className="part-childcard__name">{runLabel || child}</span>
          {remote ? <span className="part-childcard__host">{placement}</span> : null}
          {/* The status line rides the head's top-right (owner request
              2026-08-05; prototype grammar: duration right-aligned in the
              head) — not a separate footer row under the answer. */}
          <span className="part-handoff__foot" data-state={status}>
            {status === 'running'
              ? `● running${duration ? ` (${duration})` : ''}`
              : status === 'error'
                ? `failed ✗${duration ? ` ${duration}` : ''}`
                : `completed ✓${duration ? ` ${duration}` : ''}`}
          </span>
        </div>
        {previewText ? (
          <div className="part-childcard__body part-childcard__body--preview" data-testid="part-childcard-preview">
            <span className="part-childcard__previewtext">{previewText}</span>
            <span className="part-childcard__cursor" aria-hidden="true">
              ▍
            </span>
          </div>
        ) : answer ? (
          <div
            className="part-childcard__body"
            data-clamped={answerLong && !answerExpanded ? 'true' : undefined}
          >
            <Markdown text={answer} />
          </div>
        ) : null}
        {answerLong ? (
          <button
            type="button"
            className="part-handoff__briefmore part-handoff__answermore"
            onClick={(e) => {
              e.stopPropagation();
              setAnswerExpanded((v) => !v);
            }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {answerExpanded ? 'show less' : 'show more'}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The delegation brief, clamped. The prototype renders its (short, fixture)
 * briefs unfolded; real briefs carry the parent's full grounded context and
 * run to hundreds of lines — a deliberate deviation: clamp at 6 lines with an
 * explicit expand, so the brief never buries the conversation.
 */
function ClampedBrief({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 420 || text.split('\n').length > 6;
  return (
    <div className="part-handoff__brief">
      <p
        className="part-handoff__question"
        data-clamped={long && !expanded ? 'true' : undefined}
      >
        {text}
      </p>
      {long ? (
        <button
          type="button"
          className="part-handoff__briefmore"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'show less' : 'show more'}
        </button>
      ) : null}
    </div>
  );
}

function ChildCard({
  child,
  runLabel,
  placement,
  duration,
  body,
  status,
  onOpen,
  openTitle,
}: {
  child: string;
  runLabel: string;
  placement: string;
  duration: string;
  body: string;
  status: SessionStatus;
  onOpen?: (peek: boolean) => void;
  openTitle?: string;
}) {
  // A run placed elsewhere is not the same event as a local one (mirrors
  // background_exit's own placement convention).
  const remote = Boolean(placement) && placement !== 'local';
  // The prototype's own completed-card header carries no dot at all (design/
  // prototype/Clio Session.html, isTask) — only a transient run-handle pill
  // pulses while live. A plain successful completion is silent the same way
  // here; running and failed are the two states worth a mark.
  const showDot = status !== 'idle';

  // Interactive ONLY when a real destination exists (the prototype's goCall:
  // click → center child view, shift-click → right peek). Without a handler
  // the card claims nothing — an affordance that does nothing is a lie.
  const interactive = onOpen
    ? {
        role: 'button' as const,
        tabIndex: 0,
        title: openTitle ?? 'Open agent · shift-click to peek in the side panel',
        onClick: (e: { shiftKey: boolean }) => onOpen(Boolean(e.shiftKey)),
        // Same guard as MergedHandoff: shift-mousedown's default is "extend
        // the native text selection", which must never fire on a peek click.
        onMouseDown: (e: { shiftKey: boolean; preventDefault: () => void }) => {
          if (e.shiftKey) e.preventDefault();
        },
        onKeyDown: (e: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen(Boolean(e.shiftKey));
          }
        },
        'data-interactive': 'true' as const,
      }
    : {};

  return (
    <div className="part-childcard" data-testid="part-child-card" {...interactive}>
      <div className="part-childcard__head">
        {showDot ? <StatusDot status={status} quiet={status !== 'running'} /> : null}
        <span className="part-childcard__name">{child}</span>
        {runLabel && runLabel !== child ? <span className="part-childcard__run">{runLabel}</span> : null}
        {remote ? <span className="part-childcard__host">{placement}</span> : null}
        {duration ? <span className="part-childcard__dur">{duration}</span> : null}
      </div>
      {body ? (
        <div className="part-childcard__body">
          <Markdown text={body} />
        </div>
      ) : null}
    </div>
  );
}

