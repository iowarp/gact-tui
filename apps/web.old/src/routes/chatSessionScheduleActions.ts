/**
 * Action factory for scheduling a session run. Exports
 * {@link createChatSessionScheduleActions}.
 */
import type { Accessor } from 'solid-js';
import type { Client } from '@clio/core';
import type { ToastInput } from '../components/Toast.js';

export interface ChatSessionScheduleActionsOptions {
  activeId: Accessor<string>;
  client: Pick<Client, 'createSchedule' | 'deleteSchedule'>;
  toastPush: (input: ToastInput) => number;
  failToast: (title: string, error: unknown, retry?: () => void) => void;
  refetchSchedules: () => unknown;
}

export function createChatSessionScheduleActions(options: ChatSessionScheduleActionsOptions) {
  async function createSchedule(body: { cron: string; prompt: string }) {
    const sid = options.activeId();
    if (!sid) return;
    try {
      await options.client.createSchedule(sid, body);
      void options.refetchSchedules();
      options.toastPush({
        tone: 'success',
        title: 'Schedule added',
        body: body.cron,
        duration: 2400,
      });
    } catch (error) {
      options.failToast('Could not add schedule', error, () => void createSchedule(body));
    }
  }

  async function deleteSchedule(scheduleId: string) {
    try {
      await options.client.deleteSchedule(scheduleId);
      void options.refetchSchedules();
    } catch (error) {
      options.failToast('Could not delete schedule', error, () => void deleteSchedule(scheduleId));
    }
  }

  return {
    createSchedule,
    deleteSchedule,
  };
}
