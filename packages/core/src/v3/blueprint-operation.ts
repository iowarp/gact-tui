import { z } from 'zod';

/** Durable progress from the connected CLIO, independent of one browser request. */
export const blueprintOperationSchema = z.object({
  id: z.string(),
  label: z.string(),
  status: z.string(),
  target: z.record(z.string(), z.string()).default({}),
  started_at: z.string().optional(),
  finished_at: z.string().optional(),
  error: z.string().optional(),
  revision: z.string().optional(),
  installed: z
    .array(
      z.object({
        id: z.string(),
        identity: z.string(),
        version: z.string(),
        checksum: z.string(),
        runtime_checks: z
          .array(
            z.object({
              namespace: z.string(),
              workspace: z.string().optional(),
              status: z.string(),
              tool_count: z.number().optional(),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
  skipped: z
    .array(z.object({ id: z.string(), reason: z.string().optional() }).passthrough())
    .default([]),
});

export type BlueprintOperation = z.infer<typeof blueprintOperationSchema>;

export function blueprintOperationPending(operation?: BlueprintOperation): boolean {
  return Boolean(
    operation && ['waiting_for_turns', 'preparing', 'applying'].includes(operation.status),
  );
}
