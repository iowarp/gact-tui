import { expect, it } from 'vitest';
import { TransportError, type ClioTransport, type TransportRequest } from './transport.js';
import { captureSessionReview, streamTableKey } from './session-export-snapshot.js';

it('captures the authored dashboard only, naming files in inactive tabs by reference', async () => {
  const requests: string[] = [];
  const transport: ClioTransport = {
    async request<T>(request: TransportRequest<T>): Promise<T> {
      requests.push(request.path);
      if (request.path.includes('/references/resolve?'))
        return request.decode({
          uri: 'artifact://detail-image',
          kind: 'artifact',
          workspace_id: 'ws',
          name: 'detail.png',
          media_type: 'image/png',
          artifact_id: 'detail-image',
          fetch_path: '/v1/artifacts/detail-image/bytes',
        });
      if (request.path === '/v1/artifacts/detail-image/bytes')
        throw new Error('A dashboard export names its files; it never reads them whole');
      if (request.path.endsWith('/a2ui/surfaces') || request.path.includes('/interactions'))
        throw new Error('Unrelated chat state must not enter a dashboard bundle');
      return request.decode({});
    },
    async *stream() {
      return;
    },
  };
  const surface = {
    messages: [
      {
        updateComponents: {
          components: [
            { id: 'root', component: 'Tabs', tabs: [{ title: 'Evidence', child: 'detail' }] },
            { id: 'detail', component: 'Image', url: 'artifact://detail-image' },
          ],
        },
      },
    ],
  };
  const snapshot = await captureSessionReview(transport, ['s'], undefined, { s: [surface] });
  expect(snapshot.sessions.s).toEqual([surface]);
  // The server streams the file into the page by reference (#1823).
  expect(snapshot.responses['GET /v1/artifacts/detail-image/bytes']).toEqual({
    artifact: 'detail-image',
  });
  expect(requests).not.toContain('/v1/artifacts/detail-image/bytes');
  expect(snapshot.failures).toEqual([]);
  expect(requests).toContain('/v1/sessions/s/a2ui/catalogs');
  expect(requests).toContain('/v1/sessions/s/a2ui/capabilities');
});

it('preserves the authoritative custody redirect and its actual owned image bytes', async () => {
  const transport: ClioTransport = {
    async request<T>(request: TransportRequest<T>): Promise<T> {
      if (request.path.endsWith('/a2ui/surfaces'))
        return request.decode({ surfaces: [{ url: 'artifact://image' }] });
      if (request.path.includes('/references/resolve?'))
        return request.decode({
          uri: 'artifact://image',
          kind: 'artifact',
          workspace_id: 'ws',
          name: 'plot.png',
          media_type: 'image/png',
          artifact_id: 'image',
          fetch_path: '/v1/artifacts/image/bytes',
        });
      if (request.path === '/v1/artifacts/image/bytes')
        throw new TransportError('workspace-owned', 409, 'custody_not_cas', {
          fetch_via: '/v1/workspaces/ws/files/read?path=plot.png',
        });
      if (request.path === '/v1/workspaces/ws/files/read?path=plot.png')
        return request.decode(new Uint8Array([1, 2, 3]));
      if (request.path.endsWith('/dashboards')) return request.decode([]);
      return request.decode({});
    },
    async *stream() {
      return;
    },
  };
  const snapshot = await captureSessionReview(transport, ['s']);
  expect(snapshot.responses['GET /v1/artifacts/image/bytes']?.error?.code).toBe('custody_not_cas');
  expect(snapshot.responses['GET /v1/workspaces/ws/files/read?path=plot.png']?.bytes).toBe(
    btoa('\u0001\u0002\u0003'),
  );
  expect(snapshot.failures).toEqual([]);
});

it('captures only this session closure, all table pages and identities, without credentials', async () => {
  const requests: TransportRequest<unknown>[] = [];
  const transport: ClioTransport = {
    async request<T>(request: TransportRequest<T>): Promise<T> {
      requests.push(request);
      let value: unknown;
      if (request.path.endsWith('/a2ui/surfaces'))
        value = { surfaces: [], degradations: [{ reason: 'projection_failed' }] };
      else if (request.path.endsWith('/references/resolve?uri=artifact%3A%2F%2Ftable-alias'))
        value = {
          uri: 'artifact://table-alias',
          kind: 'artifact',
          workspace_id: 'ws',
          name: 'plants.parquet',
          media_type: 'application/vnd.apache.parquet',
          fetch_path: '/v1/artifacts/artifact_table/bytes',
          artifact_id: 'artifact_table',
        };
      else if (request.path.endsWith('/table-query')) {
        const offset = (request.body as { offset: number }).offset;
        const count = offset === 0 ? 5000 : 3;
        value = {
          schema: [{ name: 'x', type: 'int64' }],
          columns: { x: Array.from({ length: count }, (_, i) => offset + i) },
          rowKey: {
            column: '__row_key',
            values: Array.from({ length: count }, (_, i) => `row-${offset + i}`),
          },
          totalRows: 5003,
          returnedRows: count,
          truncated: offset === 0,
          downsample: { mode: 'none' },
        };
      } else value = {};
      return request.decode(value);
    },
    async *stream() {
      return;
    },
  };
  const snapshot = await captureSessionReview(transport, ['root'], {
    session: { id: 'root' },
    surfaces: [{ dataUri: 'artifact://table-alias' }],
    messages: [],
    children: [
      {
        session: { id: 'unrelated' },
        messages: [{ parts: [{ type: 'text', text: 'artifact://private' }] }],
      },
    ],
  });
  expect(snapshot.tables.artifact_table!.returnedRows).toBe(5003);
  expect((snapshot.tables.artifact_table!.columns as { x: number[] }).x.at(-1)).toBe(5002);
  expect((snapshot.tables.artifact_table!.rowKey as { values: string[] }).values.at(-1)).toBe(
    'row-5002',
  );
  expect(snapshot.sessions.root).toEqual([{ dataUri: 'artifact://table-alias' }]);
  expect(snapshot.failures[0]!.message).toContain('validated from the recorded transcript');
  expect(requests.filter((request) => request.path.endsWith('/table-query'))).toHaveLength(2);
  expect(JSON.stringify(snapshot)).not.toContain('private');
  expect(JSON.stringify(snapshot)).not.toContain('Authorization');
});

it.each([
  ['stopped', 'stopped'],
  ['open', 'captured'],
] as const)(
  'captures a held stream (%s) with its rows and state, read as the view reads it',
  async (state, archived) => {
    const transport: ClioTransport = {
      async request<T>(request: TransportRequest<T>): Promise<T> {
        let value: unknown = {};
        if (request.path.endsWith('/a2ui/surfaces'))
          value = { surfaces: [{ dataUri: 'artifact://ws/printer@latest' }] };
        else if (request.path.includes('/references/resolve'))
          value = {
            uri: 'artifact://ws/printer@latest',
            kind: 'artifact',
            workspace_id: 'ws',
            name: 'printer',
            media_type: 'application/vnd.apache.parquet',
            fetch_path: '/v1/artifacts/artifact_printer/bytes',
            artifact_id: 'artifact_printer',
            stream: { stream_id: 'stream_p', state },
          };
        else if (request.path.endsWith('/table-query'))
          value = {
            schema: [{ name: 'progress', type: 'float64' }],
            columns: { progress: request.path.includes('/streams/') ? [10, 55, 100] : [10] },
            totalRows: request.path.includes('/streams/') ? 3 : 1,
            returnedRows: request.path.includes('/streams/') ? 3 : 1,
            truncated: false,
            downsample: { mode: 'none' },
            ...(request.path.includes('/streams/')
              ? { stream: { stream_id: 'stream_p', state, stopped_at: '2026-11-05T10:00:00Z' } }
              : {}),
          };
        return request.decode(value);
      },
      async *stream() {
        return;
      },
    };
    const snapshot = await captureSessionReview(transport, ['root'], {
      session: { id: 'root' },
      surfaces: [{ dataUri: 'artifact://ws/printer@latest' }],
      messages: [],
    });
    const captured = snapshot.tables[streamTableKey('stream_p')]!;
    expect((captured.columns as { progress: number[] }).progress).toEqual([10, 55, 100]);
    expect((captured.stream as { state: string }).state).toBe(archived);
    if (archived === 'captured')
      expect((captured.stream as { captured_at?: string }).captured_at).toMatch(/^\d{4}-/u);
    // The last saved version is kept as well, for a view bound to it by id.
    expect(snapshot.tables.artifact_printer).toBeDefined();
  },
);

it("captures the session's published dashboards and the data they read", async () => {
  const paths: string[] = [];
  const transport: ClioTransport = {
    async request<T>(request: TransportRequest<T>): Promise<T> {
      paths.push(request.path);
      let value: unknown = {};
      if (request.path.endsWith('/a2ui/surfaces')) value = { surfaces: [] };
      else if (request.path.endsWith('/root/dashboards'))
        value = [{ id: 'r1', title: 'Printer', artifact_id: 'artifact_dash', created_at: 't' }];
      else if (request.path.endsWith('/root/dashboards/artifact_dash'))
        value = { surface: { components: [{ dataUri: 'artifact://artifact_rows' }] } };
      else if (request.path.includes('/references/resolve'))
        value = {
          uri: 'artifact://artifact_rows',
          kind: 'artifact',
          workspace_id: 'ws',
          name: 'rows.parquet',
          media_type: 'application/vnd.apache.parquet',
          fetch_path: '/v1/artifacts/artifact_rows/bytes',
          artifact_id: 'artifact_rows',
        };
      else if (request.path.endsWith('/table-query'))
        value = {
          schema: [{ name: 'x', type: 'int64' }],
          columns: { x: [1, 2] },
          totalRows: 2,
          returnedRows: 2,
          truncated: false,
          downsample: { mode: 'none' },
        };
      return request.decode(value);
    },
    async *stream() {
      return;
    },
  };
  const snapshot = await captureSessionReview(transport, ['root'], {
    session: { id: 'root' },
    messages: [],
  });
  expect(snapshot.responses['GET /v1/sessions/root/dashboards']).toBeDefined();
  expect(snapshot.responses['GET /v1/sessions/root/dashboards/artifact_dash']).toBeDefined();
  expect((snapshot.tables.artifact_rows!.columns as { x: number[] }).x).toEqual([1, 2]);
  expect(snapshot.failures).toEqual([]);
});
