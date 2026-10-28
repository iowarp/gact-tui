import { TransportError, type ClioTransport, type TransportRequest } from './transport.js';
import { resolveSessionReference, readResolvedReferenceBytes } from './a2ui/reference-transport.js';
import type { ArtifactTableQueryResult } from './artifact-preview-repository.js';
import {
  captureSessionOrchestration,
  type CapturedOrchestration,
} from './session-export-orchestration.js';

export type SessionExportMode = 'transcript' | 'effects' | 'full';
export interface SessionReviewSnapshot {
  responses: Record<
    string,
    {
      json?: unknown;
      bytes?: string;
      /**
       * A dashboard export names the artifact instead of carrying its bytes; the
       * server copies them into the page as the inert block named by `embedded`.
       */
      artifact?: string;
      /** The id of the page's inert data block that holds this read's base64 bytes. */
      embedded?: string;
      error?: { message: string; status?: number; code?: string; details?: unknown };
      /** This read answers exactly as the captured read under that key (stored once). */
      same_as?: string;
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
  selectedSurfaces?: Record<string, unknown[]>,
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
  // A study is read by each of its branches, and a call cited twice: each is stored once.
  const orchestration: CapturedOrchestration = { studies: new Map(), transforms: new Set() };
  for (const sid of sessionIds) {
    const prefix = `/v1/sessions/${encodeURIComponent(sid)}`;
    // A dashboard captures its authored views and their data, not unrelated chat questions.
    if (selectedSurfaces?.[sid] === undefined)
      await json(`${prefix}/interactions?include_recent_resolved=true&resolved_limit=100`);
    type SummaryRow = {
      session?: { id?: string };
      surfaces?: unknown[];
      degradations?: unknown[];
      messages?: { parts?: { type?: string; text?: string; url?: string }[] }[];
    };
    const raw = transcript as (SummaryRow & { children?: SummaryRow[] }) | undefined;
    const current = [raw, ...(raw?.children ?? [])].find((row) => row?.session?.id === sid);
    const response = (
      selectedSurfaces?.[sid]
        ? { surfaces: selectedSurfaces[sid] }
        : await json(`${prefix}/a2ui/surfaces`)
    ) as {
      surfaces: unknown[];
      degradations?: unknown[];
    };
    if (selectedSurfaces?.[sid])
      snapshot.responses[sessionReviewRequestKey('GET', `${prefix}/a2ui/surfaces`)] = {
        json: response,
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
    // How the session ran: its record, task rows, flow runs and study.
    if (selectedSurfaces?.[sid] === undefined)
      await captureSessionOrchestration(
        (path) => json(path),
        sid,
        orchestration,
        (path, message) => snapshot.failures.push({ path, message }),
        (path, sameAs) => {
          snapshot.responses[sessionReviewRequestKey('GET', path)] = {
            same_as: sessionReviewRequestKey('GET', sameAs),
          };
        },
      );
    const references = new Set<string>();
    const studySources = new Set<string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object')
        Object.values(value).forEach((item) => {
          if (typeof item === 'string' && /^(artifact:|artifact_|resource:|res_)/u.test(item)) {
            references.add(item);
          }
          if (typeof item === 'string' && STUDY_SOURCE.test(item)) studySources.add(item);
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
          // A dashboard export names each file; the server streams its bytes into the
          // page (#1823), so no file is read whole into this snapshot or the request.
          if (selectedSurfaces && resolved.kind === 'artifact' && resolved.artifact_id) {
            const reference = { artifact: resolved.artifact_id };
            const direct = `/v1/artifacts/${encodeURIComponent(resolved.artifact_id)}/bytes`;
            for (const path of new Set([direct, resolved.fetch_path]))
              snapshot.responses[sessionReviewRequestKey('GET', path)] = reference;
            continue;
          }
          await readResolvedReferenceBytes(captured, resolved);
          continue;
        }
        const id = resolved.artifact_id;
        if (!id) throw new Error('This data reference is not a registered table.');
        snapshot.tables[id] = await captureTable(
          (body) => json(`/v1/artifacts/${encodeURIComponent(id)}/table-query`, body),
          {},
        );
        // A dashboard's viewer can follow a table whose cells name files (a case per row,
        // its mesh in a column): those files are named for the export too (#1823). The
        // set grows while it is iterated, so they are captured in this same loop.
        if (selectedSurfaces)
          for (const values of Object.values(
            (snapshot.tables[id] as { columns?: Record<string, unknown> }).columns ?? {},
          ))
            for (const value of Array.isArray(values) ? values : [])
              if (
                typeof value === 'string' &&
                /^artifact:\/\/artifact_[A-Za-z0-9_-]+$/u.test(value)
              )
                references.add(value);
      } catch (error) {
        snapshot.failures.push({
          path: uri,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
    // A view's live study sources, as they stand at export (Addendum B), keyed by URI.
    for (const uri of studySources) {
      if (snapshot.tables[uri]) continue;
      const [, study, source] = STUDY_SOURCE.exec(uri)!;
      try {
        snapshot.tables[uri] = await captureTable(
          (body) => json(`/v1/studies/${encodeURIComponent(study!)}/table-query`, body),
          { source },
        );
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

/** A study source a view reads: `study://<study>/<measurements|entries|records/<name>>`. */
const STUDY_SOURCE =
  /^study:\/\/([A-Za-z0-9_-]+)\/(measurements|entries|records\/[A-Za-z0-9_.-]+)$/u;

/** Every source row of one table, paged through its table-query route. */
async function captureTable(
  query: (body: Record<string, unknown>) => Promise<unknown>,
  extra: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let offset = 0;
  let total = Infinity;
  let table: ArtifactTableQueryResult | undefined;
  while (offset < total) {
    const page = (await query({
      ...extra,
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
  return { ...table, returnedRows: offset, totalRows: total, truncated: false };
}
