import type { Message } from '@clio/core/v3';
import { isParentDelegation } from './parent-delegation';

/** Group consecutive harness entries with the response immediately following them. */
export function placeHarnessInjections(messages: readonly Message[]): {
  before: ReadonlyMap<string, readonly Message[]>;
  grouped: ReadonlySet<string>;
} {
  const before = new Map<string, readonly Message[]>();
  const grouped = new Set<string>();
  let pending: Message[] = [];
  for (const message of messages) {
    if (pending.length && pending[0]?.session_id !== message.session_id) pending = [];
    if (
      message.role === 'system' &&
      message.blocks.length > 0 &&
      !message.blocks.some(isParentDelegation) &&
      message.blocks.every((block) => block.type === 'injection')
    ) {
      pending.push(message);
      continue;
    }
    if (message.role === 'assistant' && pending.length) {
      before.set(message.id, pending);
      for (const entry of pending) grouped.add(entry.id);
    }
    pending = [];
  }
  return { before, grouped };
}
