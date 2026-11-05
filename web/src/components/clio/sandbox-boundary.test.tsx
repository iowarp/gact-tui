import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sandboxBoundary } from './sandbox-boundary';
import { SandboxBoundaryNotice } from './sandbox-boundary-notice';
import { PresentationNavigation } from './presentation-navigation';

const repository = vi.hoisted(() => ({ grantWorkspaceFolder: vi.fn(async () => ({})) }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));

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
