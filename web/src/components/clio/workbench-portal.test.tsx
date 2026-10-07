import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ClioWorkbench, type ClioWorkbenchHandle } from './workbench';

// This regression concerns the portal and tab identity; payload rendering is
// covered by the real viewers' tests and the browser review.
vi.mock('./resource-viewers', () => ({
  ArtifactView: ({ artifact }: { artifact: { name: string } }) => (
    <article aria-label={`Artifact view: ${artifact.name}`}>{artifact.name}</article>
  ),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

it('maximizes over the shell and restores with Escape', async () => {
  const user = userEvent.setup();
  const handle = createRef<ClioWorkbenchHandle>();
  render(
    <ClioWorkbench
      artifacts={[]}
      blueprints={[]}
      diffs={[]}
      files={[]}
      onApplyDiff={vi.fn()}
      onOpenSubagent={vi.fn()}
      onRejectDiff={vi.fn()}
      ref={handle}
      requestedOpen={{ key: 'earlier-open', request: { kind: 'session' } }}
      sessionId="session_parent"
      sessionView={<p>Session intelligence</p>}
      workspaceId="workspace_1"
    />,
  );
  act(() =>
    handle.current?.open({
      kind: 'artifact',
      artifact: {
        id: 'figure',
        session_id: 'session_parent',
        name: 'Growth curves.png',
        media_type: 'image/png',
        uri: 'artifact://figure',
      },
    }),
  );
  await screen.findByRole('article', { name: 'Artifact view: Growth curves.png' });

  await user.click(screen.getByRole('button', { name: 'Maximize canvas' }));
  expect(screen.getByRole('tab', { name: 'Growth curves.png' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  expect(screen.getByRole('button', { name: 'Restore canvas beside conversation' })).toBeVisible();
  expect(screen.getByRole('complementary', { name: 'Workspace canvas' })).toHaveClass('fixed');

  const restoreEvent = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  act(() => window.dispatchEvent(restoreEvent));
  expect(restoreEvent.defaultPrevented).toBe(true);
  expect(screen.getByRole('button', { name: 'Maximize canvas' })).toBeVisible();
  expect(screen.getByRole('tab', { name: 'Growth curves.png' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});
