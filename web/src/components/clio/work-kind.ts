export type WorkKind = 'agent' | 'question' | 'tool' | 'workflow';

/** Task kind comes from the recorded owner, never its title or prompt text. */
export function taskWorkKind(kind: string): WorkKind {
  if (kind === 'Subagent' || kind === 'Session') return 'agent';
  if (kind === 'Question') return 'question';
  if (kind === 'Workflow') return 'workflow';
  return 'tool';
}
