import { z } from 'zod';

export const workRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  state: z.enum(['active', 'paused', 'completed', 'stopped', 'superseded']),
  created_at: z.string(),
  iterations: z.number().int().nonnegative(),
  reason: z.string(),
});

export const workTodoSchema = z.object({
  content: z.string(),
  status: z.enum(['pending', 'in_progress', 'completed']),
});

export const workTodoSnapshotSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  items: z.array(workTodoSchema),
});

export const workScheduleHistorySchema = z.object({
  id: z.string(),
  question: z.string(),
  state: z.enum(['scheduled', 'paused', 'completed', 'stopped', 'deleted']),
  created_at: z.string(),
  ended_at: z.string(),
  recurring: z.boolean(),
  next_fire_at: z.string(),
  timezone: z.string(),
});

export const sessionWorkSchema = z.object({
  cursor: z.number().int().nonnegative(),
  goal: workRecordSchema.nullable(),
  loop: workRecordSchema.nullable(),
  goals: z.array(workRecordSchema),
  loops: z.array(workRecordSchema),
  goal_next_cursor: z.number().int().nullable(),
  loop_next_cursor: z.number().int().nullable(),
  todos: z.array(workTodoSchema),
  todo_history: z.array(workTodoSnapshotSchema).default([]),
  todo_history_next_cursor: z.number().int().nullable().default(null),
  schedule_history: z.array(workScheduleHistorySchema).default([]),
  schedule_history_next_cursor: z.number().int().nullable().default(null),
});

export type SessionWork = z.infer<typeof sessionWorkSchema>;
export type WorkRecord = z.infer<typeof workRecordSchema>;
export type WorkTodo = z.infer<typeof workTodoSchema>;
export type WorkTodoSnapshot = z.infer<typeof workTodoSnapshotSchema>;
export type WorkScheduleHistory = z.infer<typeof workScheduleHistorySchema>;
