import { StatusDot, type SessionStatus } from '../../kit';
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

function ChildCard({
  child,
  runLabel,
  placement,
  duration,
  body,
  status,
}: {
  child: string;
  runLabel: string;
  placement: string;
  duration: string;
  body: string;
  status: SessionStatus;
}) {
  // A run placed elsewhere is not the same event as a local one (mirrors
  // background_exit's own placement convention).
  const remote = Boolean(placement) && placement !== 'local';
  // The prototype's own completed-card header carries no dot at all (design/
  // prototype/Clio Session.html, isTask) — only a transient run-handle pill
  // pulses while live. A plain successful completion is silent the same way
  // here; running and failed are the two states worth a mark.
  const showDot = status !== 'idle';

  return (
    <div className="part-childcard" data-testid="part-child-card">
      <div className="part-childcard__head">
        {showDot ? <StatusDot status={status} quiet={status !== 'running'} /> : null}
        <span className="part-childcard__name">{child}</span>
        {runLabel && runLabel !== child ? <span className="part-childcard__run">{runLabel}</span> : null}
        {remote ? <span className="part-childcard__host">{placement}</span> : null}
        {duration ? <span className="part-childcard__dur">{duration}</span> : null}
      </div>
      {body ? <div className="part-childcard__body">{body}</div> : null}
    </div>
  );
}
