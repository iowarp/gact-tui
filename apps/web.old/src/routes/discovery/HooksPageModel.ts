/**
 * View-model / pure logic for Hooks Page: state shaping and helpers, no DOM. Key export `HOOK_EVENTS`.
 */
import type { HookEvent } from '@clio/core';

/** The six declarative-hook event kinds clio accepts (live x_clio_hook_events). */
export const HOOK_EVENTS: HookEvent[] = [
  'pre_tool',
  'post_tool',
  'pre_message',
  'post_message',
  'semantic_event',
  'on_error',
];

export type HookHandlerKind = 'command' | 'url';

export function capabilityFlagBag(
  caps: unknown,
): Record<string, unknown> | undefined {
  const c = caps as Record<string, unknown> | null;
  return (c?.['capabilities'] ?? c) as Record<string, unknown> | undefined;
}

export function runtimeHookBackend(flags: Record<string, unknown> | undefined): string {
  return (flags?.['x_clio_hook_backend'] as unknown as string | undefined) ?? 'none';
}

export function runtimeHookEvents(
  flags: Record<string, unknown> | undefined,
): Record<string, number> {
  return (flags?.['x_clio_hook_events'] as unknown as Record<string, number> | undefined) ?? {};
}

export function buildCreateHookBody(
  event: HookEvent,
  handlerKind: HookHandlerKind,
  value: string,
): { event: HookEvent; command: string } | { event: HookEvent; url: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return handlerKind === 'url'
    ? { event, url: trimmed }
    : { event, command: trimmed };
}
