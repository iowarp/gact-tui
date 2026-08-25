import type { ContextSnapshot } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioContextCanvasPanel } from './context-canvas-panel';

afterEach(cleanup);

const context: ContextSnapshot = {
  session_id: 'sess_1',
  scope: 'main',
  used_tokens: 460_000,
  limit_tokens: 922_000,
  live_tokens: 12_000,
  live_block_count: 2,
  autocompact_enabled: true,
  autocompact_pct: 0.85,
  categories: { framing: 448_000, conversation: 8_000, tools: 4_000 },
  provenance: { source: 'server', observed_at: '2026-08-23T12:01:00Z', stale: false },
};

describe('ClioContextCanvasPanel', () => {
  it('selects an agent, shows token composition, and mutates compaction controls', async () => {
    const user = userEvent.setup();
    const onCompact = vi.fn().mockResolvedValue(undefined);
    const onTargetChange = vi.fn();
    const onUpdatePreferences = vi.fn().mockResolvedValue(undefined);
    render(
      <ClioContextCanvasPanel
        context={context}
        files={[]}
        frames={[]}
        onCompact={onCompact}
        onTargetChange={onTargetChange}
        onUpdatePreferences={onUpdatePreferences}
        selectedTargetId="sess_1"
        targets={[
          { id: 'sess_1', label: 'EarthScope', detail: 'Main agent' },
          { id: 'sess_2', label: 'Station analyst', detail: 'Child agent' },
        ]}
      />,
    );

    expect(screen.getByText('Context composition')).toBeVisible();
    expect(screen.getByText('460K of 922K tokens')).toBeVisible();
    expect(screen.getByText('framing')).toBeVisible();
    expect(screen.queryByText('Session-only working context')).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: 'Context agent' }));
    await user.click(screen.getByRole('option', { name: /Station analyst/ }));
    expect(onTargetChange).toHaveBeenCalledWith('sess_2');

    await user.click(screen.getByRole('switch', { name: 'Automatic compaction' }));
    expect(onUpdatePreferences).toHaveBeenCalledWith({ automatic_compaction: false });

    await user.click(screen.getByRole('button', { name: 'Compact now' }));
    expect(screen.getByRole('alertdialog')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Compact now' }));
    expect(onCompact).toHaveBeenCalledOnce();
  });

  it('keeps controls truthful when the selected agent has no context', async () => {
    const user = userEvent.setup();
    render(
      <ClioContextCanvasPanel
        context={{ ...context, live_block_count: 0 }}
        files={[]}
        frames={[]}
        onCompact={vi.fn()}
        selectedTargetId="sess_1"
        targets={[{ id: 'sess_1', label: 'EarthScope', detail: 'Main agent' }]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Compact now' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /Saved snapshot/ }));
    expect(screen.getByText('No saved snapshot for this agent.')).toBeVisible();
  });
});
