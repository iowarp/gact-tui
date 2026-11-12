import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ArtifactReview, CommentThreadList as ThreadList } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { repository } = vi.hoisted(() => ({
  repository: { commentThreads: vi.fn(), commentCrop: vi.fn() },
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:8790' } }),
}));

import { CommentThreadList } from './comment-thread-list';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function thread(changes: Partial<ArtifactReview> = {}): ArtifactReview {
  return {
    id: 'rev_1',
    session_id: 'sess_1',
    workspace_id: 'ws_1',
    artifact_id: 'art_paper_v1',
    artifact_name: 'paper-bb',
    artifact_version: 1,
    artifact_sha256: 'a'.repeat(64),
    anchor: { profile: 'source-map', exact: 'Burst buffers absorb checkpoint writes' },
    text: 'Say how much faster.',
    status: 'dispatched',
    native: false,
    created_at: '2026-11-06T00:00:00Z',
    label: 'S1',
    ...changes,
  };
}

function list(threads: ArtifactReview[]): ThreadList {
  return {
    artifact_id: 'art_paper_v1',
    head: {
      artifact_id: 'art_paper_v1',
      name: 'paper-bb',
      workspace_id: 'ws_1',
      version: 1,
      sha256: 'a'.repeat(64),
      path: 'paper-bb/main.tex',
      producer: {},
    },
    next_label: 'S2',
    threads,
  };
}

function renderList(version?: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CommentThreadList artifactId="art_paper_v1" sessionId="sess_1" version={version} />
    </QueryClientProvider>,
  );
}

describe('CommentThreadList', () => {
  it("lists the version on screen, and gives one send's reply once", async () => {
    const reply = { reply_text: 'Tightened both sentences.', reply_message_id: 'msg_reply_2' };
    repository.commentThreads.mockResolvedValue(
      list([
        thread({ id: 'rev_old', label: 'S1', text: 'Old note.', reply_message_id: 'msg_reply_1' }),
        thread({ id: 'rev_a', label: 'S2', text: 'First.', artifact_version: 2, ...reply }),
        thread({ id: 'rev_b', label: 'S3', text: 'Second.', artifact_version: 2, ...reply }),
      ]),
    );
    renderList(2);
    expect(await screen.findByText('First.')).toBeTruthy();
    expect(screen.getByText('Second.')).toBeTruthy();
    expect(screen.queryByText('Old note.')).toBeNull();
    expect(document.querySelectorAll('[data-slot="comment-reply"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '1 comment on other versions' }));
    expect(screen.getByText('Old note.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Only version 2' }));
    expect(screen.queryByText('Old note.')).toBeNull();
  });

  it("renders the agent's reply as Markdown, not as its source", async () => {
    repository.commentThreads.mockResolvedValue(
      list([
        thread({
          reply_text:
            'Rewrote the sentence with **2.4x** faster checkpoints:\n\n- `sections/background.tex`, line 4\n- the abstract',
          reply_version_artifact_id: 'art_paper_v2',
        }),
      ]),
    );
    renderList();
    const reply = await screen.findByText(
      (_, node) => node?.getAttribute('data-slot') === 'comment-reply',
    );
    // The Markdown renderer loads lazily: wait for it, not for its plain-text fallback.
    const bold = await within(reply).findByText('2.4x', {}, { timeout: 5_000 });
    expect(bold.getAttribute('data-streamdown')).toBe('strong');
    expect(within(reply).getByText('sections/background.tex').getAttribute('data-streamdown')).toBe(
      'inline-code',
    );
    expect(within(reply).getAllByRole('listitem')).toHaveLength(2);
    expect(reply.textContent).not.toContain('**');
    expect(screen.getByText('The agent made a new version.')).toBeTruthy();
  });

  it('shows no reply block before the agent answers', async () => {
    repository.commentThreads.mockResolvedValue(list([thread()]));
    renderList();
    expect(await screen.findByText('Say how much faster.')).toBeTruthy();
    expect(document.querySelector('[data-slot="comment-reply"]')).toBeNull();
  });
});
