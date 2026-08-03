/**
 * Owns the Solid resources backing the inspector panels (bindings, frames,
 * schedules, diffs). Exports {@link createChatSessionInspectorResources}.
 */
import { createEffect, createMemo, createResource, type Accessor } from 'solid-js';
import type { Client } from '@clio/core';
import type { SessionBindings } from '../components/InspectorBindings.js';
import type { ContextFrameRow } from '../components/InspectorFrames.js';
import type { ScheduleRow } from '../components/InspectorSchedules.js';
import type { SessionDiffRow } from '../components/InspectorDiffs.js';
import { loadSessionBindings } from './chatSessionBindingsData.js';

export interface ChatSessionInspectorResourceOptions {
  activeId: Accessor<string>;
  messageCount: Accessor<number>;
  client: Client;
}

export function createChatSessionInspectorResources(
  options: ChatSessionInspectorResourceOptions,
) {
  const [sessionTasksData, { refetch: refetchTasks }] = createResource(
    options.activeId,
    async (sid) => {
      if (!sid) return { tasks: [] };
      try {
        return await options.client.sessionTasks(sid);
      } catch {
        return { tasks: [] };
      }
    },
  );
  const sessionTasks = createMemo(() => sessionTasksData()?.tasks ?? []);

  const [attemptsData, { refetch: refetchAttempts }] = createResource(
    options.activeId,
    async (sid) => {
      if (!sid) return [];
      try {
        return (await options.client.listAttempts(sid)).attempts;
      } catch {
        return [];
      }
    },
  );
  createEffect(() => {
    void options.messageCount();
    if (options.activeId()) void refetchAttempts();
  });

  const [contextFilesData, { refetch: refetchContextFiles }] = createResource(
    options.activeId,
    async (sid) => {
      if (!sid) return { files: [] };
      try {
        return await options.client.sessionContextFiles(sid);
      } catch {
        return { files: [] };
      }
    },
  );
  const contextFiles = createMemo(() => contextFilesData()?.files ?? []);

  const [framesData, { refetch: refetchFrames }] = createResource(options.activeId, async (sid) => {
    if (!sid) return { frames: [] };
    try {
      return await options.client.sessionContextFrames(sid);
    } catch {
      return { frames: [] };
    }
  });
  const contextFrames = createMemo<ContextFrameRow[]>(() => framesData()?.frames ?? []);

  const [sessionDiffsData, { refetch: refetchSessionDiffs }] = createResource(
    options.activeId,
    async (sid) => {
      if (!sid) return { diffs: [] };
      try {
        return await options.client.sessionDiffs(sid);
      } catch {
        return { diffs: [] };
      }
    },
  );
  const sessionDiffs = createMemo<SessionDiffRow[]>(() => sessionDiffsData()?.diffs ?? []);

  const [schedulesData, { refetch: refetchSchedules }] = createResource(
    options.activeId,
    async (sid) => {
      if (!sid) return { schedules: [] };
      try {
        return await options.client.sessionSchedules(sid);
      } catch {
        return { schedules: [] };
      }
    },
  );
  const schedules = createMemo<ScheduleRow[]>(() => schedulesData()?.schedules ?? []);

  const [bindingsData, { refetch: refetchBindings }] = createResource(
    options.activeId,
    async (sid) => {
      if (!sid) return null;
      return loadSessionBindings(options.client, sid);
    },
  );
  const sessionBindings = createMemo<SessionBindings | null | undefined>(() => bindingsData());

  return {
    sessionTasks,
    attempts: attemptsData,
    contextFiles,
    contextFrames,
    sessionDiffs,
    schedules,
    sessionBindings,
    refetchTasks,
    refetchFrames,
    refetchContextFiles,
    refetchSessionDiffs,
    refetchSchedules,
    refetchBindings,
  };
}
