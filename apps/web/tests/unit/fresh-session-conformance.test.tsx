/**
 * P5 fresh-session pass — the idle/no-session screen conformance
 * (docs/p5/conformance/fresh-session.json), measured against
 * design/prototype/Clio Session.html's own state (emptyGreeting,
 * emptyStarted, emptySuggest/emptyStarters, activeBpLabel, pillSpacer).
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Client, Workspace } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { SessionView } from '../../src/session/SessionView';

const WORKSPACES: Workspace[] = [
  { id: 'ws1', name: 'clio-agent', root_path: '/scratch/j4471' },
] as unknown as Workspace[];

function idleClient(overrides: Record<string, unknown> = {}): Client {
  return {
    baseUrl: 'http://live.test',
    workspaces: vi.fn(async () => ({ workspaces: WORKSPACES })),
    ...overrides,
  } as unknown as Client;
}

describe('topbar placeholders before any session exists', () => {
  it('shows the literal "untitled session" title, not a blank header', async () => {
    render(<SessionView client={idleClient()} sessions={[]} />);
    const title = screen.getByRole('banner').querySelector('.shell-topbar__title');
    expect(title?.textContent).toBe('untitled session');
    // Flush the workspaces() fetch the component kicks off on mount so it
    // does not resolve, unawaited, after the test has already finished.
    await screen.findByTestId('suggested-prompts');
  });

  it('shows a clickable "no blueprint" breadcrumb, backed by an honest empty window', async () => {
    render(<SessionView client={idleClient()} sessions={[]} />);
    const crumb = screen.getByRole('banner').querySelector('.shell-topbar__crumb');
    expect(crumb?.textContent).toBe('no blueprint');
    const button = screen.getByRole('button', { name: /no blueprint/i });
    expect(button).toHaveAttribute('title', 'Pick a blueprint for this session');
    fireEvent.click(button);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/no blueprint is attached/i);
  });
});

describe('the idle headline and default pill (fresh-session.json)', () => {
  it('greets with the rust glyph + "Ready on {default workspace}"', async () => {
    render(<SessionView client={idleClient()} sessions={[]} />);
    await waitFor(() => expect(screen.getByText('Ready on /scratch/j4471')).toBeInTheDocument());
  });

  it('shows the composer pill defaulted to the connection + default workspace, ctx 0%', async () => {
    render(<SessionView client={idleClient()} sessions={[]} />);
    await waitFor(() => expect(screen.getByText(/live\.test:/)).toBeInTheDocument());
    expect(screen.getByText(/ctx 0%/)).toBeInTheDocument();
  });

  it('falls back to a bare "Ready" when no workspace is known at all — never invents a path', async () => {
    const client = idleClient({ workspaces: vi.fn(async () => ({ workspaces: [] })) });
    render(<SessionView client={client} sessions={[]} />);
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Ready' })).toBeInTheDocument());
  });
});

describe('SUGGESTED prompts (fresh-session.json rows 1-3)', () => {
  it('renders the three prototype starters and fills the composer on click', async () => {
    render(<SessionView client={idleClient()} sessions={[]} />);
    const block = await screen.findByTestId('suggested-prompts');
    expect(within(block).getByText('Profile a dataset')).toBeInTheDocument();
    expect(within(block).getByText('in /scratch/j4471')).toBeInTheDocument();
    expect(within(block).getByText('Run a benchmark sweep')).toBeInTheDocument();
    expect(within(block).getByText('on ares, compared against last week')).toBeInTheDocument();
    expect(within(block).getByText('Find what is filling scratch')).toBeInTheDocument();
    expect(within(block).getByText('and propose what to archive')).toBeInTheDocument();

    fireEvent.click(within(block).getByText('Profile a dataset'));
    const textarea = screen.getByRole('textbox', { name: /message/i }) as HTMLTextAreaElement;
    await waitFor(() => expect(textarea.value).toBe('Profile a dataset'));
  });

  it('hides SUGGESTED and the headline once a turn has actually gone out', async () => {
    let resolveSend: (() => void) | undefined;
    // The backend session comes into being with ZERO messages; the sent one
    // only appears once sendMessage itself resolves — mirroring the real
    // request order (create -> the effect's own load() races ahead of the
    // send, so it must still see an empty session, not the message being
    // sent underneath it).
    let messageLanded = false;
    const client = idleClient({
      createSession: vi.fn(async () => ({
        id: 'sess_new',
        title: 'untitled session',
        workspace_id: 'ws1',
        status: 'idle',
      })),
      patchSession: vi.fn(async () => ({})),
      sendMessage: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveSend = () => {
              messageLanded = true;
              resolve();
            };
          }),
      ),
      messages: vi.fn(async () => ({
        messages: messageLanded
          ? [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hello' }] }]
          : [],
      })),
    });
    const { container } = render(<SessionView client={client} sessions={[]} />);
    await screen.findByTestId('suggested-prompts');

    const textarea = screen.getByRole('textbox', { name: /message/i });
    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => expect(screen.queryByTestId('suggested-prompts')).toBeNull());
    expect(container.querySelector('.fresh-starting')?.textContent).toMatch(
      /starting the session on/i,
    );
    resolveSend?.();
    await waitFor(() => expect(screen.queryByTestId('transcript-empty')).toBeNull());
  });
});

describe('idle-to-floor spacer (fresh-session.json — composer position + transition)', () => {
  it('carries a growing spacer while idle that collapses the instant a turn starts', async () => {
    let resolveSend: (() => void) | undefined;
    const client = idleClient({
      createSession: vi.fn(async () => ({
        id: 'sess_new',
        title: 'untitled session',
        workspace_id: 'ws1',
        status: 'idle',
      })),
      patchSession: vi.fn(async () => ({})),
      sendMessage: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveSend = resolve;
          }),
      ),
      messages: vi.fn(async () => ({ messages: [] })),
    });
    const { container } = render(<SessionView client={client} sessions={[]} />);
    const spacer = () => container.querySelector('.sessionview__idle-spacer');
    await waitFor(() => expect(spacer()).not.toBeNull());
    expect(spacer()).not.toHaveAttribute('data-started');

    const textarea = screen.getByRole('textbox', { name: /message/i });
    fireEvent.change(textarea, { target: { value: 'hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    await waitFor(() => expect(spacer()).toHaveAttribute('data-started', 'true'));
    resolveSend?.();
    await waitFor(() => expect(screen.queryByTestId('transcript-empty')).toBeNull());
  });
});

describe('composer ask toggle before any session exists', () => {
  it('renders "ask" unconditionally, with no dropdown to open pre-session', async () => {
    render(<SessionView client={idleClient()} sessions={[]} />);
    const ask = screen.getByTestId('composer-approval');
    expect(ask).toHaveTextContent('ask');
    fireEvent.click(ask);
    expect(screen.queryByRole('menu')).toBeNull();
    await screen.findByTestId('suggested-prompts');
  });
});

describe('composer model chip before any session exists (fresh-session.json — audit correction)', () => {
  // PASS 2's independent audit caught the trigger rendering "model not set /
  // model not set" (doubled) once a session's model options loaded — root
  // cause was ProviderModelPicker treating the synthetic {id:'',
  // label:'model not set'} sentinel SessionView threads through pre-session
  // as a genuinely selected group/model. Fixed at the picker level
  // (composer-pill pass 3); this locks the fix through the actual idle
  // SessionView path fresh-session.json's own item measures, not just the
  // picker in isolation.
  it('shows a single plain "model not set", never doubled, on the true idle/no-session screen', async () => {
    render(<SessionView client={idleClient()} sessions={[]} />);
    await screen.findByTestId('suggested-prompts');
    const model = screen.getByTestId('composer-model');
    expect(model.textContent).toBe('model not set⌄');
    expect(model.textContent).not.toContain('model not set / model not set');
  });
});
