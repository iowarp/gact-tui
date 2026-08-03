/**
 * Aggregates the inspector panel's derived data for the active session.
 * Exports {@link createChatSessionInspectorData}.
 */
import type { Accessor } from 'solid-js';
import type { Client } from '@clio/core';
import type { ToastInput } from '../components/Toast.js';
import { createChatSessionBindingActions } from './chatSessionBindingActions.js';
import { createChatSessionContextFileActions } from './chatSessionContextFileActions.js';
import { createChatSessionDiffActions } from './chatSessionDiffActions.js';
import { createChatSessionInspectorActions } from './chatSessionInspectorActions.js';
import { createChatSessionInspectorResources } from './chatSessionInspectorResources.js';
import { createChatSessionScheduleActions } from './chatSessionScheduleActions.js';

export interface ChatSessionInspectorDataOptions {
  activeId: Accessor<string>;
  messageCount: Accessor<number>;
  activeWorkspaceId: Accessor<string | undefined>;
  client: Client;
  toastPush: (input: ToastInput) => number;
  failToast: (title: string, error: unknown, retry?: () => void) => void;
}

export function createChatSessionInspectorData(options: ChatSessionInspectorDataOptions) {
  const resources = createChatSessionInspectorResources(options);

  const inspectorActions = createChatSessionInspectorActions({
    activeId: options.activeId,
    client: options.client,
    failToast: options.failToast,
    refetchTasks: resources.refetchTasks,
  });

  const diffActions = createChatSessionDiffActions({
    activeId: options.activeId,
    client: options.client,
    toastPush: options.toastPush,
    failToast: options.failToast,
    refetchSessionDiffs: resources.refetchSessionDiffs,
  });

  const contextFileActions = createChatSessionContextFileActions({
    activeId: options.activeId,
    activeWorkspaceId: options.activeWorkspaceId,
    client: options.client,
    toastPush: options.toastPush,
    failToast: options.failToast,
    refetchContextFiles: resources.refetchContextFiles,
  });

  const bindingActions = createChatSessionBindingActions({
    activeId: options.activeId,
    client: options.client,
    failToast: options.failToast,
    refetchBindings: resources.refetchBindings,
  });

  const scheduleActions = createChatSessionScheduleActions({
    activeId: options.activeId,
    client: options.client,
    toastPush: options.toastPush,
    failToast: options.failToast,
    refetchSchedules: resources.refetchSchedules,
  });

  return {
    sessionTasks: resources.sessionTasks,
    attempts: resources.attempts,
    contextFiles: resources.contextFiles,
    contextFrames: resources.contextFrames,
    sessionDiffs: resources.sessionDiffs,
    schedules: resources.schedules,
    sessionBindings: resources.sessionBindings,
    refetchFrames: resources.refetchFrames,
    refetchContextFiles: resources.refetchContextFiles,
    refetchSessionDiffs: resources.refetchSessionDiffs,
    refetchBindings: resources.refetchBindings,
    cycleTaskStatus: inspectorActions.cycleTaskStatus,
    previewContextFile: contextFileActions.previewContextFile,
    loadFrameDetail: inspectorActions.loadFrameDetail,
    applyAllDiffs: diffActions.applyAllDiffs,
    rejectAllDiffs: diffActions.rejectAllDiffs,
    bindBlueprint: bindingActions.bindBlueprint,
    bindExpertPack: bindingActions.bindExpertPack,
    createSchedule: scheduleActions.createSchedule,
    deleteSchedule: scheduleActions.deleteSchedule,
    pinFileToContext: contextFileActions.pinFileToContext,
    removeContextFile: contextFileActions.removeContextFile,
    cycleContextFileMode: contextFileActions.cycleContextFileMode,
  };
}
