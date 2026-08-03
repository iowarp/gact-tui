import type { WirePart } from '../registry';

export interface HandoffPartProps {
  part: WirePart;
  /** A returning handoff renders the child's answer rather than its question. */
  returned?: boolean;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined ? '' : String(v));

/**
 * Expert handoff — the prototype's `Call(child)` block.
 *
 * Structure is the prototype's, not an approximation of it: a `Call(child)`
 * heading, the question indented 18px beneath it, and the child's return as a
 * SEPARATE bordered card indented to the same 18px. The card is its own object
 * because a child's answer is a thing you can open, not a paragraph of the
 * parent's message.
 */
export function HandoffPart({ part, returned = false }: HandoffPartProps) {
  const child = str(part['expert'] ?? part['agent'] ?? part['name'] ?? part['child_agent']);
  const duration = str(part['duration'] ?? part['elapsed']);
  const question = str(part['question'] ?? part['task'] ?? part['text']);
  const answer = str(part['excerpt'] ?? part['result'] ?? part['text']);
  const running = part['status'] === 'running' || part['live_state'] === 'running';

  // A returning handoff has no question of its own — it IS the child card.
  if (returned) {
    return (
      <div className="part-handoff">
        <ChildCard child={child} duration={duration} body={answer} running={running} />
      </div>
    );
  }

  return (
    <div className="part-handoff">
      <p className="part-handoff__title">Call({child})</p>
      {question ? <p className="part-handoff__question">{question}</p> : null}
    </div>
  );
}

function ChildCard({
  child,
  duration,
  body,
  running,
}: {
  child: string;
  duration: string;
  body: string;
  running: boolean;
}) {
  return (
    <div className="part-childcard" data-testid="part-child-card">
      <div className="part-childcard__head">
        {running ? <span className="part-childcard__dot" aria-hidden="true" /> : null}
        <span className="part-childcard__name">{child}</span>
        {duration ? <span className="part-childcard__dur">{duration}</span> : null}
      </div>
      {body ? <div className="part-childcard__body">{body}</div> : null}
    </div>
  );
}
