import { TransportError, type ClioTransport, type TransportRequest } from './transport.js';
import { resolveSessionReference, readResolvedReferenceBytes } from './a2ui/reference-transport.js';
import type { ArtifactTableQueryResult } from './artifact-preview-repository.js';

export type SessionExportMode = 'transcript' | 'effects' | 'full';
export interface SessionReviewSnapshot {
  responses: Record<
    string,
    {
      json?: unknown;
      bytes?: string;
      error?: { message: string; status?: number; code?: string; details?: unknown };
    }
  >;
  sessions: Record<string, unknown[]>;
  tables: Record<string, Record<string, unknown>>;
  failures: { path: string; message: string }[];
}

function encodeBytes(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}

/** Stable request keys shared by live capture and the offline transport. */
export function sessionReviewRequestKey(method: string, path: string): string {
  return `${method} ${path}`;
}

/** Capture actual catalog, media and table responses needed by saved A2UI views. */
export async function captureSessionReview(
  transport: ClioTransport,
  sessionIds: readonly string[],
  transcript?: unknown,
): Promise<SessionReviewSnapshot> {
  const snapshot: SessionReviewSnapshot = { responses: {}, sessions: {}, tables: {}, failures: [] };
  const captured: ClioTransport = {
    async request<T>(request: TransportRequest<T>): Promise<T> {
      try {
        return await transport.request({
          ...request,
          decode: (value) => {
            snapshot.responses[sessionReviewRequestKey(request.method, request.path)] =
              value instanceof Uint8Array ? { bytes: encodeBytes(value) } : { json: value };
            return request.decode(value);
          },
        });
      } catch (error) {
        if (error instanceof TransportError)
          snapshot.responses[sessionReviewRequestKey(request.method, request.path)] = {
            error: {
              message: error.message,
              status: error.status,
              code: error.code,
              details: error.details,
            },
          };
        throw error;
      }
    },
    stream: (...args) => transport.stream(...args),
  };
  const json = (path: string, body?: unknown) =>
    captured.request({ method: body ? 'POST' : 'GET', path, body, decode: (v) => v });
  for (const sid of sessionIds) {
    const prefix = `/v1/sessions/${encodeURIComponent(sid)}`;
    await json(`${prefix}/interactions?include_recent_resolved=true&resolved_limit=100`);
    type SummaryRow = {
      session?: { id?: string };
      surfaces?: unknown[];
      degradations?: unknown[];
      messages?: { parts?: { type?: string; text?: string; url?: string }[] }[];
    };
    const raw = transcript as (SummaryRow & { children?: SummaryRow[] }) | undefined;
    const current = [raw, ...(raw?.children ?? [])].find((row) => row?.session?.id === sid);
    const response = (await json(`${prefix}/a2ui/surfaces`)) as {
      surfaces: unknown[];
      degradations?: unknown[];
    };
    if (response.degradations?.length && current?.surfaces) {
      snapshot.failures.push({
        path: `${prefix}/a2ui/surfaces`,
        message:
          'Live surface projection was unavailable; views were validated from the recorded transcript. ' +
          JSON.stringify(response.degradations),
      });
      response.surfaces = current.surfaces;
      snapshot.responses[sessionReviewRequestKey('GET', `${prefix}/a2ui/surfaces`)] = {
        json: response,
      };
    }
    for (const degradation of current?.degradations ?? [])
      snapshot.failures.push({
        path: `${prefix}/a2ui/surfaces`,
        message: JSON.stringify(degradation),
      });
    snapshot.sessions[sid] = response.surfaces;
    await json(`${prefix}/a2ui/catalogs`);
    await json(`${prefix}/a2ui/capabilities`);
    const references = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object')
        Object.values(value).forEach((item) => {
          if (typeof item === 'string' && /^(artifact:|artifact_|resource:|res_)/u.test(item)) {
            references.add(item);
          }
          walk(item);
        });
    };
    walk(response.surfaces);
    for (const message of current?.messages ?? [])
      for (const part of message.parts ?? []) {
        if (part.type === 'text' && part.text)
          for (const match of part.text.matchAll(/artifact:\/\/[^\s)<>"']+/gu))
            references.add(match[0]);
        if (part.type === 'image' && part.url) references.add(part.url);
      }
    for (const uri of references) {
      try {
        const resolved = await resolveSessionReference(captured, sid, uri);
        if (
          !/csv|parquet/iu.test(resolved.media_type ?? '') &&
          !/\.(csv|parquet)$/iu.test(resolved.name)
        ) {
          await readResolvedReferenceBytes(captured, resolved);
          continue;
        }
        const id = resolved.artifact_id;
        if (!id) throw new Error('This data reference is not a registered table.');
        let offset = 0;
        let total = Infinity;
        let table: ArtifactTableQueryResult | undefined;
        while (offset < total) {
          const page = (await json(`/v1/artifacts/${encodeURIComponent(id)}/table-query`, {
            columns: [],
            limit: 5000,
            offset,
            format: 'json',
            downsample: { mode: 'none' },
          })) as ArtifactTableQueryResult;
          if (Number.isFinite(total) && page.totalRows !== total)
            throw new Error('Table changed while its source rows were being exported.');
          if (!table)
            table = {
              ...page,
              columns: {},
              rowKey: page.rowKey ? { ...page.rowKey, values: [] } : undefined,
            };
          const columns = table.columns;
          for (const [name, values] of Object.entries(page.columns))
            (columns[name] ??= []).push(...values);
          if (table.rowKey && page.rowKey) table.rowKey.values.push(...page.rowKey.values);
          total = page.totalRows;
          if (!page.returnedRows && offset < total)
            throw new Error('Table export stopped before all source rows were recorded.');
          offset += page.returnedRows;
        }
        snapshot.tables[id] = {
          ...table,
          returnedRows: offset,
          totalRows: total,
          truncated: false,
        };
      } catch (error) {
        snapshot.failures.push({
          path: uri,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return snapshot;
}
