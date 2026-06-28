/**
 * Pure helpers for the Inspector drawer: which tabs have content, the default
 * tab, and the per-tab content predicates driven off the selected message.
 */
import type { FileDiff, Message } from '@clio/core';
import type { InspectorTab } from './InspectorDrawerTypes.js';

export interface InspectorContentState {
  hasRunData: boolean;
  hasTimeline: boolean;
  hasAttempts: boolean;
  hasTools: boolean;
  hasDiffs: boolean;
  hasThinking: boolean;
  hasTasks: boolean;
  hasContextFiles: boolean;
  hasFrames: boolean;
  hasSchedules: boolean;
  hasBindings: boolean;
  hasIntegrations: boolean;
}

export const INSPECTOR_TAB_LABEL: Record<InspectorTab, string> = {
  turn: 'Turn',
  timeline: 'Timeline',
  attempts: 'Attempts',
  tools: 'Tools',
  diffs: 'Diffs',
  thinking: 'Thinking',
  tasks: 'Tasks',
  context: 'Context',
  frames: 'Frames',
  schedules: 'Schedules',
  bindings: 'Bindings',
  health: 'Health',
};

export function availableInspectorTabs(state: InspectorContentState): InspectorTab[] {
  const out: InspectorTab[] = [];
  if (state.hasRunData) out.push('turn');
  if (state.hasTimeline) out.push('timeline');
  if (state.hasAttempts) out.push('attempts');
  if (state.hasTools) out.push('tools');
  if (state.hasDiffs) out.push('diffs');
  if (state.hasThinking) out.push('thinking');
  if (state.hasTasks) out.push('tasks');
  if (state.hasContextFiles) out.push('context');
  if (state.hasFrames) out.push('frames');
  if (state.hasSchedules) out.push('schedules');
  if (state.hasBindings) out.push('bindings');
  if (state.hasIntegrations) out.push('health');
  return out;
}

export function inspectorHasAnyContent(state: InspectorContentState): boolean {
  return availableInspectorTabs(state).length > 0;
}

export function resolveInspectorTab(
  tabs: readonly InspectorTab[],
  stickyTab: InspectorTab | null,
  persistedTab: string,
): InspectorTab {
  if (tabs.length === 0) return 'turn';
  const wanted = stickyTab ?? (persistedTab as InspectorTab);
  if (tabs.includes(wanted)) return wanted;
  return tabs[0] ?? 'turn';
}

export interface InspectorBindingsPresence {
  availableBlueprints: unknown[];
  availablePacks: unknown[];
  blueprint_id: string | null;
  pack_id: string | null;
}

export interface InspectorContentInput {
  message: Message | null;
  model?: string;
  tokens?: { input?: number; output?: number; total?: number };
  costUsd: number;
  toolCallCount: number;
  integrationCount?: number;
  taskCount?: number;
  contextFileCount?: number;
  frameCount?: number;
  sessionDiffCount?: number;
  scheduleCount?: number;
  canCreateSchedule?: boolean;
  attemptsCount?: number;
  bindings?: InspectorBindingsPresence;
  semanticRowCount?: number;
}

export function inspectorHasRunData(input: {
  message: Message | null;
  model?: string;
  tokens?: { input?: number; output?: number; total?: number };
  costUsd: number;
}): boolean {
  return Boolean(
    input.message?.stop_reason ||
      input.model ||
      (input.tokens?.input ?? 0) + (input.tokens?.output ?? 0) > 0 ||
      input.costUsd > 0,
  );
}

export function messageHasThinking(message: Message | null): boolean {
  return Boolean(message?.parts?.some((part) => part.type === 'thinking'));
}

export function messageHasDiffs(message: Message | null): boolean {
  return Boolean(message?.parts?.some((part) => part.type === 'file_diff'));
}

export function messageHasTimelineParts(message: Message | null): boolean {
  return Boolean(message && message.parts.length > 0);
}

export function bindingsHaveContent(bindings?: InspectorBindingsPresence): boolean {
  return Boolean(
    bindings &&
      (bindings.availableBlueprints.length > 0 ||
        bindings.availablePacks.length > 0 ||
        bindings.blueprint_id !== null ||
        bindings.pack_id !== null),
  );
}

export function messageFileDiffParts(message: Message | null): FileDiff[] {
  return (message?.parts ?? []).filter((part): part is FileDiff => part.type === 'file_diff');
}

export function inspectorContentState(input: InspectorContentInput): InspectorContentState {
  const hasSemantic = (input.semanticRowCount ?? 0) > 0;
  return {
    hasRunData: inspectorHasRunData(input),
    hasTimeline: messageHasTimelineParts(input.message) || hasSemantic,
    hasAttempts: (input.attemptsCount ?? 0) > 0,
    hasTools: input.toolCallCount > 0,
    hasDiffs: messageHasDiffs(input.message) || (input.sessionDiffCount ?? 0) > 0,
    hasThinking: messageHasThinking(input.message),
    hasTasks: (input.taskCount ?? 0) > 0,
    hasContextFiles: (input.contextFileCount ?? 0) > 0,
    hasFrames: (input.frameCount ?? 0) > 0,
    hasSchedules: (input.scheduleCount ?? 0) > 0 || Boolean(input.canCreateSchedule),
    hasBindings: bindingsHaveContent(input.bindings),
    hasIntegrations: (input.integrationCount ?? 0) > 0,
  };
}
