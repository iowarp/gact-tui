/**
 * View-model / pure logic for Prompts Page: state shaping and helpers, no DOM. Key export `filterPrompts`.
 */
import type { PromptDef } from '@clio/core';

export function filterPrompts(prompts: PromptDef[], query: string): PromptDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return prompts;
  return prompts.filter(
    (prompt) =>
      prompt.id.toLowerCase().includes(q) ||
      (prompt.title ?? '').toLowerCase().includes(q) ||
      (prompt.description ?? '').toLowerCase().includes(q) ||
      (prompt.scope ?? '').toLowerCase().includes(q),
  );
}
