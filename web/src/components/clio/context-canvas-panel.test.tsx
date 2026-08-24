import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContextSnapshot } from '@clio/core/v3';
import { ClioContextCanvasPanel } from './context-canvas-panel';

afterEach(cleanup);

const context: ContextSnapshot = {
  session_id: 'sess_1',
  scope: 'main',
  used_tokens: 460_000,
  limit_tokens: 922_000,
  live_tokens: 12_000,
  live_block_count: 2,
  autocompact_pct: 0.85,
  categories: { conversation: 8_000, tools: 4_000 },
  provenance: { source: 'server', observed_at: '2026-08-23T12:01:00Z', stale: false },
};

describe('ClioContextCanvasPanel', () => {
  it('explains compartment policy, opens retained files, and confirms compaction', async () => {
    const user = userEvent.setup();
    const onOpenFile = vi.fn();
    const onCompact = vi.fn().mockResolvedValue(undefined);
    render(
      <ClioContextCanvasPanel
        context={context}
        files={[
          {
            path: 'D:/science/stations.csv',
            display_path: 'stations.csv',
            mode: 'read',
            language: 'csv',
          },
        ]}
        frames={[
          {
            id: 'frame_1',
            session_id: 'sess_1',
            created_at: '2026-08-23T12:00:00Z',
            updated_at: '2026-08-23T12:01:00Z',
            status: 'completed',
            model: {},
            agent: {},
            prompt: {},
            items: [
              {
                kind: 'file',
                path: 'D:/science/stations.csv',
                display_path: 'stations.csv',
                included: true,
                tokens_estimated: 800,
                metadata: {},
              },
            ],
            tokens_estimated: 800,
            metadata: {},
          },
        ]}
        onCompact={onCompact}
        onOpenFile={onOpenFile}
        policy={{
          session_id: 'sess_1',
          memory_scope: 'session',
          writable_scope: 'session',
          cross_session_read_available: true,
          requires_user_consent: true,
          notes: ['Other-workspace memory is denied by default.'],
          metadata: {},
        }}
      />,
    );

    expect(screen.getByText('Session-only working context')).toBeVisible();
    expect(screen.getByText('Main session')).toHaveAttribute('title', 'Recorded scope: main');
    expect(screen.getByText('Active context items')).toBeVisible();
    expect(screen.getByText('When context reaches 85%')).toHaveAttribute(
      'title',
      'Recorded automatic compaction threshold: 0.85',
    );
    expect(screen.getByText('Agent service')).toHaveAttribute('title', 'Recorded source: server');
    expect(screen.getByText('Other-workspace memory is denied by default.')).toBeVisible();
    await user.click(screen.getAllByRole('button', { name: /stations\.csv/i })[0]!);
    expect(onOpenFile).toHaveBeenCalledWith('D:/science/stations.csv');

    await user.click(screen.getByRole('button', { name: 'Summarize working context' }));
    expect(screen.getByRole('alertdialog')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Summarize now' }));
    expect(onCompact).toHaveBeenCalledOnce();
  });

  it('does not imply compaction progress when the selected scope is empty', () => {
    render(
      <ClioContextCanvasPanel
        context={{ ...context, live_block_count: 0 }}
        files={[]}
        frames={[]}
        onCompact={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Summarize working context' })).toBeDisabled();
    expect(
      screen.getByText('There are no active context items to summarize in this session.'),
    ).toBeVisible();
  });
});
