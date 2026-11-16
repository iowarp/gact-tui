import { z } from 'zod';

/**
 * clio-agent's `GET /v1/system/problem-report`: a diagnostic report for a person
 * who cannot open a terminal. The service redacts every string before it leaves
 * the computer; `text` is the same report as one plain-text document (what Copy
 * and Download carry). A missing piece is a typed `degradation`, never an empty
 * section.
 */
const degradationSchema = z.object({ reason: z.string(), message: z.string() }).nullable();

export const problemReportSchema = z.object({
  schema: z.string(),
  generated_at: z.string(),
  filename: z.string(),
  text: z.string(),
  about: z.object({
    version: z.string(),
    os: z.string(),
    platform: z.string().optional(),
    app_kind: z.enum(['desktop', 'web', 'unknown']),
    app_version: z.string().nullable().optional(),
    provider: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
  }),
  health: z.object({
    overall_status: z.enum(['ready', 'degraded', 'unavailable']).nullable(),
    ready_count: z.number().int().optional(),
    rows: z.array(
      z.object({
        name: z.string(),
        status: z.string(),
        summary: z.string(),
        reason: z.string().nullable().optional(),
        next_action: z.string().nullable().optional(),
        required: z.boolean().optional(),
      }),
    ),
    degradation: degradationSchema,
  }),
  logs: z.object({
    lines_requested: z.number().int(),
    max_lines: z.number().int(),
    sources: z.array(
      z.object({
        role: z.enum(['server', 'gact', 'desktop']),
        path: z.string(),
        status: z.enum(['ok', 'empty', 'unreadable']),
        message: z.string().nullable().optional(),
        earlier_lines: z.boolean(),
        lines: z.array(z.string()),
      }),
    ),
    searched: z.array(z.object({ role: z.string(), path: z.string(), reason: z.string() })),
    degradation: degradationSchema,
  }),
  conversation: z
    .object({
      id: z.string(),
      title: z.string().nullable().optional(),
      status: z.string().optional(),
      busy: z.boolean().nullable().optional(),
      message_count: z.number().int().optional(),
      messages_included: z.boolean(),
      recent_replies: z
        .array(
          z.object({
            message_id: z.string(),
            created_at: z.string(),
            outcome: z.enum(['failed', 'completed', 'empty']),
            error_code: z.string().nullable().optional(),
            error_message: z.string().nullable().optional(),
          }),
        )
        .optional(),
      degradation: degradationSchema.optional(),
    })
    .nullable(),
  manifest: z.array(z.object({ section: z.string(), title: z.string(), contents: z.string() })),
  redaction: z.array(z.object({ rule: z.string(), description: z.string(), count: z.number() })),
});

export type ProblemReport = z.infer<typeof problemReportSchema>;

export interface ProblemReportRequest {
  /** Log lines per file, newest last (the service allows 1 to 5000; default 500). */
  lines?: number;
  /** A conversation the person picked. */
  sessionId?: string;
  /** That conversation's message text; off unless the person ticks it. */
  includeMessages?: boolean;
  client?: 'desktop' | 'web';
  clientVersion?: string;
}

export function problemReportQuery(input: ProblemReportRequest): string {
  const query = new URLSearchParams();
  if (input.lines) query.set('lines', String(input.lines));
  if (input.sessionId) query.set('session_id', input.sessionId);
  if (input.sessionId && input.includeMessages) query.set('include_messages', 'true');
  if (input.client) query.set('client', input.client);
  if (input.clientVersion) query.set('client_version', input.clientVersion);
  return query.toString();
}
