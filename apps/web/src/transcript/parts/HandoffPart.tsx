import { useState } from 'react';
import { StatusDot, type SessionStatus } from '../../kit';
import { Markdown } from '../markdown';
import type { WirePart } from '../registry';

export interface HandoffPartProps {
  part: WirePart;
  /** A returning handoff renders the child's answer rather than its question. */
  returned?: boolean;
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
      {isExpertHandoff && handleId ? (
        <HandlePill handleId={handleId} status={status} rawState={rawState} />
      ) : null}
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
  /** The `delegate.started` part — carries `metadata.question` (the brief). */
  started?: WirePart;
  /** The terminal part (completed/failed/superseded) — carries `metadata.output`. */
  terminal?: WirePart;
  /** When present, the RESULT BOX becomes the prototype's open-agent target. */
  onOpenChild?: (handleId: string, agent: string, opts: { peek: boolean }) => void;
}

/**
 * ONE Call block per delegation (the prototype's grammar): the started and
 * terminal `expert_handoff` parts of one handle merge into a single
 * `Call(child)` heading, one brief, one handle pill at the FINAL state, and
 * one child card carrying the child's answer with its duration. Rendering
 * each stage as its own full block duplicated every Call and drew an empty
 * running card next to the completed one — the "unreadable transcript".
 */
export function MergedHandoff({ started, terminal, onOpenChild }: MergedHandoffProps) {
  const final = terminal ?? started;
  if (!final) return null;
  const startedMeta = started ? metadataOf(started) : {};
  const finalMeta = metadataOf(final);
  const child = str(
    final['child_agent'] ?? final['expert'] ?? final['agent'] ?? started?.['child_agent'],
  );
  const runLabel = str(final['run_label'] ?? started?.['run_label']);
  const placement = str(final['placement'] ?? started?.['placement']);
  const handleId = str(final['handle_id'] ?? started?.['handle_id']);
  const rawState = str(final['status'] ?? final['live_state']).toLowerCase();
  const status = delegateStatus(final, Boolean(terminal));
  const question = str(startedMeta['question'] ?? finalMeta['question']);
  const answer = terminal ? str(finalMeta['output']) : '';
  const durationRaw = Number(terminal?.['duration_ms'] ?? 0);
  const duration = formatDurationMs(durationRaw) || str(final['duration'] ?? final['elapsed']);

  return (
    <div className="part-handoff">
      <p className="part-handoff__title">Call({child})</p>
      {question ? <ClampedBrief text={question} /> : null}
      {handleId ? <HandlePill handleId={handleId} status={status} rawState={rawState} /> : null}
      <ChildCard
        child={child}
        runLabel={runLabel}
        placement={placement}
        duration={duration}
        body={answer}
        status={status}
        {...(onOpenChild && handleId
          ? {
              onOpen: (peek: boolean) => onOpenChild(handleId, child, { peek }),
              openTitle:
                status === 'running'
                  ? 'Open live agent · shift-click to peek in the side panel'
                  : 'Open agent · shift-click to peek in the side panel',
            }
          : {})}
      />
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

/**
 * The prototype's optional `sg.handle` pill (design/prototype/Clio Session
 * .html ~8451822): a pulsing dot while running, the real handle id, and a
 * colour-coded state word — the SAME compact-pill box as the async-injection
 * pill (padding 2px 9px, `--t-sf2` background, `--t-bd35` border, 6px radius,
 * mono 11.5px), base text cyan per the prototype's own style.
 *
 * `rawState` is the wire's own literal `status`/`live_state` string
 * ("running" / "completed" / "delegate.failed" → normalised by the caller),
 * never invented copy — the derived-status fallback only covers a
 * hypothetical part missing both fields entirely.
 *
 * Deliberately non-interactive: the prototype's pill opens the observability
 * layer's runs tab on click (`role="button"`, a real destination this app
 * already has — SessionView's `onOpenAsync`), but wiring that click needs a
 * callback threaded through the part-registry's pure `(part) => ReactNode`
 * contract every kind shares. That's a shared-architecture change, not a
 * one-off exception here — deferred alongside the child-card click (E9)
 * rather than adding an affordance only this one pill can honour.
 */
function HandlePill({
  handleId,
  status,
  rawState,
}: {
  handleId: string;
  status: SessionStatus;
  rawState: string;
}) {
  const label = rawState || (status === 'running' ? 'running' : status === 'error' ? 'failed' : 'done');
  return (
    <span className="part-handle" data-testid="part-handle">
      {status === 'running' ? <span className="part-handle__dot" aria-hidden="true" /> : null}
      <span className="part-handle__id">{handleId}</span>
      <span className="part-handle__state" data-tone={status}>
        {label}
      </span>
    </span>
  );
}
