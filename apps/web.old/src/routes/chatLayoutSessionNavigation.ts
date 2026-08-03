/**
 * Pure session-list navigation: selects the adjacent session (prev/next) for
 * keyboard-driven sidebar movement.
 */
import type { ChatLayoutShortcutsOptions } from './chatLayoutShortcutTypes.js';

export function selectAdjacentSession(
  eventKey: string,
  options: ChatLayoutShortcutsOptions,
) {
  const list = options.sessions();
  const index = list.findIndex((session) => session.id === options.activeId());
  if (index === -1) {
    const first = list[0];
    if (first) options.onSelect(first.id);
    return;
  }

  const nextIndex =
    eventKey === 'ArrowDown' ? (index + 1) % list.length : (index - 1 + list.length) % list.length;
  const target = list[nextIndex];
  if (!target) return;
  options.onSelect(target.id);
  queueMicrotask(() => {
    const el = document.querySelector(
      `[data-testid="session-row-${CSS.escape(target.id)}"]`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
}
