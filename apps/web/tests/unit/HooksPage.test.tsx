/**
 * GAP 2 / 4 / 5 — CLIO Desktop Hooks page.
 *
 *  - The declarative editor offers all SIX clio event kinds (was 4).
 *  - Add-hook submit calls client.createHook with the real wire shape
 *    {event, command} (the old {type, handler_uri} body 400'd on clio).
 *  - Rows render h.event + h.command (not h.type / h.handler_uri).
 *  - A read-only runtime-hook status panel renders the backend name and a
 *    per-event handler-count chip (including 0s) from capabilities.
 *
 * Mocks the @clio/core Client as a partial fake (only the methods
 * HooksPage touches).
 */
import { render, screen, cleanup, fireEvent, waitFor } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Capabilities, Client, HookRow } from '@clio/core';
import { HooksPage } from '../../src/routes/discovery/RoadmapPages.js';

afterEach(cleanup);

const HOOK_ROWS: HookRow[] = [
  {
    id: 'hook_1',
    event: 'pre_message',
    command: 'echo hi',
    url: '',
    session_id: '',
    workspace_id: '',
  },
  {
    id: 'hook_2',
    event: 'on_error',
    command: '',
    url: 'http://localhost:9999/err',
  },
];

/** Capabilities shaped like live clio :17803 — hook fields nested under
 *  `capabilities`. Cast to the wire type which doesn't model the
 *  string/object hook flags (another agent owns that file). */
function makeCaps(): Capabilities {
  return {
    contract_version: '0.2',
    backend: { name: 'clio-agent-gact', version: '0.1.0', vendor: 'iowarp' },
    capabilities: {
      hooks: true,
      x_clio_hook_backend: 'local_python',
      x_clio_hook_events: {
        pre_tool: 0,
        post_tool: 0,
        pre_message: 1,
        post_message: 0,
        semantic_event: 0,
        on_error: 0,
      },
    },
    transports: { events_sse: true, events_websocket: false },
    auth: { schemes: ['trust_socket'], current: 'trust_socket' },
    extensions: [],
  } as unknown as Capabilities;
}

function makeClient(overrides: Partial<Record<keyof Client, unknown>> = {}): {
  client: Client;
  hooks: ReturnType<typeof vi.fn>;
  createHook: ReturnType<typeof vi.fn>;
  deleteHook: ReturnType<typeof vi.fn>;
  capabilities: ReturnType<typeof vi.fn>;
} {
  const hooks = vi.fn().mockResolvedValue({ hooks: HOOK_ROWS });
  const createHook = vi.fn().mockResolvedValue({ id: 'hook_new', event: 'pre_message', command: 'x' });
  const deleteHook = vi.fn().mockResolvedValue(undefined);
  const capabilities = vi.fn().mockResolvedValue(makeCaps());
  const client = { hooks, createHook, deleteHook, capabilities, ...overrides } as unknown as Client;
  return { client, hooks, createHook, deleteHook, capabilities };
}

async function settled() {
  // Row testid is `hook-${h.id}` → for id "hook_2" that's "hook-hook_2".
  await waitFor(() => expect(screen.queryByTestId('hook-hook_2')).toBeTruthy());
}

describe('HooksPage — declarative editor (GAP 2 / 5)', () => {
  it('offers all six event kinds in the <select>', async () => {
    const { client } = makeClient();
    render(() => <HooksPage client={client} />);
    await settled();
    const select = screen.getByTestId('hook-event') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual([
      'pre_tool',
      'post_tool',
      'pre_message',
      'post_message',
      'semantic_event',
      'on_error',
    ]);
  });

  it('renders rows by event + command/url (not type / handler_uri)', async () => {
    const { client } = makeClient();
    render(() => <HooksPage client={client} />);
    await settled();
    const row1 = screen.getByTestId('hook-hook_1');
    expect(row1.textContent).toContain('pre_message');
    expect(row1.textContent).toContain('echo hi');
    const row2 = screen.getByTestId('hook-hook_2');
    expect(row2.textContent).toContain('on_error');
    expect(row2.textContent).toContain('http://localhost:9999/err');
  });

  it('add-hook submit calls createHook with {event, command}', async () => {
    const { client, createHook } = makeClient();
    render(() => <HooksPage client={client} />);
    await settled();

    // Default event is pre_message, default handler-kind is command.
    const input = screen.getByTestId('hook-value') as HTMLInputElement;
    fireEvent.input(input, { target: { value: 'echo built' } });
    fireEvent.submit(screen.getByTestId('hook-form'));

    await waitFor(() =>
      expect(createHook).toHaveBeenCalledWith({ event: 'pre_message', command: 'echo built' }),
    );
  });

  it('add-hook with the url handler-kind sends {event, url}', async () => {
    const { client, createHook } = makeClient();
    render(() => <HooksPage client={client} />);
    await settled();

    fireEvent.change(screen.getByTestId('hook-handler-kind'), { target: { value: 'url' } });
    fireEvent.change(screen.getByTestId('hook-event'), { target: { value: 'post_tool' } });
    fireEvent.input(screen.getByTestId('hook-value'), {
      target: { value: 'http://localhost:9999/hook' },
    });
    fireEvent.submit(screen.getByTestId('hook-form'));

    await waitFor(() =>
      expect(createHook).toHaveBeenCalledWith({
        event: 'post_tool',
        url: 'http://localhost:9999/hook',
      }),
    );
  });
});

describe('HooksPage — runtime status panel (GAP 4)', () => {
  it('renders the backend name and a per-event count chip incl. zeros', async () => {
    const { client } = makeClient();
    render(() => <HooksPage client={client} />);
    await settled();

    expect(screen.getByTestId('hooks-runtime-panel')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId('hooks-runtime-backend').textContent).toBe('local_python'),
    );
    // One handler on pre_message; zero everywhere else — all six chips present.
    expect(screen.getByTestId('hooks-runtime-count-pre_message').textContent).toContain('1');
    expect(screen.getByTestId('hooks-runtime-count-post_message').textContent).toContain('0');
    expect(screen.getByTestId('hooks-runtime-count-semantic_event').textContent).toContain('0');
    expect(screen.getByTestId('hooks-runtime-count-on_error').textContent).toContain('0');
  });

  it('shows backend "none" and no chips when the runtime hook system is disabled', async () => {
    const caps = makeCaps();
    (caps.capabilities as Record<string, unknown>)['x_clio_hook_backend'] = 'none';
    const { client } = makeClient({ capabilities: vi.fn().mockResolvedValue(caps) });
    render(() => <HooksPage client={client} />);
    await settled();

    await waitFor(() =>
      expect(screen.getByTestId('hooks-runtime-backend').textContent).toBe('none'),
    );
    expect(screen.queryByTestId('hooks-runtime-count-pre_message')).toBeNull();
  });
});
