import { z } from 'zod';

export const workRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  state: z.enum(['active', 'paused', 'completed', 'stopped', 'superseded']),
  created_at: z.string(),
  iterations: z.number().int().nonnegative(),
  reason: z.string(),
});

export const sessionWorkSchema = z.object({
  cursor: z.number().int().nonnegative(),
  goal: workRecordSchema.nullable(),
  loop: workRecordSchema.nullable(),
  goals: z.array(workRecordSchema),
  loops: z.array(workRecordSchema),
  goal_next_cursor: z.number().int().nullable(),
  loop_next_cursor: z.number().int().nullable(),
  todos: z.array(
    z.object({ content: z.string(), status: z.enum(['pending', 'in_progress', 'completed']) }),
  ),
});

export type SessionWork = z.infer<typeof sessionWorkSchema>;
export type WorkRecord = z.infer<typeof workRecordSchema>;
