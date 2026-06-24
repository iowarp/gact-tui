import { describe, expect, it } from 'vitest';
import {
  availableInspectorTabs,
  INSPECTOR_TAB_LABEL,
  bindingsHaveContent,
  inspectorContentState,
  inspectorHasAnyContent,
  inspectorHasRunData,
  messageFileDiffParts,
  messageHasDiffs,
  messageHasThinking,
  messageHasTimelineParts,
  resolveInspectorTab,
  type InspectorContentState,
} from '../../src/components/InspectorDrawerModel.js';
import type { Message } from '@clio/core';

const EMPTY: InspectorContentState = {
  hasRunData: false,
  hasTimeline: false,
  hasAttempts: false,
  hasTools: false,
  hasDiffs: false,
  hasThinking: false,
  hasTasks: false,
  hasContextFiles: false,
  hasFrames: false,
  hasSchedules: false,
  hasBindings: false,
  hasIntegrations: false,
};

describe('InspectorDrawerModel', () => {
  it('derives tabs in the drawer display order', () => {
    expect(
      availableInspectorTabs({
        ...EMPTY,
        hasRunData: true,
        hasTimeline: true,
        hasAttempts: true,
        hasTools: true,
        hasDiffs: true,
        hasThinking: true,
        hasTasks: true,
        hasContextFiles: true,
        hasFrames: true,
        hasSchedules: true,
        hasBindings: true,
        hasIntegrations: true,
      }),
    ).toEqual([
      'turn',
      'timeline',
      'attempts',
      'tools',
      'diffs',
      'thinking',
      'tasks',
      'context',
      'frames',
      'schedules',
      'bindings',
      'health',
    ]);
  });

  it('resolves the active tab from sticky, persisted, and fallback state', () => {
    const tabs = ['timeline', 'tools'] as const;
    expect(resolveInspectorTab(tabs, 'tools', 'timeline')).toBe('tools');
    expect(resolveInspectorTab(tabs, null, 'timeline')).toBe('timeline');
    expect(resolveInspectorTab(tabs, null, 'turn')).toBe('timeline');
    expect(resolveInspectorTab([], null, 'tools')).toBe('turn');
  });

  it('detects empty content and exposes stable labels', () => {
    expect(inspectorHasAnyContent(EMPTY)).toBe(false);
    expect(inspectorHasAnyContent({ ...EMPTY, hasTimeline: true })).toBe(true);
    expect(INSPECTOR_TAB_LABEL.timeline).toBe('Timeline');
    expect(INSPECTOR_TAB_LABEL.health).toBe('Health');
  });

  it('derives content state from drawer inputs', () => {
    const message = {
      id: 'm1',
      role: 'assistant',
      stop_reason: 'end_turn',
      parts: [
        { type: 'thinking', text: 'thought' },
        { type: 'file_diff', path: 'a.ts', unified_diff: '--- a' },
      ],
    } as Message;
    expect(
      inspectorContentState({
        message,
        costUsd: 0,
        toolCallCount: 1,
        integrationCount: 1,
        taskCount: 1,
        contextFileCount: 1,
        frameCount: 1,
        sessionDiffCount: 1,
        scheduleCount: 0,
        canCreateSchedule: true,
        attemptsCount: 1,
        bindings: {
          availableBlueprints: [],
          availablePacks: [],
          blueprint_id: 'bp',
          pack_id: null,
        },
        semanticRowCount: 1,
      }),
    ).toEqual({
      hasRunData: true,
      hasTimeline: true,
      hasAttempts: true,
      hasTools: true,
      hasDiffs: true,
      hasThinking: true,
      hasTasks: true,
      hasContextFiles: true,
      hasFrames: true,
      hasSchedules: true,
      hasBindings: true,
      hasIntegrations: true,
    });
  });

  it('detects message and run-data predicates', () => {
    const emptyMessage = { id: 'm1', role: 'assistant', parts: [] } as unknown as Message;
    const thinkingMessage = {
      id: 'm2',
      role: 'assistant',
      parts: [{ type: 'thinking', text: 'thought' }],
    } as Message;
    const diffMessage = {
      id: 'm3',
      role: 'assistant',
      parts: [{ type: 'file_diff', path: 'a.ts', unified_diff: '--- a' }],
    } as Message;
    expect(inspectorHasRunData({ message: emptyMessage, costUsd: 0 })).toBe(false);
    expect(inspectorHasRunData({ message: emptyMessage, model: 'gpt', costUsd: 0 })).toBe(true);
    expect(inspectorHasRunData({ message: emptyMessage, tokens: { input: 1 }, costUsd: 0 })).toBe(true);
    expect(messageHasTimelineParts(emptyMessage)).toBe(false);
    expect(messageHasTimelineParts(thinkingMessage)).toBe(true);
    expect(messageHasThinking(thinkingMessage)).toBe(true);
    expect(messageHasDiffs(diffMessage)).toBe(true);
    expect(messageFileDiffParts(diffMessage)).toHaveLength(1);
  });

  it('preserves bindings and schedules presence rules', () => {
    expect(bindingsHaveContent(undefined)).toBe(false);
    expect(
      bindingsHaveContent({
        availableBlueprints: [],
        availablePacks: [],
        blueprint_id: null,
        pack_id: null,
      }),
    ).toBe(false);
    expect(
      bindingsHaveContent({
        availableBlueprints: ['bp'],
        availablePacks: [],
        blueprint_id: null,
        pack_id: null,
      }),
    ).toBe(true);
    expect(
      inspectorContentState({
        message: null,
        costUsd: 0,
        toolCallCount: 0,
        canCreateSchedule: true,
      }).hasSchedules,
    ).toBe(true);
  });
});
