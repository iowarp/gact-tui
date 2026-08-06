import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Client, Message, Session } from '@clio/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_VERSION } from '../../src/build-info';
import { Composer } from '../../src/composer/Composer';
import { SessionView } from '../../src/session/SessionView';

const SESSIONS = [
  { id: 'sess_a', title: 'LA ground motion', status: 'running', workspace_id: 'ws_default' },
  { id: 'sess_b', title: 'membudget 1', status: 'idle', workspace_id: 'ws_default' },
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
      model: { provider_id: 'anthropic', model_id: 'sonnet', variant: '' },
    })),
    workspaces: vi.fn(async () => ({
      workspaces: [{ id: 'ws_default', name: 'clio-agent', root_path: '/work/clio-agent' }],
    })),
    commands: vi.fn(async () => ({ commands: [] })),
    providers: vi.fn(async () => ({
      providers: [
        { id: 'anthropic', name: 'Anthropic', is_authenticated: true },
        { id: 'codex', name: 'Codex', is_authenticated: true },
      ],
    })),
    providerModels: vi.fn(async (providerId: string) => ({
      models:
        providerId === 'anthropic'
          ? [{ id: 'sonnet', name: 'Sonnet' }, { id: 'opus', name: 'Opus' }]
          : [{ id: 'gpt-5.6', name: 'GPT-5.6' }],
    })),
    lmConfig: vi.fn(async () => ({
      configured: { provider_id: 'anthropic', model_id: 'sonnet' },
      presets: [
        { provider_id: 'anthropic', status: 'configured' },
        { provider_id: 'codex', status: 'available' },
      ],
    })),
    workspaceFiles: vi.fn(async () => ({
      files: [{ path: 'README.md', size: 42, type: 'file', language: 'markdown' }],
      next_cursor: null,
    })),
    workspaceReadFile: vi.fn(async () => ({
      path: 'README.md',
      content: '# hello from the workspace',
      mime: 'text/markdown',
      size: 42,
    })),
    // FilesLayer reads through `readWorkspaceFile` (base64 + media_type,
    // the raw-bytes route — never `workspaceReadFile`'s JSON-shaped
    // sibling, which the real read route doesn't actually return).
    readWorkspaceFile: vi.fn(async () => ({
      path: 'README.md',
      display_path: 'README.md',
      size: 42,
      media_type: 'text/markdown',
      source_media_type: 'text/markdown',
      encoding: 'base64',
      data: Buffer.from('# hello from the workspace', 'utf-8').toString('base64'),
    })),
    agentBlueprints: vi.fn(async () => ({
      blueprints: [{ id: 'earthscope-flat', title: 'EarthScope flat' }],
    })),
    expertPacks: vi.fn(async () => ({ packs: [{ id: 'gnss-pack', title: 'GNSS pack' }] })),
    get: vi.fn(async (path: string) => {
      if (path.includes('/artifacts')) {
        return {
          artifacts: [
            {
              name: 'station.csv',
              kind: 'dataset',
              head_artifact_id: 'art_1',
              versions: [
                { artifact_id: 'art_1', name: 'station.csv', version: 1, kind: 'dataset', size_bytes: 128 },
              ],
            },
          ],
        };
      }
      if (path.includes('/context')) {
        return {
          used_pct: 0.38,
          used_tokens: 3800,
          window_tokens: 10000,
          categories: [{ name: 'messages', tokens: 2400 }],
          segments: [],
        };
      }
      return { tasks: [] };
    }),
    patchSession: vi.fn(async () => ({})),
    createSession: vi.fn(async () => ({
      id: 'sess_new',
      title: 'GNSS comparison',
      workspace_id: 'ws_default',
      status: 'idle',
    })),
    setSessionBlueprint: vi.fn(async () => ({})),
    setSessionExpertPack: vi.fn(async () => ({})),
    sendMessage: vi.fn(async () => ({})),
    ...overrides,
  } as unknown as Client;
}

async function selectSession(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
  await screen.findByText('ready');
}

afterEach(() => {
  delete (window as { isTauri?: boolean }).isTauri;
});

describe('owner review 1 contracts', () => {
  it('lets the breadcrumb title shrink to its content instead of reserving a fixed gap', () => {
    const css = readFileSync(resolve(__dirname, '../../src/shell/topbar.css'), 'utf8');
    expect(css).not.toMatch(/\.shell-topbar__title\s*{[^}]*min-width:\s*110px/s);
    expect(css).toMatch(/\.shell-topbar__identity\s+\.kit-inlineedit\s*{[^}]*flex:\s*0\s+1\s+auto/s);
  });

  it('opens files as its own modal layer, artifacts/ctx as observability tabs, and docks console below', async () => {
    // Superseded by panels.json PASS 1: files/artifacts/ctx are OVERLAYS in the
    // prototype (layerFiles / layerObs+obsTab), not right-pane content — an
    // earlier owner-review round routed them into the detail slot, which
    // kit/Layer.tsx's own #331 doc comment already flagged as the wrong place.
    (window as { isTauri?: boolean }).isTauri = true;
    const wire = client();
    render(<SessionView client={wire} sessions={SESSIONS} />);
    await selectSession();

    fireEvent.click(screen.getByRole('button', { name: 'files' }));
    const filesLayer = await screen.findByRole('dialog', { name: 'files' });
    fireEvent.click(within(filesLayer).getByRole('button', { name: /readme\.md/i }));
    await within(filesLayer).findByText(/hello from the workspace/i);

    fireEvent.click(screen.getByRole('button', { name: 'artifacts' }));
    expect(screen.queryByRole('dialog', { name: 'files' })).toBeNull();
    const obsLayer = await screen.findByRole('dialog', { name: /observability/i });
    await within(obsLayer).findByText('station.csv');
    expect(within(obsLayer).getByRole('tab', { name: /^artifacts/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'ctx' }));
    await waitFor(() =>
      expect(within(obsLayer).getByTestId('obs-context')).toHaveTextContent(/38%/),
    );
    expect(within(obsLayer).getByRole('tab', { name: /^context/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: 'console' }));
    expect(screen.queryByRole('dialog', { name: /observability/i })).toBeNull();
    const dock = screen.getByTestId('console-dock');
    expect(dock).toHaveAttribute('data-unbacked', 'true');
    expect(dock).toHaveTextContent(/no session shell|pty/i);
  });

  it('opens rail search and filters live sessions as the user types', async () => {
    const wire = client();
    render(<SessionView client={wire} sessions={SESSIONS} />);
    const trigger = screen.getByRole('button', { name: /search sessions/i });
    expect(trigger).toBeEnabled();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: /search/i });
    fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: 'membudget' } });
    expect(within(dialog).queryByText('LA ground motion')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: /membudget 1/i }));
    await waitFor(() => expect(wire.messages).toHaveBeenCalledWith('sess_b'));
    expect(screen.queryByRole('dialog', { name: /search/i })).toBeNull();
  });

  it('collects the + new fields and does not create before CREATE', async () => {
    const wire = client();
    render(<SessionView client={wire} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: /new session/i }));
    const dialog = await screen.findByRole('dialog', { name: /new/i });
    expect(wire.createSession).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('tab', { name: /session/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('tab', { name: /workspace/i })).toBeInTheDocument();
    fireEvent.change(within(dialog).getByRole('textbox', { name: /session name/i }), {
      target: { value: 'GNSS comparison' },
    });
    fireEvent.change(within(dialog).getByLabelText(/agent blueprint/i), {
      target: { value: 'earthscope-flat' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /create session/i }));
    await waitFor(() =>
      expect(wire.createSession).toHaveBeenCalledWith({
        title: 'GNSS comparison',
        workspace_id: 'ws_default',
      }),
    );
    expect(wire.setSessionBlueprint).toHaveBeenCalledWith('sess_new', {
      blueprint_id: 'earthscope-flat',
    });
  });

  it('renders the prototype execute menu grammar and submits its real plan mode', () => {
    const onSubmit = vi.fn();
    render(
      <Composer
        models={[]}
        modelId={String()}
        sessionMode={'execute'}
        onModelChange={() => {}}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /execute/i }));
    const menu = screen.getByRole('menu', { name: /turn mode/i });
    expect(menu).toHaveTextContent('Act on the workspace under the permission mode');
    expect(menu).toHaveTextContent(/Read-only.*plan changes, never apply/);
    fireEvent.click(within(menu).getByRole('menuitem', { name: /plan/i }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'make a plan' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith({ text: 'make a plan', mode: 'plan' });
  });

  it('maps the visible plan choice to the backend session mode before sending', async () => {
    const wire = client();
    render(<SessionView client={wire} sessions={SESSIONS} />);
    await selectSession();
    fireEvent.click(screen.getByRole('button', { name: 'Execute' }));
    fireEvent.click(within(screen.getByRole('menu', { name: /turn mode/i })).getByRole('menuitem', { name: /plan/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /message/i }), { target: { value: 'plan the change' } });
    fireEvent.keyDown(screen.getByRole('textbox', { name: /message/i }), { key: 'Enter' });
    await waitFor(() => expect(wire.patchSession).toHaveBeenCalledWith('sess_a', { mode: 'plan' }));
    expect(wire.sendMessage).toHaveBeenCalledWith('sess_a', { text: 'plan the change' });
  });

  it('opens a two-pane provider and model catalogue without binding global LM config', async () => {
    const wire = client();
    render(<SessionView client={wire} sessions={SESSIONS} />);
    await selectSession();
    fireEvent.click(screen.getByRole('combobox', { name: /model/i }));
    const picker = screen.getByRole('dialog', { name: /model/i });
    expect(within(picker).getByText('providers')).toBeInTheDocument();
    // The prototype's popRouter block has no "models" eyebrow over the right
    // pane (only the left pane's header carries one) — the model column
    // starts directly at the row list. p5 grind menus-grammar: this used to
    // assert an extraneous eyebrow the app had added; removed to match.
    expect(within(picker).queryByText('models')).toBeNull();
    expect(within(picker).getByRole('button', { name: /anthropic/i })).toBeInTheDocument();
    fireEvent.click(within(picker).getByRole('button', { name: /codex/i }));
    expect(within(picker).getByRole('option', { name: /gpt-5\.6/i })).toBeInTheDocument();
    expect(wire.lmConfig).toHaveBeenCalled();
    expect((wire as unknown as { setLm?: unknown }).setLm).toBeUndefined();
  });

  it('opens the prototype update surface from the composer version stamp', async () => {
    const wire = client();
    render(
      <SessionView
        client={wire}
        sessions={SESSIONS}
        backendVersion={'0.9.0+42522bb1'}
        newBuildAvailable
      />,
    );
    await screen.findByText('/work/clio-agent');
    await waitFor(() => expect(wire.providerModels).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByTestId('version-stamp'));
    expect(
      screen.getByTestId('version-stamp').querySelector('.version-update__visual'),
    ).toHaveTextContent(APP_VERSION);
    const updates = screen.getByRole('dialog', { name: /updates/i });
    expect(updates).toHaveTextContent(/clio-web/i);
    expect(updates).toHaveTextContent(/clio-agent/i);
    expect(updates).toHaveTextContent(/auto-update on launch/i);
  });
});
