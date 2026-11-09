import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render as rtlRender, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { blockedProgram, sandboxBoundary } from './sandbox-boundary';
import {
  SandboxBoundaryBadge,
  SandboxBoundaryNotice,
  TurnSandboxNotices,
} from './sandbox-boundary-notice';
import { PresentationNavigation } from './presentation-navigation';

const repository = vi.hoisted(() => ({
  grantWorkspaceFolder: vi.fn(async () => ({})),
  workspaces: vi.fn(async () => [] as unknown[]),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://test' } }),
}));

/** Each render gets its own query cache (the workspace folders are a query). */
const render = (ui: ReactElement) =>
  rtlRender(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      {ui}
    </QueryClientProvider>,
  );

afterEach(cleanup);

const denied = {
  kind: 'write_denied',
  confidence: 'confirmed',
  mechanism: 'landlock',
  paths: ['/home/ada/Desktop/out.csv'],
  request_roots: ['/home/ada/Desktop'],
  message: "CLIO's sandbox blocked this write. /home/ada/Desktop is not a permitted folder.",
};

describe('sandboxBoundary', () => {
  it('finds the diagnosis inside a task envelope and inside JSON text', () => {
    const envelope = {
      handle: 'task_1',
      result: { structuredContent: { exit_code: 1, boundary: denied } },
    };
    expect(sandboxBoundary(envelope)?.request_roots).toEqual(['/home/ada/Desktop']);
    const text = [{ type: 'text', text: JSON.stringify({ exit_code: 1, boundary: denied }) }];
    expect(sandboxBoundary(text)?.kind).toBe('write_denied');
    expect(sandboxBoundary({ exit_code: 1, stderr: 'boundary of the plot' })).toBeUndefined();
  });
});

it('names the script a blocked command ran', () => {
  expect(blockedProgram('python -u scripts/qc_sites.py --all')).toBe('qc_sites.py');
  expect(blockedProgram('make install')).toBe('make');
  expect(blockedProgram(undefined)).toBeUndefined();
});

describe('SandboxBoundaryNotice', () => {
  it('says what was blocked in words and lets the person allow the folder', async () => {
    render(
      <PresentationNavigation.Provider
        value={{ artifacts: {}, subagents: {}, workspaceId: 'ws_1' }}
      >
        <SandboxBoundaryNotice boundary={sandboxBoundary({ boundary: denied })!} />
      </PresentationNavigation.Provider>,
    );
    expect(screen.getByText('Blocked by the sandbox: Desktop')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Allow Desktop' }));
    // The person first reads exactly what they allow.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Allow writing to /home/ada/Desktop?');
    expect(dialog).toHaveTextContent('Read and write in /home/ada/Desktop');
    expect(dialog).toHaveTextContent('This workspace');
    expect(dialog).toHaveTextContent('You remove it in Settings, Permissions');
    // A grant starts on the safe button.
    expect(within(dialog).getByRole('button', { name: /^Cancel/u })).toHaveFocus();
    expect(repository.grantWorkspaceFolder).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Allow folder' }));
    expect(repository.grantWorkspaceFolder).toHaveBeenCalledWith('ws_1', '/home/ada/Desktop');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Allowed Desktop for this workspace',
    );
  });

  it('offers no grant for an installer that needs administrator rights', () => {
    render(
      <PresentationNavigation.Provider
        value={{ artifacts: {}, subagents: {}, workspaceId: 'ws_1' }}
      >
        <SandboxBoundaryNotice boundary={{ ...denied, kind: 'elevation_required' }} />
      </PresentationNavigation.Provider>,
    );
    expect(screen.getByText('Needs administrator rights')).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Allow/u })).toBeNull();
  });
});

it('marks a blocked call row with the folder in words', () => {
  render(<SandboxBoundaryBadge boundary={sandboxBoundary({ boundary: denied })!} />);
  expect(screen.getByLabelText('Sandbox: Desktop')).toHaveTextContent('Blocked');
});

describe('TurnSandboxNotices', () => {
  it('says each blocked folder once on the message, and one Allow serves both places', async () => {
    const boundary = sandboxBoundary({ boundary: denied })!;
    render(
      <PresentationNavigation.Provider
        value={{ artifacts: {}, subagents: {}, workspaceId: 'ws_turn' }}
      >
        <TurnSandboxNotices boundaries={[boundary, { ...boundary }]} />
        <SandboxBoundaryNotice boundary={boundary} />
      </PresentationNavigation.Provider>,
    );
    const onMessage = document.querySelectorAll('[data-placement="message"]');
    expect(onMessage).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Allow Desktop' })).toHaveLength(2);
    await userEvent.click(screen.getAllByRole('button', { name: 'Allow Desktop' })[0]);
    await userEvent.click(await screen.findByRole('button', { name: 'Allow folder' }));
    expect(await screen.findAllByText('Allowed Desktop for this workspace')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Allow Desktop' })).toBeNull();
  });

  it('shows nothing for a turn with no blocked call', () => {
    const { container } = render(<TurnSandboxNotices boundaries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('a folder the workspace already allows', () => {
  it('reads as allowed after a reload, with no button', async () => {
    repository.workspaces.mockResolvedValueOnce([
      {
        id: 'ws_reload',
        source_folders: [
          { path: '/work', name: 'work', primary: true },
          { path: '/home/ada/Desktop', name: 'Desktop', primary: false },
        ],
      },
    ]);
    render(
      <PresentationNavigation.Provider
        value={{ artifacts: {}, subagents: {}, workspaceId: 'ws_reload' }}
      >
        <SandboxBoundaryNotice boundary={sandboxBoundary({ boundary: denied })!} />
      </PresentationNavigation.Provider>,
    );
    expect(await screen.findByText('Allowed Desktop for this workspace')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Allow Desktop' })).toBeNull();
  });
});
