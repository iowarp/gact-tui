import { z } from 'zod';

export const toolPresentationSchema = z.object({
  action: z.string().optional(),
  subject: z.string().optional(),
  summary: z.string(),
  blocks: z.array(
    z.object({
      id: z.string(),
      type: z.enum([
        'text',
        'markdown',
        'code',
        'diff',
        'terminal',
        'link',
        'check',
        'media',
        'item',
        'workspace_file',
      ]),
      media_type: z.string().optional(),
      text: z.string().optional(),
      label: z.string().optional(),
      language: z.string().optional(),
      // "workspace_file" only: the workspace-relative identity of a file the
      // agent inspected via view_image/view_pdf. Never carries bytes -- the
      // client fetches and previews the file itself, keyed by workspace_id +
      // path, and verifies it is still the same file via sha256.
      workspace_id: z
        .string()
        .nullish()
        .transform((value) => value ?? undefined),
      path: z
        .string()
        .nullish()
        .transform((value) => value ?? undefined),
      sha256: z
        .string()
        .nullish()
        .transform((value) => value ?? undefined),
      pages: z
        .array(z.number().int().positive())
        .nullish()
        .transform((value) => value ?? undefined),
      target: z
        .enum(['artifact', 'resource', 'session', 'url', 'file', 'work', 'surface'])
        .optional(),
      state: z.enum(['pending', 'in_progress', 'completed']).optional(),
      previous_state: z.enum(['pending', 'in_progress', 'completed']).optional(),
      change: z.enum(['added', 'removed', 'status_changed', 'unchanged']).optional(),
      uri: z.string().optional(),
      command: z.string().optional(),
      exit_code: z.number().nullable().optional(),
      timed_out: z.boolean().optional(),
      stream_offset: z.number().int().nonnegative().optional(),
      content_ref: z
        .object({
          session_id: z.string(),
          call_id: z.string(),
          block_id: z.string(),
          cursor: z.number().int().nonnegative(),
          total_chars: z.number().int().nonnegative(),
        })
        .optional(),
      status: z.string().optional(),
      detail: z.string().optional(),
      duration_ms: z.number().nonnegative().optional(),
      items: z.array(z.string()).optional(),
      action_label: z.string().optional(),
      result_kind: z.enum(['snapshot', 'completion', 'message']).optional(),
      severity: z.enum(['info', 'warning', 'error']).optional(),
    }),
  ),
  status: z.string().optional(),
  diagnostic: z.string().optional(),
});

export const toolPresentationDeltaSchema = z.object({
  call_id: z.string(),
  block_id: z.string(),
  offset: z.number().int().nonnegative(),
  sequence: z.number().int().nonnegative(),
  channel: z.enum(['stdout', 'stderr']),
  text: z.string(),
});
