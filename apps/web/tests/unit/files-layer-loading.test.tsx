/**
 * gact-tui#366: FilesLayer.tsx carried two bare "Loading…" paragraphs
 * (workspace-file listing, single-file preview) — both now render the shared
 * kit Skeleton primitive instead.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Client } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { FilesLayer } from '../../src/session/FilesLayer';

function client(overrides: Record<string, unknown> = {}): Client {
  return {
    baseUrl: 'http://live.test',
    workspaceFiles: vi.fn(async () => ({ files: [], next_cursor: null })),
    readWorkspaceFile: vi.fn(async () => ({ content: '', encoding: 'text' })),
    ...overrides,
  } as unknown as Client;
}

describe('FilesLayer loading states render the Skeleton primitive (gact-tui#366)', () => {
  it('shows the Skeleton while the workspace file listing is in flight', async () => {
    let resolveFiles!: (value: { files: []; next_cursor: null }) => void;
    const c = client({
      workspaceFiles: vi.fn(() => new Promise((resolve) => (resolveFiles = resolve))),
    });
    render(
      <FilesLayer
        client={c}
        open
        workspaceId="ws_1"
        workspaceLabel="clio-agent"
        onAttach={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const skeleton = await screen.findByTestId('kit-skeleton');
    expect(skeleton).toHaveAttribute('role', 'status');
    expect(skeleton).toHaveAccessibleName('Loading workspace files…');

    resolveFiles({ files: [], next_cursor: null });
    await waitFor(() => expect(screen.queryByTestId('kit-skeleton')).toBeNull());
  });

  it('shows the Skeleton while a selected file\'s preview is in flight', async () => {
    const c = client({
      workspaceFiles: vi.fn(async () => ({
        files: [{ path: 'README.md', type: 'file' }],
        next_cursor: null,
      })),
      readWorkspaceFile: vi.fn(() => new Promise(() => {})), // never resolves
    });
    render(
      <FilesLayer
        client={c}
        open
        workspaceId="ws_1"
        workspaceLabel="clio-agent"
        onAttach={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const fileRow = await screen.findByRole('button', { name: /README\.md/ });
    fireEvent.click(fileRow);

    const skeleton = await screen.findByTestId('kit-skeleton');
    expect(skeleton).toHaveAttribute('role', 'status');
    expect(skeleton).toHaveAccessibleName('Loading file…');
  });
});
