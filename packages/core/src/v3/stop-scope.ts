import { z } from 'zod';

/**
 * What Stop does to the work a conversation started (CLIO `docs/design/stop-and-restart.md`).
 * `keep` ends the reply only; `stop` also cancels the open tasks it started.
 */
export type StopChildren = 'keep' | 'stop';

/** One open task a Stop with `children: 'stop'` would reach. */
export const stopScopeTaskSchema = z.object({
  handle: z.string(),
  kind: z.string(),
  label: z.string(),
  description: z.string().default(''),
  status: z.string(),
  activity: z.string().default(''),
  session_id: z.string(),
  created_at: z.string(),
});

export const stopScopeSchema = z.object({
  session_id: z.string(),
  open_children: z.array(stopScopeTaskSchema),
});

export type StopScopeTask = z.infer<typeof stopScopeTaskSchema>;
export type StopScope = z.infer<typeof stopScopeSchema>;
