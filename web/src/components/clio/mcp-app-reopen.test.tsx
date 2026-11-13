import { TransportError, type ClioRepository, type McpAppReopenResult } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatArguments, McpAppCard, McpAppReopenLine } from './mcp-app-reopen';
import { setReopenedMcpApp } from './mcp-app-reopen-store';

const savedCall = {
  server: 'boards',
  tool: 'open_board',
  arguments: { title: 'Q3', count: 4 },
  display_mode: 'inline' as const,
  resource_uri: 'ui://boards/view',
  label: 'Open a board',
};

const fresh: McpAppReopenResult = {
  ok: true,
  savedCall: { ...savedCall, reopened_from: 'app_1' },
  view: {
    appInstanceId: 'app_2',
    dataRef: 'ref_2',
    resourceUri: 'ui://boards/view',
    sourceServer: 'boards',
    toolName: 'boards_open_board',
    displayMode: 'inline',
  },
};

function repository(results: McpAppReopenResult[]) {
  return {
    reopenMcpApp: vi.fn(async () => results.shift() as McpAppReopenResult),
    mcpAppLive: vi.fn(async (identity: { appInstanceId: string }) => identity.appInstanceId !== 'app_1'),
    mcpAppDescriptor: vi.fn(async (identity: { appInstanceId: string }) => {
      if (identity.appInstanceId === 'app_1') {
        throw new TransportError('MCP App instance not found', 404, 'not_found');
      }
      return new Promise(() => undefined);
    }),
    callMcpAppTool: vi.fn(),
    readMcpAppResource: vi.fn(),
    updateMcpAppModelContext: vi.fn(),
    postMcpAppMessage: vi.fn(),
    closeMcpApp: vi.fn(),
  };
}

const line = {
  appInstanceId: 'app_1',
  sessionId: 'sess_1',
  sourceServer: 'boards',
  toolName: 'boards_open_board',
};

afterEach(() => {
  cleanup();
  setReopenedMcpApp('sess_1', 'app_1', undefined);
  window.localStorage.clear();
});

describe('McpAppReopenLine', () => {
  it('replays the saved call and hands the fresh view back', async () => {
    const repo = repository([fresh]);
    const onReopened = vi.fn();
    render(<McpAppReopenLine {...line} onReopened={onReopened} repository={repo} />);

    expect(screen.getByText('View closed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));

    await waitFor(() => expect(onReopened).toHaveBeenCalledWith(fresh.view, fresh.savedCall));
    expect(repo.reopenMcpApp).toHaveBeenCalledWith('sess_1', 'app_1');
  });

  it('shows the reason and the saved call, and retries', async () => {
    const repo = repository([
      {
        ok: false,
        reason: 'tool_error',
        detail: 'The board service is unavailable right now.',
        savedCall,
      },
      fresh,
    ]);
    const onReopened = vi.fn();
    render(<McpAppReopenLine {...line} onReopened={onReopened} repository={repo} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));

    expect(await screen.findByText('The board service is unavailable right now.')).toBeTruthy();
    expect(screen.getByText('Open a board from boards')).toBeTruthy();
    expect(screen.getByText('title: "Q3", count: 4')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(onReopened).toHaveBeenCalledTimes(1));
  });

  it('offers no Retry when nothing was saved', async () => {
    const repo = repository([
      { ok: false, reason: 'no_saved_call', detail: 'Not saved.', savedCall: null },
    ]);
    render(<McpAppReopenLine {...line} onReopened={vi.fn()} repository={repo} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
    expect(await screen.findByText('Not saved.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('replays at once for a restored view', async () => {
    const repo = repository([fresh]);
    const onReopened = vi.fn();
    render(<McpAppReopenLine {...line} autoReopen onReopened={onReopened} repository={repo} />);
    await waitFor(() => expect(onReopened).toHaveBeenCalledTimes(1));
    expect(repo.reopenMcpApp).toHaveBeenCalledTimes(1);
  });
});

describe('McpAppCard', () => {
  it('offers reopen when CLIO no longer holds the view, then mounts the fresh one', async () => {
    const repo = repository([fresh]);
    const { container } = render(
      <McpAppCard
        {...line}
        dataRef="ref_1"
        live
        repository={repo as unknown as ClioRepository}
        resourceUri="ui://boards/view"
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Reopen' }));

    await waitFor(() => expect(container.querySelector('[data-mcp-app="app_2"]')).toBeTruthy());
    expect(repo.mcpAppLive).toHaveBeenCalledTimes(2);
    expect(repo.mcpAppDescriptor).toHaveBeenLastCalledWith(
      { sessionId: 'sess_1', appInstanceId: 'app_2', dataRef: 'ref_2' },
      expect.anything(),
    );
  });

  it('shows the reopen line for a card the transcript does not keep live', () => {
    render(
      <McpAppCard
        {...line}
        dataRef="ref_1"
        live={false}
        repository={repository([]) as unknown as ClioRepository}
        resourceUri="ui://boards/view"
      />,
    );
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeTruthy();
  });
});

describe('formatArguments', () => {
  it('reads arguments for a person', () => {
    expect(formatArguments(savedCall)).toBe('title: "Q3", count: 4');
    expect(formatArguments({ ...savedCall, arguments: null })).toBe('arguments not saved');
    expect(formatArguments({ ...savedCall, arguments: {} })).toBe('no arguments');
  });
});
