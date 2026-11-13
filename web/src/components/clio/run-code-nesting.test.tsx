import {
  childToolInvocations,
  createEntityState,
  isNestedToolInvocation,
  type PendingInteraction,
  type ToolInvocation,
} from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '@/components/ai-elements/markdown';
import { useLiveStore } from '@/store/live-store';
import { NestedToolCalls } from './nested-tool-calls';
import { scriptCallsRecap } from './script-calls';
import { PermissionResponse } from './permission-response';
import { PresentationNavigation } from './presentation-navigation';

afterEach(() => {
  cleanup();
  useLiveStore.setState({ entities: createEntityState() });
});

function tool(id: string, overrides: Partial<ToolInvocation> = {}): ToolInvocation {
  return {
    id,
    session_id: 'sess_1',
    name: 'records_get_record',
    state: 'succeeded',
    started_at: `2026-11-01T00:00:${id.padStart(2, '0').slice(-2)}Z`,
    ...overrides,
  };
}

function seed(tools: ToolInvocation[]) {
  const entities = createEntityState();
  useLiveStore.setState({
    entities: { ...entities, tools: Object.fromEntries(tools.map((t) => [t.id, t])) },
  });
  return useLiveStore.getState().entities.tools;
}

describe('run_code nesting', () => {
  it('selects a script’s calls oldest first and hides them from the top level', () => {
    const tools = seed([
      tool('run', { name: 'run_code' }),
      tool('12', { parent_call_id: 'run' }),
      tool('11', { parent_call_id: 'run' }),
      tool('13', { parent_call_id: 'gone' }),
    ]);
    expect(childToolInvocations(tools, 'run').map((t) => t.id)).toEqual(['11', '12']);
    expect(isNestedToolInvocation(tools['11']!, tools)).toBe(true);
    // A child whose parent never arrived still shows on its own.
    expect(isNestedToolInvocation(tools['13']!, tools)).toBe(false);
    expect(isNestedToolInvocation(tools.run!, tools)).toBe(false);
  });

  it('counts calls and failures in words and shows all on request', async () => {
    const user = userEvent.setup();
    seed([
      tool('run', { name: 'run_code' }),
      ...Array.from({ length: 10 }, (_, i) =>
        tool(String(10 + i), {
          parent_call_id: 'run',
          state: i === 3 ? 'failed' : i === 9 ? 'running' : 'succeeded',
        }),
      ),
    ]);
    render(
      <NestedToolCalls
        parentId="run"
        renderCall={(child) => <span data-testid="child">{child.id}</span>}
      />,
    );
    expect(
      screen.getByRole('group', { name: '10 calls from this script (1 failed, 1 running)' }),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('child')).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: 'Show all 10' }));
    expect(screen.getAllByTestId('child')).toHaveLength(10);
  });

  it("counts a background script's repeated calls and says how many a row stands for", () => {
    seed([
      tool('run', { name: 'run_code' }),
      tool('11', {
        parent_call_id: 'run',
        name: 'create_artifact',
        input: {
          path: 'log.csv',
          _clio_repeat: {
            count: 12,
            first_at: '2026-11-01T00:01:00Z',
            last_at: '2026-11-01T00:02:00Z',
          },
        },
      }),
      tool('12', { parent_call_id: 'run' }),
    ]);
    render(<NestedToolCalls parentId="run" renderCall={(child) => <span>{child.id}</span>} />);
    expect(screen.getByRole('group', { name: '13 calls from this script' })).toBeInTheDocument();
    expect(screen.getByText(/^Called 12 times/)).toBeInTheDocument();
    expect(screen.getAllByText(/^Called \d+ times/)).toHaveLength(1);
  });

  it('reads the calls a conversation supplies, as an offline export does', () => {
    seed([]); // no live stream fills the store in an export
    const tools = Object.fromEntries(
      [tool('run', { name: 'run_code' }), tool('11', { parent_call_id: 'run' })].map((t) => [
        t.id,
        t,
      ]),
    );
    render(
      <PresentationNavigation.Provider value={{ artifacts: {}, subagents: {}, tools }}>
        <NestedToolCalls parentId="run" renderCall={(child) => <span>{child.id}</span>} />
      </PresentationNavigation.Provider>,
    );
    expect(screen.getByRole('group', { name: '1 call from this script' })).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
  });

  it('renders nothing for a call without children', () => {
    seed([tool('run', { name: 'run_code' })]);
    const { container } = render(
      <NestedToolCalls parentId="run" renderCall={() => <span>child</span>} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('recaps what a script called and whether its images reached the model', () => {
    const view = (id: string, overrides: Partial<ToolInvocation> = {}) =>
      tool(id, {
        name: 'view_image',
        title: 'View image',
        parent_call_id: 'run',
        input: { path: `p${id}.png` },
        ...overrides,
      });
    const old = seed([tool('run', { name: 'run_code' }), view('11'), view('12')]);
    expect(scriptCallsRecap(old, 'run')?.label).toBe('View image ×2, not confirmed as seen');
    const shown = seed([
      tool('run', { name: 'run_code' }),
      view('11', { output: { attached_to_model: true, delivery: 'script_result' } }),
      view('12', {
        state: 'failed',
        error: 'view_image_script_limit: NOT shown to the model',
      }),
    ]);
    expect(scriptCallsRecap(shown, 'run')?.label).toBe('View image ×2, 1 of 2 shown to the model');
  });
});

function scriptQuestion(actions: string[]): PendingInteraction {
  return {
    id: 'permission:perm_2',
    kind: 'permission',
    owner_session_id: 'sess_1',
    attended_session_id: 'sess_1',
    status: 'pending',
    title: 'tool call: fs_write_file',
    source: { protocol: 'native', tool_name: 'fs_write_file' },
    created_at: '2026-11-01T00:00:00Z',
    actions,
    payload: {
      permission_id: 'perm_2',
      tool_call: { tool_name: 'fs_write_file', input: { path: 'out.csv' } },
      script: { call_id: 'call_run', code: 'for f in files:\n    await tools.fs.write_file(f)' },
    },
  } as PendingInteraction;
}

function renderQuestion(interaction: PendingInteraction, onOpenScript = vi.fn()) {
  const onResponse = vi.fn(async () => undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PermissionResponse
        interaction={interaction}
        onOpenScript={onOpenScript}
        onResponse={onResponse}
        showOwner={false}
      />
    </QueryClientProvider>,
  );
  return onResponse;
}

describe('a permission question asked from a script', () => {
  it('shows the paused script and offers the rest of the script', async () => {
    const user = userEvent.setup();
    const onOpenScript = vi.fn();
    const interaction = scriptQuestion([
      'allow',
      'deny',
      'allow_session',
      'allow_workspace',
      'allow_script',
    ]);
    const onResponse = renderQuestion(interaction, onOpenScript);
    expect(screen.getByRole('group', { name: 'Script' })).toBeInTheDocument();
    expect(screen.getByText(/await tools\.fs\.write_file/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Open in tab/u }));
    expect(onOpenScript).toHaveBeenCalledWith(interaction, 'call_run');
    await user.click(screen.getByRole('button', { name: 'Allow for the rest of this script' }));
    expect(onResponse).toHaveBeenCalledWith(expect.anything(), { action: 'allow_script' });
  });

  it('does not offer the rest of the script where the question does not', () => {
    renderQuestion(scriptQuestion(['allow', 'deny']));
    expect(screen.getByRole('button', { name: 'Allow once' })).toBeInTheDocument();
    expect(screen.queryByText('Rest of this script')).toBeNull();
  });

  it('colours the script with the theme syntax tokens once the highlighter loads', async () => {
    renderQuestion(scriptQuestion(['allow', 'deny']));
    const script = screen.getByRole('group', { name: 'Script' });
    await waitFor(
      () => expect(script.querySelector('code span[style*="--syntax-"]')).not.toBeNull(),
      { timeout: 20_000 },
    );
    expect(script.querySelector('pre')).toHaveTextContent(/await tools\.fs\.write_file\(f\)/u);
  }, 30_000);
});
