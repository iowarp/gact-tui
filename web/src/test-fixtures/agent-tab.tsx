import type { AgentResolution, Session, SessionAgent } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useLiveStore } from '@/store/live-store';

/**
 * Shared fixtures for the Agent tab tests: a resolved standard agent with a
 * pack, a requirement and one removed member, its setup, and a conversation.
 */

export const agentRepository = {
  sessionAgent: vi.fn(),
  capabilities: vi.fn(
    async (): Promise<{ capabilities: Record<string, unknown>; gact_versions: string[] }> => ({
      capabilities: { x_clio_agent_plugins: true },
      gact_versions: [],
    }),
  ),
  updateSessionAgent: vi.fn(),
  plugins: vi.fn(),
  agents: vi.fn(),
  previewPluginRemoval: vi.fn(),
  resolveAgent: vi.fn(),
  saveUserAgent: vi.fn(),
  compactSession: vi.fn(),
  sessionDefaults: vi.fn(async () => ({
    provider_id: 'openrouter',
    model_id: 'mercury-3',
    effort: 'medium',
    approval_mode: 'ask',
  })),
  updateSession: vi.fn(),
  spotterAvailability: vi.fn(async () => ({ available: false, message: 'Not configured' })),
  languageModelConfiguration: vi.fn(async () => ({ presets: [] })),
};

/** Messages in the conversation: with any, a plugin change asks first. */
export const agentTranscript = { messages: 2 };

export const providerGroupsMock = {
  useProviderGroups: () => ({
    options: [
      {
        providerId: 'openrouter',
        providerName: 'OpenRouter',
        id: 'mercury-3',
        label: 'mercury-3',
        available: true,
        reasoning: { levels: ['low', 'medium', 'high'] },
      },
    ],
    catalog: { isPending: false, isError: false, refetch: vi.fn() },
    configuration: { data: undefined },
    groups: [],
    presets: [],
  }),
};

export function plugin(
  id: string,
  provenance: AgentResolution['plugins'][number]['provenance'],
  extra: Partial<AgentResolution['plugins'][number]> = {},
): AgentResolution['plugins'][number] {
  return {
    id,
    version: '1.0.0',
    kind: 'plugin',
    marketplace: 'clio',
    description: `${id} plugin`,
    provenance,
    requires: [],
    members: [],
    removable: true,
    follows: '',
    connector: null,
    ...extra,
  };
}

export const emptyDelta = { add: [], remove: [] };

export const resolution: AgentResolution = {
  agent: {
    ref: 'clio/standard',
    id: 'standard',
    name: 'Standard',
    role: 'a scientific assistant',
    description: '',
    version: '1.0.0',
    marketplace: 'clio',
    parent: '',
    kind: 'agent',
  },
  plugins: [
    plugin('core', { source: 'core', via: 'core', label: 'core' }, { removable: false }),
    plugin('shell', { source: 'agent', via: 'standard', label: 'standard' }),
    plugin(
      'documents',
      { source: 'agent', via: 'standard', label: 'standard' },
      { kind: 'pack', members: ['pdf', 'xlsx'] },
    ),
    plugin(
      'pdf',
      { source: 'pack', via: 'documents', label: 'pack documents' },
      { requires: ['document-runtime'] },
    ),
    plugin('document-runtime', { source: 'required', via: 'pdf', label: 'required by pdf' }),
  ],
  removed: [],
  tools: [
    { name: 'shell_run', plugin: 'shell', description: '' },
    { name: 'prepare_document', plugin: 'document-runtime', description: '' },
  ],
  skills: [{ id: 'gh-releases', plugin: 'shell', description: 'Cut a release with gh.' }],
  subagents: [],
  flows: [],
  hooks: [],
  commands: [],
  catalogs: [],
  mcp_servers: { 'pdf-reader': { plugin: 'pdf', spec: { type: 'stdio' } } },
  prompt: {
    sections: [
      {
        section: 'identity',
        fragments: [
          {
            id: 'standard.identity',
            plugin: 'agent:standard',
            section: 'identity',
            text: 'You are the standard agent.',
          },
        ],
      },
      {
        section: 'capabilities',
        fragments: [
          {
            id: 'shell.prefer-gh',
            plugin: 'shell',
            section: 'capabilities',
            text: 'Prefer gh.',
            tokens: 12,
          },
        ],
      },
    ],
    digest: 'd',
    warnings: [],
  },
  delta: { add: [], remove: ['xlsx'] },
  diagnostics: [],
  digest: 'r',
};

export const sessionAgent: SessionAgent = {
  session_id: 'sess_1',
  delta: { add: [], remove: ['xlsx'] },
  subagent: false,
  resolution,
  prompt_basis: {
    digest: 'r',
    pending: false,
    added: [],
    removed: [],
    skills_now: [],
    tools_unlisted: [],
    tools_still_listed: [],
  },
};

export function renderAgentView(view: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <TooltipProvider>{view}</TooltipProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

export type User = ReturnType<typeof userEvent.setup>;

/** Opens one "What it can use" row; `all` lists every plugin, not only those adding it. */
export async function openUse(user: User, label = 'Tools', all = true) {
  await user.click(await screen.findByRole('button', { name: new RegExp(`^${label}:`, 'u') }));
  if (all && label !== 'Instructions')
    await user.click(await screen.findByRole('button', { name: /^Show all \d+ plugins$/u }));
}

/** Opens Tools, then its + menu, and picks hdf5; returns the warning dialog. */
export async function addHdf5(user: User) {
  await openUse(user, 'Tools', false);
  await user.click(await screen.findByRole('button', { name: 'Add plugin' }));
  await user.click(await screen.findByRole('option', { name: /hdf5/u }));
  return screen.findByRole('alertdialog');
}

// The setup without this conversation's changes: xlsx is in it.
export const setupResolution: AgentResolution = {
  ...resolution,
  plugins: [
    ...resolution.plugins,
    plugin('xlsx', { source: 'pack', via: 'documents', label: 'pack documents' }),
  ],
  tools: [...resolution.tools, { name: 'read_sheet', plugin: 'xlsx', description: '' }],
  delta: emptyDelta,
};

export const session: Session = {
  id: 'sess_1',
  workspace_id: 'ws_ndp',
  title: 'Station review',
  state: 'completed',
  created_at: '2026-08-23T00:00:00Z',
  updated_at: '2026-08-23T00:01:00Z',
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
  provider_id: 'openrouter',
  model_id: 'mercury-3',
  pinned: false,
  archived: false,
};

/** Resets the repository mock and the live store to the fixture conversation. */
export function seedAgentRepository() {
  agentTranscript.messages = 2;
  useLiveStore.getState().replaceSnapshots({ sessions: { sess_1: session } });
  agentRepository.resolveAgent.mockResolvedValue(setupResolution);
  agentRepository.updateSession.mockImplementation(
    async (_sid: string, patch: Partial<Session>) => ({
      ...session,
      ...patch,
    }),
  );
  agentRepository.sessionAgent.mockResolvedValue(sessionAgent);
  agentRepository.agents.mockResolvedValue([
    { ref: 'clio/standard', id: 'standard', name: 'Standard', plugins: [], kind: 'agent' },
  ]);
  agentRepository.plugins.mockResolvedValue({
    plugins: [
      {
        id: 'hdf5',
        ref: 'clio/hdf5',
        version: '1.0.0',
        description: 'Read HDF5 files',
        kind: 'plugin',
        format: 'agent-plugins',
        marketplace: 'clio',
        requires: [],
        members: [],
        tools: [],
        skills: [],
        mcp_servers: [],
        subagents: [],
        flows: [],
        hooks: [],
        commands: [],
        catalogs: [],
        fragments: [],
        trusted: true,
        pending_trust: false,
        diagnostics: [],
      },
    ],
    default_marketplace_error: null,
  });
  agentRepository.updateSessionAgent.mockImplementation(
    async (_sid: string, input: { delta?: SessionAgent['delta'] }) => ({
      ...sessionAgent,
      delta: input.delta ?? sessionAgent.delta,
    }),
  );
}
