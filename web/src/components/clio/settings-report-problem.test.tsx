import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProblemReport } from '@clio/core/v3';

const repository = vi.hoisted(() => ({
  problemReport: vi.fn(),
  sessionPage: vi.fn(),
  sessionsById: vi.fn(),
}));
const clipboard = vi.hoisted(() => ({ copyText: vi.fn() }));
const exporter = vi.hoisted(() => ({ downloadText: vi.fn() }));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1:17800' } }),
}));
vi.mock('@/lib/clipboard', () => clipboard);
vi.mock('./surface-export', () => exporter);
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { ReportProblemSettings } from './settings-report-problem';

function report(overrides: Partial<ProblemReport> = {}): ProblemReport {
  return {
    schema: 'clio.problem_report.v1',
    generated_at: '2026-11-15T10:00:00+00:00',
    filename: 'clio-problem-report-20261115-100000.txt',
    text: 'CLIO problem report\n== Logs ==\nERROR boom\n',
    about: {
      version: '0.9.7+abc123',
      os: 'macOS 15.1',
      app_kind: 'web',
      provider: 'claude_code',
      model: 'claude-sonnet-5-5',
    },
    health: {
      overall_status: 'degraded',
      ready_count: 1,
      rows: [
        { name: 'api', status: 'ready', summary: 'Serving.' },
        { name: 'lm_provider', status: 'degraded', summary: 'The model provider is slow.' },
      ],
      degradation: null,
    },
    logs: {
      lines_requested: 500,
      max_lines: 5000,
      sources: [
        {
          role: 'server',
          path: '~/.local/state/clio-agent/clio-server.mac.log',
          status: 'ok',
          earlier_lines: true,
          lines: Array.from({ length: 500 }, (_, index) => `INFO line ${index + 1}`).concat(
            'DEBUG Authorization: [redacted]',
          ),
        },
      ],
      searched: [],
      degradation: null,
    },
    conversation: null,
    manifest: [{ section: 'about', title: 'About', contents: 'Version.' }],
    redaction: [
      { rule: 'known_value', description: 'Saved secrets', count: 2 },
      { rule: 'credential_header', description: 'Headers', count: 1 },
      { rule: 'home_path', description: 'Home', count: 4 },
    ],
    ...overrides,
  };
}

const conversations = [
  { id: 'sess_failed', title: 'Rainfall in Kansas' },
  { id: 'sess_other', title: '' },
];

function renderPage(initialConversationId?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ReportProblemSettings initialConversationId={initialConversationId} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  repository.problemReport.mockResolvedValue(report());
  repository.sessionPage.mockResolvedValue({ sessions: conversations });
  repository.sessionsById.mockResolvedValue([]);
  clipboard.copyText.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('Report a problem', () => {
  it('says what the report holds and that secrets are removed', async () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Report a problem' })).toBeVisible();
    expect(screen.getByText(/Passwords, keys and tokens are removed/u)).toBeVisible();
    expect(await screen.findByText('0.9.7+abc123')).toBeVisible();
    expect(screen.getByText('macOS 15.1')).toBeVisible();
    expect(screen.getByText('claude_code/claude-sonnet-5-5')).toBeVisible();
    expect(
      screen.getByText('Removed before showing: 3 secrets. Your home folder is shown as ~.'),
    ).toBeVisible();
    expect(repository.problemReport).toHaveBeenCalledWith(
      { lines: 500, sessionId: undefined, includeMessages: false, client: 'web' },
      expect.anything(),
    );
  });

  it('shows health in words, not only colour, with the checks that need attention', async () => {
    renderPage();
    const attention = await screen.findByRole('list', {
      name: 'Health checks that need attention',
    });
    expect(within(attention).getByText('Language model provider')).toBeVisible();
    expect(within(attention).getByText('The model provider is slow.')).toBeVisible();
    expect(within(attention).queryByText('Workspace service')).not.toBeInTheDocument();
    expect(screen.getAllByText('Needs attention').length).toBeGreaterThanOrEqual(2);
  });

  it('previews the log tail in a scrollable monospace box and shows more on request', async () => {
    renderPage();
    const box = await screen.findByLabelText('Service log, last lines');
    expect(box.tagName).toBe('PRE');
    expect(box).toHaveAttribute('tabindex', '0');
    expect(box.textContent).toContain('INFO line 500');
    expect(box.textContent).toContain('DEBUG Authorization: [redacted]');
    expect(screen.getByText('Showing the last 500 lines of each log.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await waitFor(() =>
      expect(repository.problemReport).toHaveBeenLastCalledWith(
        expect.objectContaining({ lines: 1000 }),
        expect.anything(),
      ),
    );
  });

  it('copies and downloads the same text the service rendered', async () => {
    renderPage();
    await screen.findByText('0.9.7+abc123');
    fireEvent.click(screen.getByRole('button', { name: 'Copy report' }));
    await waitFor(() =>
      expect(clipboard.copyText).toHaveBeenCalledWith(
        'CLIO problem report\n== Logs ==\nERROR boom\n',
      ),
    );
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Download report' }));
    expect(exporter.downloadText).toHaveBeenCalledWith(
      'CLIO problem report\n== Logs ==\nERROR boom\n',
      'text/plain;charset=utf-8',
      'clio-problem-report-20261115-100000.txt',
    );
  });

  it('reports on the conversation it was opened from, without its messages by default', async () => {
    repository.problemReport.mockResolvedValue(
      report({
        conversation: {
          id: 'sess_failed',
          title: null,
          status: 'idle',
          busy: false,
          message_count: 2,
          messages_included: false,
          recent_replies: [
            {
              message_id: 'a1',
              created_at: '2026-11-15T10:00:00Z',
              outcome: 'failed',
              error_code: 'provider_model_not_found',
              error_message: "model 'no-such-model' was rejected",
            },
          ],
          degradation: null,
        },
      }),
    );
    renderPage('sess_failed');
    const replies = await screen.findByRole('list', { name: 'Recent replies' });
    expect(within(replies).getByText('Failed')).toBeVisible();
    expect(within(replies).getByText("model 'no-such-model' was rejected")).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Conversation' })).toHaveTextContent(
      'Rainfall in Kansas',
    );
    expect(repository.problemReport).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'sess_failed', includeMessages: false }),
      expect.anything(),
    );
    const include = screen.getByRole('checkbox', { name: 'Include this conversation’s messages' });
    expect(include).not.toBeChecked();
    fireEvent.click(include);
    await waitFor(() =>
      expect(repository.problemReport).toHaveBeenLastCalledWith(
        expect.objectContaining({ sessionId: 'sess_failed', includeMessages: true }),
        expect.anything(),
      ),
    );
  });

  it('keeps the messages box off and disabled without a conversation', async () => {
    renderPage();
    await screen.findByText('0.9.7+abc123');
    expect(screen.getByRole('combobox', { name: 'Conversation' })).toHaveTextContent(
      'No conversation',
    );
    expect(
      screen.getByRole('checkbox', { name: 'Include this conversation’s messages' }),
    ).toBeDisabled();
  });

  it('says plainly when there is no log file', async () => {
    repository.problemReport.mockResolvedValue(
      report({
        logs: {
          lines_requested: 500,
          max_lines: 5000,
          sources: [],
          searched: [{ role: 'server', path: '~/x.log', reason: 'log_file_absent' }],
          degradation: { reason: 'no_log_files', message: 'No CLIO log file was found.' },
        },
      }),
    );
    renderPage();
    expect(
      await screen.findByText(
        'No log file was found on this computer. A service started from a terminal writes its log there instead.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  it('offers Retry when the service cannot prepare the report', async () => {
    repository.problemReport.mockRejectedValueOnce(new Error('404'));
    renderPage();
    expect(
      await screen.findByText(
        'The report could not be prepared. This service may be too old to offer it.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Copy report' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Retry/u }));
    expect(await screen.findByText('0.9.7+abc123')).toBeVisible();
  });
});
