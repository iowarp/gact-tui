/**
 * Panels conformance (docs/p5/conformance/panels.json, PASS 1).
 *
 * The prototype's own source settles this: files/artifacts/ctx are overlays
 * (`layerFiles` / `layerObs`+`obsTab`), never right-pane content — files gets
 * its OWN modal window (LayerChrome), artifacts/ctx deep-link into the SAME
 * observability layer the eye icon opens, just on a different tab
 * (`tgArtifacts`/`tgTelemetry` in the prototype's own source).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Client, Message, Session } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { Observability } from '../../src/observability/Observability';
import type { ObservabilityData } from '../../src/observability/types';
import { SessionView } from '../../src/session/SessionView';
import { Topbar } from '../../src/shell/Topbar';

const SESSIONS = [
  { id: 'sess_a', title: 'LA ground motion', status: 'running', workspace_id: 'ws_default' },
] as unknown as Session[];
const MESSAGES = [
  { id: 'm1', role: 'assistant', parts: [{ type: 'text', text: 'ready' }] },
] as unknown as Message[];

function client(overrides: Record<string, unknown> = {}): Client {
  return {
    baseUrl: 'http://live.test',
    messages: vi.fn(async () => ({ messages: MESSAGES })),
    getSession: vi.fn(async () => ({
      id: 'sess_a',
      workspace_id: 'ws_default',
      mode: 'edit',
      approval_mode: 'ask',
    })),
    workspaces: vi.fn(async () => ({
      workspaces: [{ id: 'ws_default', name: 'clio-agent', root_path: '/work/clio-agent' }],
    })),
    workspaceFiles: vi.fn(async () => ({
      files: [{ path: 'notes/run_notes.md', size: 512, type: 'file', language: 'markdown' }],
      next_cursor: null,
    })),
    workspaceReadFile: vi.fn(async () => ({
      path: 'notes/run_notes.md',
      content: 'first line of the run notes',
      mime: 'text/markdown',
      size: 512,
    })),
    commands: vi.fn(async () => ({ commands: [] })),
    providers: vi.fn(async () => ({ providers: [] })),
    get: vi.fn(async () => ({ tasks: [] })),
    ...overrides,
  } as unknown as Client;
}

async function selectSession(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
  await screen.findByText('ready');
}

describe('files layer — modal window, not a right pane', () => {
  it('opens as a LayerChrome dialog naming the workspace, with an honestly-degraded browse control', async () => {
    render(<SessionView client={client()} sessions={SESSIONS} />);
    await selectSession();
    fireEvent.click(screen.getByRole('button', { name: 'files' }));

    const dialog = await screen.findByRole('dialog', { name: 'files' });
    expect(dialog).toHaveTextContent('clio-agent');
    const browse = within(dialog).getByRole('button', { name: /browse/i });
    expect(browse).toBeDisabled();
    expect(browse).toHaveAttribute('title', expect.stringMatching(/not wired|no filesystem/i));
  });

  it('previews a selected file with a working attach and an honestly-degraded save', async () => {
    render(<SessionView client={client()} sessions={SESSIONS} />);
    await selectSession();
    fireEvent.click(screen.getByRole('button', { name: 'files' }));
    const dialog = await screen.findByRole('dialog', { name: 'files' });

    fireEvent.click(within(dialog).getByRole('button', { name: /run_notes\.md/i }));
    await within(dialog).findByText(/first line of the run notes/i);

    const save = within(dialog).getByRole('button', { name: /^save$/i });
    expect(save).toBeDisabled();
    expect(save).toHaveAttribute('title', expect.stringMatching(/not wired|write endpoint/i));

    fireEvent.click(within(dialog).getByRole('button', { name: /attach to message/i }));
    // Attaching closes the files layer and lands a real reference in the draft
    // — the prototype's own button has no click handler at all, so this is a
    // functional improvement, not merely cosmetic parity.
    expect(screen.queryByRole('dialog', { name: 'files' })).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /message/i })).toHaveValue(
        '@notes/run_notes.md',
      ),
    );
  });
});

describe('files layer — folder tree, not a flat list', () => {
  function treeClient() {
    return client({
      workspaceFiles: vi.fn(async () => ({
        files: [
          { path: 'data/earthscope_stations.csv', size: 128, type: 'file', mime: 'text/csv' },
          { path: 'data/nested/deep.txt', size: 4, type: 'file' },
          { path: 'README.md', size: 42, type: 'file', language: 'markdown' },
        ],
        next_cursor: null,
      })),
    });
  }

  it('groups a flat backend listing into real nested folders, root level open by default', async () => {
    render(<SessionView client={treeClient()} sessions={SESSIONS} />);
    await selectSession();
    fireEvent.click(screen.getByRole('button', { name: 'files' }));
    const dialog = await screen.findByRole('dialog', { name: 'files' });

    // Root-level folder + file both visible without any click.
    await within(dialog).findByRole('button', { name: /^data/ });
    expect(within(dialog).getByRole('button', { name: /readme\.md/i })).toBeInTheDocument();
    // A file two levels deep starts hidden — its grandparent folder is closed.
    expect(within(dialog).queryByRole('button', { name: /deep\.txt/i })).toBeNull();
  });

  it('expands a nested folder on click to reveal its file', async () => {
    render(<SessionView client={treeClient()} sessions={SESSIONS} />);
    await selectSession();
    fireEvent.click(screen.getByRole('button', { name: 'files' }));
    const dialog = await screen.findByRole('dialog', { name: 'files' });
    await within(dialog).findByRole('button', { name: /earthscope_stations\.csv/i });

    fireEvent.click(within(dialog).getByRole('button', { name: /^nested/ }));
    expect(within(dialog).getByRole('button', { name: /deep\.txt/i })).toBeInTheDocument();
  });

  it('filtering reveals a deep match without requiring the user to expand its ancestors first', async () => {
    render(<SessionView client={treeClient()} sessions={SESSIONS} />);
    await selectSession();
    fireEvent.click(screen.getByRole('button', { name: 'files' }));
    const dialog = await screen.findByRole('dialog', { name: 'files' });
    await within(dialog).findByRole('button', { name: /readme\.md/i });

    fireEvent.change(within(dialog).getByRole('textbox', { name: /filter workspace files/i }), {
      target: { value: 'deep' },
    });
    expect(within(dialog).getByRole('button', { name: /deep\.txt/i })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /readme\.md/i })).toBeNull();
  });
});

describe('files layer — the wire spells directories "dir", not "directory"', () => {
  // Probed live against 127.0.0.1:17900's /v1/workspaces/{id}/files: clio
  // lists directories as their OWN entries (`{"path":".claude","type":"dir"}`)
  // ahead of their children, not merely implied by a file's parent path.
  // docs/p5/conformance/panels.json's audit_correction: checking only
  // `type === 'directory'` is a no-op against this real spelling, so every
  // directory entry fell into the file branch and both the directory ROW
  // itself and its children (nested under a node now permanently typed
  // 'file') rendered as flat doc-icon rows with no chevron/expansion.
  function dirWireClient() {
    return client({
      workspaceFiles: vi.fn(async () => ({
        files: [
          { path: '.claude', type: 'dir' },
          { path: '.claude/CLAUDE.md', size: 21_554, type: 'file' },
          { path: 'empty-dir', type: 'dir' },
          { path: 'README.md', size: 42, type: 'file', language: 'markdown' },
        ],
        next_cursor: null,
      })),
    });
  }

  it('renders a wire-listed "dir" entry as a folder chevron row, not a flat file row', async () => {
    render(<SessionView client={dirWireClient()} sessions={SESSIONS} />);
    await selectSession();
    fireEvent.click(screen.getByRole('button', { name: 'files' }));
    const dialog = await screen.findByRole('dialog', { name: 'files' });

    const claudeRow = await within(dialog).findByRole('button', { name: /^\.claude/ });
    expect(claudeRow.querySelector('[data-open]')).not.toBeNull();
    // An empty directory (no children ever reference it as a parent) still
    // renders as a folder, not a 0 B file.
    const emptyRow = within(dialog).getByRole('button', { name: /^empty-dir/ });
    expect(emptyRow.querySelector('[data-open]')).not.toBeNull();
  });

  it('still nests and expands a directory entry\'s children instead of orphaning them under a file-typed node', async () => {
    render(<SessionView client={dirWireClient()} sessions={SESSIONS} />);
    await selectSession();
    fireEvent.click(screen.getByRole('button', { name: 'files' }));
    const dialog = await screen.findByRole('dialog', { name: 'files' });

    await within(dialog).findByRole('button', { name: /^\.claude/ });
    // Root-level directories start open (matches the prototype's demo tree),
    // so the child is visible without an extra click.
    expect(within(dialog).getByRole('button', { name: /claude\.md/i })).toBeInTheDocument();
  });
});

describe('topbar artifacts/ctx pills deep-link into observability, they never own a panel', () => {
  function renderTopbar(extra: Partial<Parameters<typeof Topbar>[0]> = {}) {
    return render(
      <Topbar title="a session" railCollapsed={false} onShowRail={vi.fn()} {...extra} />,
    );
  }

  it('reports pressed from panel+obsTab together, not a fake "artifacts"/"context" panel value', () => {
    const { rerender } = renderTopbar({ panel: 'obs', obsTab: 'artifacts' });
    expect(screen.getByRole('button', { name: 'artifacts' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'ctx' })).toHaveAttribute('aria-pressed', 'false');

    rerender(
      <Topbar
        title="a session"
        railCollapsed={false}
        onShowRail={vi.fn()}
        panel="obs"
        obsTab="context"
      />,
    );
    expect(screen.getByRole('button', { name: 'artifacts' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'ctx' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('the artifacts pill stays cyan-accented even when nothing is open (hardcoded in the prototype)', () => {
    renderTopbar();
    const button = screen.getByRole('button', { name: 'artifacts' });
    expect(getComputedStyle(button).color).not.toBe('');
  });
});

describe('observability context tab — real telemetry, honestly degraded where unbacked', () => {
  function data(overrides: Partial<ObservabilityData> = {}): ObservabilityData {
    return {
      agents: [],
      runs: [],
      toolsByExpert: {},
      artifacts: [],
      timeline: [],
      spans: [],
      artifactRows: [],
      context: { usedPercent: 41, tokens: 82_100, limit: 200_000 },
      ...overrides,
    };
  }

  it('shows relay latency and thinking tokens as honestly "not reported" — never fabricated', () => {
    render(<Observability data={data()} initialTab="context" />);
    const tab = screen.getByTestId('obs-context');
    expect(within(tab).getByText('relay latency').closest('[data-unbacked]')).toHaveTextContent(
      'not reported',
    );
    expect(within(tab).getByText('thinking tokens').closest('[data-unbacked]')).toHaveTextContent(
      'not reported',
    );
  });

  it('shows a real cost tile from summed message cost_usd, not an estimate', () => {
    render(<Observability data={data({ context: { usedPercent: 41, tokens: 82_100, limit: 200_000, costUsd: 0.31 } })} initialTab="context" />);
    const tile = screen.getByText('cost').closest('.obs-context__tile');
    expect(tile).not.toHaveAttribute('data-unbacked');
    expect(tile).toHaveTextContent('$0.31');
  });

  it('lists only non-terminal runs under "live now", built from the SAME runs the runs tab shows', () => {
    render(
      <Observability
        data={data({
          runs: [
            { id: 'r1', agent: 'getstripe', state: 'running', label: 'stripe-tuner', host: 'ares' },
            { id: 'r2', agent: 'gnss', state: 'completed', label: 'done-job' },
          ],
        })}
        initialTab="context"
      />,
    );
    const live = screen.getByTestId('obs-context-live');
    expect(live).toHaveTextContent('live now · 1');
    expect(live).toHaveTextContent('stripe-tuner');
    expect(live).not.toHaveTextContent('done-job');
  });

  it('omits the live-now box entirely when nothing is running', () => {
    render(
      <Observability
        data={data({ runs: [{ id: 'r1', agent: 'gnss', state: 'completed', label: 'done-job' }] })}
        initialTab="context"
      />,
    );
    expect(screen.queryByTestId('obs-context-live')).toBeNull();
  });
});
