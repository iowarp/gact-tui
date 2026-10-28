import { z } from 'zod';
import type { ClioTransport } from './transport.js';

/**
 * What one tool call did, as the service recorded it (`GET /v1/transforms/{call_id}`):
 * the instrument it ran (tool, arguments, command and script hash), the
 * environment it ran in (its tier and versions), and the files it read (`used`)
 * and wrote (`generated`), each with its hash. A study cites these calls: an
 * Observation through its lineage, a claim or Evidence entry through its
 * `analysis_call`.
 */

const text = z
  .string()
  .nullish()
  .transform((value) => value ?? '');

export const transformFileSchema = z
  .object({
    role: text,
    artifact_id: text,
    sha256: text,
    path: text,
    name: text,
    version: z.number().nullish(),
    external_ref: text,
  })
  .passthrough();

export type TransformFile = z.infer<typeof transformFileSchema>;

export const transformRecordSchema = z
  .object({
    call_id: z.string(),
    session_id: text,
    turn_id: text,
    status: text,
    agent_id: text,
    instrument: z
      .object({
        tool: text,
        args: z.unknown().optional(),
        cmd: text,
        script_hash: text,
        script_artifact_id: text,
      })
      .passthrough()
      .default({}),
    environment: z
      .object({
        tier: text,
        clio_version: text,
        lockfile_sha256: text,
        python_version: text,
        image_digest: text,
        model_id: text,
        os: text,
        arch: text,
      })
      .passthrough()
      .default({}),
    replay: text,
    replay_reason: text,
    used: z.array(transformFileSchema).catch([]).default([]),
    generated: z.array(transformFileSchema).catch([]).default([]),
    started_at: text,
    ended_at: text,
  })
  .passthrough();

export type TransformRecord = z.infer<typeof transformRecordSchema>;

/** The path a transform record is read from, shared by the live view and the exporter. */
export function transformRecordPath(callId: string): string {
  return `/v1/transforms/${encodeURIComponent(callId)}`;
}

/** Read the record of one tool call by its `call_id`. */
export async function readTransformRecord(
  transport: ClioTransport,
  callId: string,
  signal?: AbortSignal,
): Promise<TransformRecord> {
  const result = await transport.request({
    method: 'GET',
    path: transformRecordPath(callId),
    decode: (value) => z.object({ transform: transformRecordSchema }).parse(value),
    signal,
  });
  return result.transform;
}

/**
 * A study's reference to a tool call, as `call:<session>/<call_id>`, `<session>/<call_id>` or a bare
 * `call_id`, split into its parts (the session is empty when not named).
 */
export function parseCallReference(reference: string): { session: string; callId: string } {
  // As the service reads it: the `call:` prefix is optional.
  const value = reference.trim();
  const rest = value.startsWith('call:') ? value.slice('call:'.length) : value;
  const slash = rest.lastIndexOf('/');
  return slash < 0
    ? { session: '', callId: rest }
    : { session: rest.slice(0, slash), callId: rest.slice(slash + 1) };
}

/** The `call_id`s a study's entries cite: each Observation's sources and each analysis call. */
export function studyCitedCalls(entries: readonly unknown[]): string[] {
  const calls = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== 'string' || !value.trim()) return;
    const { callId } = parseCallReference(value);
    if (callId) calls.add(callId);
  };
  for (const raw of entries) {
    const entry = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined;
    const fields =
      entry?.fields && typeof entry.fields === 'object'
        ? (entry.fields as Record<string, unknown>)
        : undefined;
    if (!fields) continue;
    for (const row of Array.isArray(fields.lineage) ? fields.lineage : [])
      add((row as Record<string, unknown> | null)?.call_id);
    add(fields.analysis_call);
    for (const claim of Array.isArray(fields.claims) ? fields.claims : [])
      add((claim as Record<string, unknown> | null)?.analysis_call);
  }
  return [...calls];
}
