import { Chip } from '../../kit';
import type { WirePart } from '../registry';

export interface HandoffPartProps {
  part: WirePart;
  /** A returning handoff renders the child's answer rather than its question. */
  returned?: boolean;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined ? '' : String(v));

/**
 * Expert handoff — the prototype's `Call(child)` / child-return pair.
 *
 * The child name, its task id and its duration are the identity of a spawned
 * run, so they are rendered as chips rather than prose: they are handles, not
 * sentences.
 */
export function HandoffPart({ part, returned = false }: HandoffPartProps) {
  const child = str(part['expert'] ?? part['agent'] ?? part['name']);
  const taskId = str(part['task_id']);
  const duration = str(part['duration'] ?? part['elapsed']);
  const body = returned
    ? str(part['excerpt'] ?? part['result'] ?? part['text'])
    : str(part['question'] ?? part['task'] ?? part['text']);

  return (
    <div className="part-handoff" data-returned={returned ? 'true' : undefined}>
      <div className="part-handoff__head">
        <span className="part-handoff__label">{returned ? 'returned' : 'Call'}</span>
        <span className="part-handoff__child">{child}</span>
        {taskId ? <Chip title="task id">{taskId}</Chip> : null}
        {duration ? <Chip>{duration}</Chip> : null}
      </div>
      {body ? <p className="part-handoff__body">{body}</p> : null}
    </div>
  );
}
