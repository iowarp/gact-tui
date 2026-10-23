import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NDPEndpointConnection } from '@clio/core/v3';
import { NDPEndpointBrowser } from './ndp-endpoint-browser';

const fixture = vi.hoisted(() => ({
  repository: {
    browseNdpEndpoint: vi.fn(),
    requestNdpEndpoint: vi.fn(),
    ndpEndpointCaptures: vi.fn(),
  },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => fixture.repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'https://clio.test', token: '' } }),
}));
const operation = (id: string, extra = {}) => ({
  id,
  method: id.split(' ')[0],
  path: id.split(' ')[1],
  summary: id,
  description: '',
  parameters: [],
  body_schema: null,
  body_required: false,
  read_only: id.startsWith('GET'),
  ...extra,
});
const endpoint: NDPEndpointConnection = {
  id: 'ep',
  name: 'Lab',
  url: 'https://ndp.test',
  ssh_profile: '',
  authentication: 'none',
  workspace_id: 'w',
  observed_at: 'today',
  api_title: 'NDP',
  operations: [
    operation('GET /search'),
    operation('GET /organization'),
    operation('POST /organization', {
      body_schema: {
        type: 'object',
        required: ['name', 'title'],
        properties: {
          name: { type: 'string', title: 'Name' },
          title: { type: 'string', title: 'Title' },
        },
      },
      body_required: true,
    }),
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  fixture.repository.browseNdpEndpoint.mockImplementation(async (_w, _id, request) =>
    request.operation_id === 'GET /organization'
      ? ['earthscope', 'ocean']
      : [
          {
            id: 'd',
            title: 'Coastal observations',
            name: 'coastal',
            resources: [
              {
                id: 'r',
                name: 'stations.csv',
                format: 'CSV',
                url: 'https://data.test/stations.csv',
              },
            ],
          },
        ],
  );
  fixture.repository.ndpEndpointCaptures.mockResolvedValue({ captures: [] });
  fixture.repository.requestNdpEndpoint.mockResolvedValue({
    id: 'c',
    status_code: 200,
    bytes_received: 2,
    events: 0,
    stop_reason: 'completed',
    sha256: 'abc',
    preview: '{}',
  });
});
afterEach(cleanup);

const sdkOperation = (action: string, fields: string[] = []) =>
  operation(`SDK streaming_v2.${action}`, {
    read_only: true,
    parameters: fields.map((name) => ({
      name,
      in: 'query',
      required: name !== 'cursor',
      schema: { type: 'string' },
    })),
  });

it('opens the selected catalog resource through the SDK without an HTTP stream route', async () => {
  fixture.repository.browseNdpEndpoint.mockImplementation(async (_w, _id, request) =>
    request.operation_id === 'SDK streaming_v2.list'
      ? { streams: [] }
      : [
          {
            id: 'dataset',
            title: 'Scientific observations',
            resources: [{ id: 'catalog-resource', name: 'Observed events', format: 'kafka' }],
          },
        ],
  );
  show({
    ...endpoint,
    operations: [
      operation('GET /search'),
      sdkOperation('open', ['resource_id']),
      sdkOperation('list'),
    ],
  });
  await userEvent.click(await screen.findByText('1 resources'));
  await userEvent.click(screen.getByRole('button', { name: 'Read stream' }));
  await userEvent.click(screen.getByRole('button', { name: 'Read Observed events' }));
  await waitFor(() =>
    expect(fixture.repository.requestNdpEndpoint).toHaveBeenCalledWith(
      'w',
      'ep',
      expect.objectContaining({
        operation_id: 'SDK streaming_v2.open',
        parameters: { resource_id: 'catalog-resource', start: 'earliest' },
      }),
    ),
  );
});

it('SDK capture advances the hidden cursor for the next capture', async () => {
  fixture.repository.browseNdpEndpoint.mockResolvedValue({
    streams: [{ id: 'reader', topic: 'Scientific events', cursor: 'first', state: 'active' }],
  });
  fixture.repository.requestNdpEndpoint.mockResolvedValue({
    id: 'capture',
    method: 'SDK',
    status_code: 200,
    bytes_received: 40,
    events: 5,
    stop_reason: 'completed',
    sha256: 'abc',
    preview: '{}',
    continuation: {
      stream_id: 'reader',
      next_cursor: 'second',
      next_positions: { '0': 5 },
      count: 5,
    },
  });
  show({
    ...endpoint,
    operations: [
      sdkOperation('list'),
      sdkOperation('read', ['stream_id', 'cursor']),
      sdkOperation('stop', ['stream_id']),
      sdkOperation('resume', ['stream_id']),
    ],
  });
  expect(await screen.findByText('Scientific events')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: /^Capture$/ }));
  expect(screen.queryByLabelText(/cursor/i)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Capture records' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Capture next records' }));
  await waitFor(() =>
    expect(fixture.repository.requestNdpEndpoint).toHaveBeenLastCalledWith(
      'w',
      'ep',
      expect.objectContaining({
        operation_id: 'SDK streaming_v2.read',
        parameters: { stream_id: 'reader', cursor: 'second' },
      }),
    ),
  );
});

it('SDK stopped readers offer resume while capture remains disabled', async () => {
  fixture.repository.browseNdpEndpoint.mockResolvedValue({
    streams: [{ id: 'reader', topic: 'Scientific events', cursor: 'current', state: 'stopped' }],
  });
  show({
    ...endpoint,
    operations: [
      sdkOperation('list'),
      sdkOperation('read', ['stream_id']),
      sdkOperation('resume', ['stream_id']),
    ],
  });
  expect(await screen.findByRole('button', { name: /^Capture$/ })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: /^Resume$/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Resume reader' }));
  await waitFor(() =>
    expect(fixture.repository.requestNdpEndpoint).toHaveBeenCalledWith(
      'w',
      'ep',
      expect.objectContaining({
        operation_id: 'SDK streaming_v2.resume',
        parameters: { stream_id: 'reader' },
      }),
    ),
  );
});

function show(current = endpoint) {
  render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <NDPEndpointBrowser workspaceId="w" endpoint={current} />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

it('offers named catalog streams without asking the user to copy a resource ID', async () => {
  fixture.repository.requestNdpEndpoint.mockResolvedValue({
    id: 'reader-capture',
    operation_id: 'POST /streams',
    status_code: 201,
    bytes_received: 90,
    stop_reason: 'completed',
    preview: '{"id":"stream-a","state":"ready","cursor":"internal-checkpoint"}',
    preview_truncated: false,
  });
  fixture.repository.browseNdpEndpoint.mockImplementation(async (_w, _ep, request) =>
    request.operation_id === 'GET /streams'
      ? { streams: [] }
      : {
          results: [{ id: 'resource-real-id', name: 'Recent earthquake catalog', format: 'kafka' }],
        },
  );
  show({
    ...endpoint,
    operations: [
      operation('GET /streams'),
      operation('GET /resources/search'),
      operation('POST /streams', {
        body_required: true,
        body_schema: {
          type: 'object',
          required: ['resource_id'],
          properties: {
            resource_id: { type: 'string' },
            start: { type: 'string', enum: ['earliest', 'latest'], default: 'earliest' },
          },
        },
      }),
    ],
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Open stream view' }));
  expect(
    await screen.findByRole('option', { name: 'Recent earthquake catalog' }),
  ).toBeInTheDocument();
  await userEvent.selectOptions(
    screen.getByLabelText('Catalog resource', { exact: false }),
    'resource-real-id',
  );
  await userEvent.selectOptions(screen.getByLabelText('Start reading'), 'earliest');
  await userEvent.click(screen.getByRole('button', { name: 'Review' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() =>
    expect(fixture.repository.requestNdpEndpoint).toHaveBeenCalledWith(
      'w',
      'ep',
      expect.objectContaining({
        operation_id: 'POST /streams',
        body: { resource_id: 'resource-real-id', start: 'earliest' },
      }),
    ),
  );
  expect(await screen.findByRole('status')).toHaveTextContent(
    'Stream reader ready. Checkpoint saved.',
  );
  expect(screen.getByText(/"cursor":"internal-checkpoint"/)).not.toBeVisible();
});

it('continues from complete response metadata when the preview is truncated, keeping cursors hidden', async () => {
  const firstCursor = 'a'.repeat(32);
  const nextCursor = 'b'.repeat(32);
  fixture.repository.browseNdpEndpoint.mockResolvedValue({
    streams: [
      {
        id: 'stream-a',
        name: 'Recent earthquake catalog',
        state: 'ready',
        cursor: firstCursor,
        created_at: '2026-10-20T03:00:00Z',
      },
    ],
  });
  fixture.repository.requestNdpEndpoint.mockResolvedValue({
    id: 'capture-a',
    status_code: 200,
    bytes_received: 30000,
    stop_reason: 'completed',
    preview: '{"records":[...truncated',
    preview_truncated: true,
    continuation: {
      stream_id: 'stream-a',
      next_cursor: nextCursor,
      count: 5,
      next_positions: { '0': 5 },
    },
  });
  show({
    ...endpoint,
    operations: [
      operation('GET /streams'),
      operation('GET /streams/{stream_id}/segment', {
        parameters: [
          { name: 'stream_id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'cursor', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'max_records', in: 'query', schema: { type: 'integer', default: 100 } },
        ],
      }),
    ],
  });
  expect(await screen.findByText(/^Opened /)).toBeVisible();
  await userEvent.click(await screen.findByRole('button', { name: 'Capture records' }));
  expect(screen.queryByLabelText(/cursor/i)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Capture records' }));
  expect(
    await screen.findByText('5 stream records captured. Continuation checkpoint saved.'),
  ).toBeVisible();
  expect(screen.getByText('{"records":[...truncated')).not.toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Capture next records' }));
  await waitFor(() =>
    expect(fixture.repository.requestNdpEndpoint).toHaveBeenLastCalledWith(
      'w',
      'ep',
      expect.objectContaining({
        parameters: expect.objectContaining({ stream_id: 'stream-a', cursor: nextCursor }),
      }),
    ),
  );
});

it('samples a declared URL replay despite listing failure and preserves its resume input', async () => {
  fixture.repository.browseNdpEndpoint.mockRejectedValue(new Error('File listing unavailable'));
  show({
    ...endpoint,
    operations: [
      operation('GET /data/csv-files'),
      operation('GET /stream/segment/url', {
        parameters: [
          { name: 'url', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'max_msgs', in: 'query', schema: { type: 'integer' } },
          { name: 'interval', in: 'query', schema: { type: 'number', minimum: 0 } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } },
        ],
      }),
    ],
  });
  expect(await screen.findByText('File listing unavailable')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Sample CSV from URL' }));
  await userEvent.type(
    screen.getByLabelText('CSV URL', { exact: false }),
    'https://data.test/a.csv',
  );
  await userEvent.clear(screen.getByLabelText('Rows to sample'));
  await userEvent.type(screen.getByLabelText('Rows to sample'), '3');
  await userEvent.click(screen.getByText('Options', { exact: true }));
  await userEvent.type(screen.getByLabelText('Seconds between records'), '0.1');
  await userEvent.click(screen.getByRole('button', { name: 'Save sample' }));
  await waitFor(() => expect(fixture.repository.requestNdpEndpoint).toHaveBeenCalledTimes(1));
  await userEvent.type(screen.getByLabelText('Resume cursor'), 'opaque-cursor-3');
  await userEvent.click(screen.getByRole('button', { name: 'Save sample' }));
  await waitFor(() =>
    expect(fixture.repository.requestNdpEndpoint).toHaveBeenLastCalledWith('w', 'ep', {
      operation_id: 'GET /stream/segment/url',
      parameters: {
        url: 'https://data.test/a.csv',
        max_msgs: 3,
        interval: 0.1,
        cursor: 'opaque-cursor-3',
      },
      max_seconds: 30,
      max_events: 100,
    }),
  );
  expect(fixture.repository.browseNdpEndpoint).toHaveBeenCalledTimes(1);
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(await screen.findByText('File listing unavailable')).toBeVisible();
});

it('loads catalog records automatically, filters data live, and keeps HTTP methods under Advanced', async () => {
  show();
  expect(await screen.findByText('Coastal observations')).toBeVisible();
  expect(fixture.repository.browseNdpEndpoint).toHaveBeenCalledWith(
    'w',
    'ep',
    { operation_id: 'GET /search', parameters: { terms: [''], server: 'local' } },
    expect.any(AbortSignal),
  );
  expect(screen.queryByLabelText('Search endpoint actions')).not.toBeVisible();
  await userEvent.type(screen.getByLabelText('Search catalog'), 'coast');
  await waitFor(() =>
    expect(fixture.repository.browseNdpEndpoint).toHaveBeenLastCalledWith(
      'w',
      'ep',
      { operation_id: 'GET /search', parameters: { terms: ['coast'], server: 'local' } },
      expect.any(AbortSignal),
    ),
  );
  expect(fixture.repository.requestNdpEndpoint).not.toHaveBeenCalled();
});

it('lists organizations and creates one from the plus button with a typed review', async () => {
  show();
  await userEvent.click(screen.getByRole('button', { name: 'Organizations' }));
  expect(await screen.findByText('earthscope')).toBeVisible();
  await userEvent.type(screen.getByLabelText('Search organizations'), 'ocean');
  expect(screen.queryByText('earthscope')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Create organization' }));
  await userEvent.type(screen.getByLabelText('Name *'), 'test-ocean');
  await userEvent.type(screen.getByLabelText('Title *'), 'Ocean research');
  expect(screen.queryByLabelText('Request JSON')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Review' }));
  expect(fixture.repository.requestNdpEndpoint).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent('Create organization on Lab?');
  await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() =>
    expect(fixture.repository.requestNdpEndpoint).toHaveBeenCalledWith('w', 'ep', {
      operation_id: 'POST /organization',
      parameters: { server: 'local' },
      body: { name: 'test-ocean', title: 'Ocean research' },
      max_seconds: 30,
      max_events: 100,
    }),
  );
});

it('shows stations as data and preselects their codes without starting a producer', async () => {
  fixture.repository.browseNdpEndpoint.mockResolvedValue({
    stations: ['WWMT.CI.LY_.40', 'ANMO.IU'],
  });
  show({
    ...endpoint,
    operations: [
      operation('GET /bridge/stations/catalog'),
      operation('POST /bridge/sessions', {
        body_schema: {
          type: 'object',
          properties: { sncl_codes: { type: 'array', items: { type: 'string' } } },
        },
      }),
    ],
  });
  expect(await screen.findByText('WWMT.CI.LY_.40')).toBeVisible();
  await userEvent.click(screen.getAllByRole('button', { name: 'Start stream' })[1]);
  expect(screen.getByLabelText('Station codes')).toHaveValue('WWMT.CI.LY_.40');
  expect(fixture.repository.requestNdpEndpoint).not.toHaveBeenCalled();
});

it('reports unavailable endpoint data as a failure rather than an empty collection', async () => {
  fixture.repository.browseNdpEndpoint.mockRejectedValue(new Error('Endpoint access denied'));
  show();
  expect(await screen.findByRole('alert')).toHaveTextContent('Endpoint access denied');
  expect(screen.queryByText('No catalog returned by this Endpoint.')).not.toBeInTheDocument();
});

it('queries an FDSN service through Network and Station fields', async () => {
  fixture.repository.browseNdpEndpoint.mockResolvedValue([
    {
      name: 'fdsn-station',
      title: 'FDSN Station Service',
      extras: { service_type: 'FDSN Station API' },
    },
  ]);
  show({
    ...endpoint,
    operations: [
      ...endpoint.operations,
      operation('GET /services/redirect/{service_identifier}/{path}', {
        parameters: [
          { name: 'service_identifier', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'path', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'query', in: 'query-map', schema: { type: 'object' } },
        ],
      }),
    ],
  });
  await userEvent.click(await screen.findByRole('button', { name: 'Query service' }));
  await userEvent.type(screen.getByLabelText('Network'), 'IU');
  await userEvent.type(screen.getByLabelText('Station'), 'ANMO');
  await userEvent.click(screen.getByRole('button', { name: 'Save sample' }));
  await waitFor(() =>
    expect(fixture.repository.requestNdpEndpoint).toHaveBeenCalledWith(
      'w',
      'ep',
      expect.objectContaining({
        parameters: {
          service_identifier: 'fdsn-station',
          path: 'query',
          query: { net: 'IU', sta: 'ANMO', level: 'station', format: 'text' },
        },
      }),
    ),
  );
});

it('keeps dataset resources as structured objects through the creation form', async () => {
  show({
    ...endpoint,
    operations: [
      ...endpoint.operations,
      operation('POST /dataset', {
        body_schema: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', title: 'Name' },
            resources: {
              anyOf: [
                {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['url', 'name'],
                    properties: {
                      url: { type: 'string', title: 'URL' },
                      name: { type: 'string', title: 'Resource name' },
                    },
                  },
                },
                { type: 'null' },
              ],
            },
          },
        },
      }),
    ],
  });
  await userEvent.click(screen.getByRole('button', { name: 'Create dataset' }));
  await userEvent.type(screen.getByLabelText('Name *'), 'coast');
  await userEvent.click(screen.getByText('Options', { exact: true }));
  await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
  await userEvent.type(screen.getByLabelText('URL'), 'https://data.test/stations.csv');
  await userEvent.type(screen.getByLabelText('Resource name'), 'Stations');
  await userEvent.click(screen.getByRole('button', { name: 'Review' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() =>
    expect(fixture.repository.requestNdpEndpoint).toHaveBeenCalledWith(
      'w',
      'ep',
      expect.objectContaining({
        body: {
          name: 'coast',
          resources: [{ url: 'https://data.test/stations.csv', name: 'Stations' }],
        },
      }),
    ),
  );
});
