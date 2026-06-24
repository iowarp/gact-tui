import type { SessionTask, UserQuestion } from '../wire/types.js';

export interface SessionSchedule {
  id: string;
  cron?: string;
  next_run_at?: string;
  enabled?: boolean;
  prompt?: string;
  [k: string]: unknown;
}

export interface SessionSchedulesResult {
  schedules: SessionSchedule[];
}

export interface CreateScheduleInput {
  cron: string;
  prompt: string;
  enabled?: boolean;
}

export interface CreateScheduleResult {
  id: string;
  [k: string]: unknown;
}

export interface AnswerSessionQuestionInput {
  answer?: string;
  selected_options?: string[];
  metadata?: Record<string, unknown>;
}

export interface SessionQuestionsResult {
  questions: UserQuestion[];
}

export interface SessionTasksResult {
  tasks: SessionTask[];
}

export interface CreateSessionTaskInput {
  title: string;
  status?: SessionTask['status'];
}

export type PatchSessionTaskInput = Partial<
  Pick<SessionTask, 'title' | 'status' | 'metadata'>
>;
