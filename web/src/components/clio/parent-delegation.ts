import type { MessageBlock } from '@clio/core/v3';

type Delegation = Extract<MessageBlock, { type: 'injection' }>;

/** Only recorded delegation entries are parent prompts; ordinary injections retain their role. */
export function isParentDelegation(
  block: MessageBlock,
): block is Delegation & { source: 'delegation' } {
  return block.type === 'injection' && block.source === 'delegation';
}

/** Read the assignment from a recognized envelope, preserving the complete original below. */
export function delegationPrompt(text: string): string {
  const body = /^\[(?:CLIO|Agent session [^;\]\n]+); delegation; /u.test(text)
    ? text.slice(text.indexOf('\n') + 1)
    : text;
  try {
    const value: unknown = JSON.parse(body);
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      if (typeof record.assignment === 'string') return record.assignment;
      if (typeof record.question === 'string') return record.question;
    }
  } catch {
    // A plain-text delegation already is the original prompt.
  }
  return text;
}
