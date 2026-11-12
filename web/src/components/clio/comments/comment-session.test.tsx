import { TransportError, type CommentTarget } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommentSurface } from './comment-model';

const repository = {
  commentThreads: vi.fn(),
  sendCommentSession: vi.fn(),
  saveCommentDrafts: vi.fn(),
};

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://agent.test' } }),
}));

import {
  CommentSessionProvider,
  useCommentSession,
  type CommentSessionValue,
} from './comment-session';

const head: CommentTarget = {
  artifact_id: 'notes-v2',
  name: 'qa-notes.md',
  workspace_id: 'w1',
  version: 2,
  sha256: 'sha-2',
  path: 'qa-notes.md',
  producer: {},
};

const surface: CommentSurface = {
  title: 'qa-notes.md',
  modes: ['text'],
  defaultMode: 'text',
  destination: {
    kind: 'artifact',
    sessionId: 's1',
    artifactId: 'notes-v1',
    version: 1,
    sha256: 'sha-1',
  },
};

const stale = new TransportError(
  'the artifact has a newer version; mark it again there or send these as history',
  409,
  'stale_artifact_anchor',
  { selected_artifact_id: 'notes-v1', head_artifact_id: 'notes-v2', head_version: 2 },
);

const probe: { session?: CommentSessionValue } = {};
function Probe() {
  const value = useCommentSession();
  useEffect(() => {
    probe.session = value;
  });
  return null;
}

function renderSession(onOpenVersion?: (target: CommentTarget) => void) {
  repository.commentThreads.mockResolvedValue({
    artifact_id: 'notes-v1',
    head,
    next_label: 'S1',
    threads: [],
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CommentSessionProvider initiallyActive onOpenVersion={onOpenVersion} surface={surface}>
        <Probe />
      </CommentSessionProvider>
    </QueryClientProvider>,
  );
  act(() => {
    probe.session!.addMark({ profile: 'text-quote', exact: 'checkpoint writes' } as never);
  });
  act(() => probe.session!.setEditing(undefined));
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  probe.session = undefined;
});

describe('a send refused because the file has a newer version', () => {
  it('names both versions and offers both choices instead of the server text', async () => {
    const user = userEvent.setup();
    repository.sendCommentSession.mockRejectedValueOnce(stale);
    renderSession();
    await user.click(screen.getByRole('button', { name: 'Send 1 comment' }));

    const conflict = await screen.findByRole('alert');
    expect(conflict.textContent).toContain('Marked on version 1. The file is on version 2.');
    expect(conflict.textContent).not.toContain('stale');
    expect(screen.getByRole('button', { name: 'Mark again on the new version' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Send 1 comment' })).toBeNull();

    repository.sendCommentSession.mockResolvedValueOnce({ threads: [] });
    await user.click(screen.getByRole('button', { name: 'Send as history' }));
    expect(repository.sendCommentSession).toHaveBeenLastCalledWith(
      's1',
      expect.objectContaining({ artifact_id: 'notes-v1', allow_historical: true }),
    );
    expect(probe.session!.marks).toHaveLength(0);
  });

  it('moves the marks to the newest version in place, without a reload', async () => {
    const user = userEvent.setup();
    repository.sendCommentSession.mockRejectedValueOnce(stale);
    renderSession();
    await user.click(screen.getByRole('button', { name: 'Send 1 comment' }));
    await user.click(
      await screen.findByRole('button', { name: 'Mark again on the new version' }),
    );

    expect(screen.queryByRole('alert')).toBeNull();
    expect(probe.session!.marks).toHaveLength(1);
    repository.sendCommentSession.mockResolvedValueOnce({ threads: [] });
    await user.click(screen.getByRole('button', { name: 'Send 1 comment' }));
    expect(repository.sendCommentSession).toHaveBeenLastCalledWith(
      's1',
      expect.objectContaining({
        artifact_id: 'notes-v2',
        expected_version: 2,
        expected_sha256: 'sha-2',
      }),
    );
    expect(repository.sendCommentSession.mock.lastCall?.[1]).not.toHaveProperty(
      'allow_historical',
    );
  });

  it('opens the newest version, keeping the marks as its draft, from a fixed version', async () => {
    const user = userEvent.setup();
    const opened: CommentTarget[] = [];
    repository.sendCommentSession.mockRejectedValueOnce(stale);
    repository.saveCommentDrafts.mockResolvedValue({});
    renderSession((target) => opened.push(target));
    await user.click(screen.getByRole('button', { name: 'Send 1 comment' }));
    await user.click(
      await screen.findByRole('button', { name: 'Mark again on the new version' }),
    );

    expect(repository.saveCommentDrafts).toHaveBeenCalledWith(
      'notes-v2',
      expect.objectContaining({ expected_version: 2, expected_sha256: 'sha-2' }),
    );
    expect(opened).toEqual([head]);
  });
});
