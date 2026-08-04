/**
 * The connected app must render the REBUILT SHELL over live data.
 *
 * Until now the shell existed only behind `?shell` with fixtures, so
 * connecting to a real backend landed on a placeholder list. These cases pin
 * the real path: connect -> shell -> select a session -> its messages render
 * through the one transcript pipeline.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Client, Message, Session } from '@clio/core';
import { describe, expect, it, vi } from 'vitest';
import { SessionView } from '../../src/session/SessionView';

const SESSIONS = [
  { id: 'sess_a', title: 'LA ground motion', status: 'running', workspace_id: 'ws_default' },
  { id: 'sess_b', title: 'membudget 1', status: 'idle', workspace_id: 'ws_default' },
  { id: 'sess_c', title: 'skill gate', status: 'idle', workspace_id: 'ws_other' },
] as unknown as Session[];

const MESSAGES: Message[] = [
  { id: 'm1', role: 'user', parts: [{ type: 'text', text: 'plot the station' }] },
  { id: 'm2', role: 'assistant', parts: [{ type: 'text', text: 'staging the CSV' }] },
] as unknown as Message[];

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    baseUrl: 'http://live.test',
    messages: vi.fn(async () => ({ messages: MESSAGES })),
    ...overrides,
  } as unknown as Client;
}

describe('SessionView', () => {
  it('renders the rebuilt shell, not a placeholder list', () => {
    render(<SessionView client={makeClient()} sessions={SESSIONS} />);
    expect(screen.getByRole('navigation', { name: /workspaces/i })).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('groups sessions by workspace', () => {
    render(<SessionView client={makeClient()} sessions={SESSIONS} />);
    const rail = screen.getByRole('navigation', { name: /workspaces/i });
    expect(within(rail).getByText('ws_default')).toBeInTheDocument();
    expect(within(rail).getByText('ws_other')).toBeInTheDocument();
  });

  it('loads a session and renders its messages through the transcript', async () => {
    const client = makeClient();
    render(<SessionView client={client} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
    await waitFor(() => expect(screen.getByText('staging the CSV')).toBeInTheDocument());
    expect(client.messages).toHaveBeenCalledWith('sess_a');
  });

  it('states when a session has no messages rather than showing an empty pane', async () => {
    const client = makeClient({ messages: vi.fn(async () => ({ messages: [] })) });
    render(<SessionView client={client} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'membudget 1' }));
    await waitFor(() => expect(screen.getByTestId('transcript-empty')).toBeInTheDocument());
  });

  it('surfaces a load failure with its reason instead of a blank transcript', async () => {
    // A failed fetch must not look like an empty session.
    const client = makeClient({
      messages: vi.fn(async () => {
        throw new Error('HTTP 500: session store unreadable');
      }),
    });
    render(<SessionView client={client} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'skill gate' }));
    await waitFor(() => {
      const err = screen.getByTestId('transcript-error');
      expect(err).toHaveTextContent(/500|unreadable/);
    });
  });

  it('says so when the backend serves no sessions at all', () => {
    render(<SessionView client={makeClient()} sessions={[]} />);
    expect(screen.getByTestId('sessions-empty')).toBeInTheDocument();
  });
});

describe('workspace group labels', () => {
  const WS = [
    // String.raw so the backslashes are literal path separators, not escapes.
    { id: 'ws_default', name: 'clio-agent', root_path: String.raw`D:\proj\clio-agent` },
    { id: 'ws_other', name: 'rollups', root_path: String.raw`C:\Users\jaime\rollups` },
  ];

  function clientWithWorkspaces() {
    return {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => ({ messages: MESSAGES })),
      workspaces: vi.fn(async () => ({ workspaces: WS })),
    } as unknown as Client;
  }

  it('labels groups with the workspace PATH, not the opaque id', async () => {
    // The prototype's rail shows paths (/scratch/j4471, ~/rollups). A raw
    // ws_ id tells the user nothing about which tree they are looking at.
    render(<SessionView client={clientWithWorkspaces()} sessions={SESSIONS} />);
    const rail = screen.getByRole('navigation', { name: /workspaces/i });
    await waitFor(() => expect(within(rail).getByText(/clio-agent$/)).toBeInTheDocument());
    expect(within(rail).queryByText('ws_default')).toBeNull();
  });

  it('shortens the home directory the way the prototype does', async () => {
    render(<SessionView client={clientWithWorkspaces()} sessions={SESSIONS} />);
    const rail = screen.getByRole('navigation', { name: /workspaces/i });
    await waitFor(() => expect(within(rail).getByText('~/rollups')).toBeInTheDocument());
  });

  it('falls back to the id when the backend cannot name the workspace', async () => {
    // Honest fallback: an unlabelled group must still be identifiable.
    const client = {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => ({ messages: MESSAGES })),
      workspaces: vi.fn(async () => ({ workspaces: [] })),
    } as unknown as Client;
    render(<SessionView client={client} sessions={SESSIONS} />);
    const rail = screen.getByRole('navigation', { name: /workspaces/i });
    await waitFor(() => expect(within(rail).getByText('ws_default')).toBeInTheDocument());
  });
});

describe('missing session', () => {
  it('offers to delete a session the backend no longer has', async () => {
    // A 404 means the row points at something gone. Better to say so and let
    // the user remove it than to look broken.
    const client = {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => {
        throw Object.assign(new Error('session not found: sess_a'), { status: 404 });
      }),
      deleteSession: vi.fn(async () => undefined),
    } as unknown as Client;

    render(<SessionView client={client} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
    await waitFor(() => expect(screen.getByTestId('session-missing')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  it('removes it on confirm and drops the row', async () => {
    const onForget = vi.fn();
    const client = {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => {
        throw Object.assign(new Error('session not found'), { status: 404 });
      }),
      deleteSession: vi.fn(async () => undefined),
    } as unknown as Client;

    render(<SessionView client={client} sessions={SESSIONS} onForgetSession={onForget} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
    await waitFor(() => screen.getByTestId('session-missing'));
    fireEvent.click(screen.getByRole('button', { name: /remove/i }));
    await waitFor(() => expect(onForget).toHaveBeenCalledWith('sess_a'));
  });

  it('a non-404 failure is still reported as a load error, not a missing session', async () => {
    const client = {
      baseUrl: 'http://live.test',
      messages: vi.fn(async () => {
        throw Object.assign(new Error('boom'), { status: 500 });
      }),
    } as unknown as Client;
    render(<SessionView client={client} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
    await waitFor(() => expect(screen.getByTestId('transcript-error')).toBeInTheDocument());
    expect(screen.queryByTestId('session-missing')).toBeNull();
  });
});

describe('empty session by default (C4)', () => {
  // The owner's complaint: "by default we should be getting an empty session
  // ... not a select a session debug message". A fresh boot must look like a
  // usable session you can type into, not an instruction to click something.

  it('shows no select-a-session instruction', () => {
    render(<SessionView client={makeClient()} sessions={SESSIONS} />);
    expect(screen.queryByText(/select a session/i)).toBeNull();
  });

  it('offers a working composer before any session is selected', () => {
    render(<SessionView client={makeClient()} sessions={SESSIONS} />);
    const input = screen.getByRole('textbox');
    expect(input).toBeInTheDocument();
    expect(input).not.toBeDisabled();
  });

  it('creates the session on first send, then posts the message into it', async () => {
    const createSession = vi.fn(async () => ({
      id: 'sess_new',
      title: 'untitled',
      status: 'idle',
      workspace_id: 'ws_default',
    }));
    const sendMessage = vi.fn(async () => ({}));
    const client = makeClient({
      createSession,
      sendMessage,
      messages: vi.fn(async () => ({ messages: [] })),
    });

    render(<SessionView client={client} sessions={SESSIONS} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    await waitFor(() => expect(createSession).toHaveBeenCalled());
    // The message must land in the session that was just created, not nowhere.
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith('sess_new', { text: 'hello' }));
  });

  it('reports a failed create instead of silently dropping the message', async () => {
    const client = makeClient({
      createSession: vi.fn(async () => {
        throw new Error('backend refused');
      }),
      sendMessage: vi.fn(async () => ({})),
    });

    render(<SessionView client={client} sessions={SESSIONS} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'hello' } });
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });

    await waitFor(() => expect(screen.getByTestId('send-error')).toHaveTextContent(/backend refused/i));
    expect(client.sendMessage).not.toHaveBeenCalled();
  });
});

describe('composer control row (C5 / C9 / S1)', () => {
  const SESSION_DETAIL = {
    id: 'sess_a',
    title: 'LA ground motion',
    workspace_id: 'ws_default',
    model: { provider_id: 'anthropic', model_id: 'claude-sonnet-4-6', variant: '' },
    approval_mode: 'ask',
  };

  function wired(overrides: Record<string, unknown> = {}) {
    return makeClient({
      getSession: vi.fn(async () => SESSION_DETAIL),
      providers: vi.fn(async () => ({
        providers: [
          { id: 'anthropic', name: 'Anthropic', is_authenticated: true },
          { id: 'lm_studio', name: 'LM Studio (localhost)', is_authenticated: true },
        ],
      })),
      providerModels: vi.fn(async () => ({
        models: [{ id: 'claude-sonnet-4-6', name: 'claude-sonnet-4-6' }],
      })),
      patchSession: vi.fn(async () => SESSION_DETAIL),
      ...overrides,
    });
  }

  it('labels the model as provider / model, not "default"', async () => {
    // The prototype renders "Anthropic / claude-sonnet-4-6". "default" says
    // nothing about what will actually answer the turn.
    render(<SessionView client={wired()} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
    await waitFor(() =>
      expect(screen.getByTestId('composer-model')).toHaveTextContent('Anthropic / claude-sonnet-4-6'),
    );
  });

  it('offers the attach control, marked unbacked rather than hidden', () => {
    // clio-agent serves no upload endpoint (/v1/upload, /v1/files and
    // /v1/attachments all 404). The prototype has the control, so it ships
    // visible and flagged instead of silently missing.
    render(<SessionView client={wired()} sessions={SESSIONS} />);
    const attach = screen.getByRole('button', { name: /attach/i });
    expect(attach).toBeInTheDocument();
    expect(attach).toHaveAttribute('data-unbacked', 'true');
  });

  it('offers the approval modes the BACKEND accepts', async () => {
    // The prototype's ask/auto-edits/auto/bypass was placeholder semantics.
    // The real axis is the wire Literal: ask, auto-edits, bypass, ai-review.
    render(<SessionView client={wired()} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
    await waitFor(() => expect(screen.getByTestId('composer-approval')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('combobox', { name: /approval/i }));
    const options = screen.getAllByRole('option').map((o) => o.textContent?.trim());
    expect(options).toEqual(['ask', 'auto-edits', 'bypass', 'ai-review']);
  });

  it('persists an approval-mode change through PATCH', async () => {
    const client = wired();
    render(<SessionView client={client} sessions={SESSIONS} />);
    fireEvent.click(screen.getByRole('button', { name: 'LA ground motion' }));
    await waitFor(() => expect(screen.getByTestId('composer-approval')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('combobox', { name: /approval/i }));
    fireEvent.click(screen.getByRole('option', { name: 'bypass' }));

    await waitFor(() =>
      expect(client.patchSession).toHaveBeenCalledWith('sess_a', { approval_mode: 'bypass' }),
    );
  });
});
