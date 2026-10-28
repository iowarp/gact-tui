import { z } from 'zod';
import { forwardCompatibleEnum } from './schema-utils.js';
import type { ClioTransport } from './transport.js';

/**
 * A study's science log (`GET /v1/sessions/{sid}/science-log`).
 *
 * The log is append-only: typed, linked entries written by the sessions of one
 * task tree (its branches). A session in no study answers `in_study: false`.
 * Every entry names the tool call that wrote it (`invocation`), so a reader can
 * return to the transcript turn behind it. Fields are kept as sent: the log
 * validates schema and references, and this client only reads them.
 */

export const scienceEntryTypeValues = [
  'question',
  'hypothesis',
  'experiment',
  'observation',
  'evidence',
  'reframe',
  'conclusion',
  'conflict',
  'view',
] as const;

export type ScienceEntryType = (typeof scienceEntryTypeValues)[number] | 'unknown';

export const scienceBranchRelationValues = ['root', 'fork', 'branch', 'step', 'delegated'] as const;

const text = z
  .string()
  .nullish()
  .transform((value) => value ?? '');

export const scienceLinkSchema = z
  .object({ relation: text, to: z.string(), by: z.string().nullish() })
  .passthrough();

export type ScienceLink = z.infer<typeof scienceLinkSchema>;

export const scienceEntrySchema = z
  .object({
    id: z.string(),
    study: text,
    branch: text,
    session: text,
    type: forwardCompatibleEnum(scienceEntryTypeValues),
    fields: z.record(z.unknown()).catch({}).default({}),
    links: z.array(scienceLinkSchema).catch([]).default([]),
    status: text,
    status_reason: z.string().nullish(),
    created_at: text,
    invocation: text,
  })
  .passthrough();

export type ScienceEntry = z.infer<typeof scienceEntrySchema>;

export const scienceBranchSchema = z
  .object({
    session_id: z.string(),
    title: text,
    agent: text,
    relation: forwardCompatibleEnum(scienceBranchRelationValues),
    parent_session_id: text,
    fork_of_session_id: text,
    workflow_step: text,
    node_folder: text,
    handle: text,
    task_status: text,
    note: text,
  })
  .passthrough();

export type ScienceBranch = z.infer<typeof scienceBranchSchema>;

/**
 * A dashboard attached to the study with a `view` entry (Addendum B): the owner
 * session's surface as it stands now, or `null` with a reason when the owner has
 * since deleted it.
 */
export const scienceViewSchema = z
  .object({
    entry: z.string(),
    session_id: z.string(),
    surface_id: text,
    title: text,
    purpose: text,
    serves: z.array(z.string()).catch([]).default([]),
    created_at: text,
    surface: z
      .record(z.unknown())
      .nullish()
      .transform((value) => value ?? null),
    reason: z.string().nullish(),
  })
  .passthrough();

export type ScienceView = z.infer<typeof scienceViewSchema>;

export const scienceLogSchema = z.union([
  z
    .object({
      session_id: z.string(),
      in_study: z.literal(true),
      study: text,
      root_session_id: text,
      branches: z.array(scienceBranchSchema).default([]),
      entries: z.array(scienceEntrySchema).default([]),
      views: z.array(scienceViewSchema).catch([]).default([]),
    })
    .passthrough(),
  z.object({ session_id: z.string(), in_study: z.literal(false) }).passthrough(),
]);

export type ScienceLog = z.infer<typeof scienceLogSchema>;
export type ScienceStudy = Extract<ScienceLog, { in_study: true }>;

/** Read the study a session belongs to, or `in_study: false`. */
export function readScienceLog(
  transport: ClioTransport,
  sessionId: string,
  signal?: AbortSignal,
): Promise<ScienceLog> {
  return transport.request({
    method: 'GET',
    path: `/v1/sessions/${encodeURIComponent(sessionId)}/science-log`,
    decode: (value) => scienceLogSchema.parse(value),
    signal,
  });
}

/** A live `science.entry` event's payload as an entry, or `undefined` when it is not one. */
export function decodeScienceEntry(value: unknown): ScienceEntry | undefined {
  const result = scienceEntrySchema.safeParse(value);
  return result.success ? result.data : undefined;
}
