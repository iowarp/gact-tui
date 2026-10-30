import {
  agentEntrySchema,
  agentResolutionSchema,
  pluginCatalogSchema,
  sessionAgentSchema,
  emptyAgentDelta,
  type AgentDelta,
  type Session,
} from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ConversationAgentControls } from '../../src/components/clio/conversation-agent-controls';
import { ClioSessionContextBar } from '../../src/components/clio/session-context-bar';
import { ClioDraftActions } from '../../src/components/clio/draft-actions';
import {
  AgentCompositionView,
  DraftAgentCompositionView,
} from '../../src/components/clio/agent-composition-view';
import { ClioAppShell } from '../../src/components/clio/app-shell';
import { ClioWorkbench, type ClioWorkbenchOpenRequest } from '../../src/components/clio/workbench';
import { Sidebar, SidebarContent } from '../../src/components/ui/sidebar';
import { Button } from '../../src/components/ui/button';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { createRepository } from '../../src/lib/connection';
import { connectionScope } from '../../src/lib/connection-scope';
import { queryKeys } from '../../src/lib/query-keys';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { RepositoryOverride } from '../../src/providers/repository-override-context';
import { useLiveStore } from '../../src/store/live-store';
import '../../src/index.css';

const endpoint = 'https://archive.invalid';
const scope = connectionScope({ endpoint });
const sessionId = 'header-review';
const agents = [
  {
    ref: 'clio/standard',
    id: 'standard',
    name: 'CLIO',
    description: 'General scientific assistant.',
  },
  {
    ref: 'clio/earthscope',
    id: 'earthscope',
    name: 'EarthScope',
    description: 'Investigate geoscience evidence.',
  },
  { ref: 'user/analyst', id: 'analyst', name: 'My analyst', kind: 'user' },
].map((agent) => agentEntrySchema.parse(agent));
function resolveAgent(ref: string, delta: AgentDelta = emptyAgentDelta) {
  const agent = agents.find((item) => item.ref === ref) ?? agents[0]!;
  return agentResolutionSchema.parse({
    agent: {
      ...agent,
      role: 'A scientific investigation assistant',
      marketplace: 'clio',
      version: '1.0.1',
    },
    delta,
    plugins: [
      {
        id: 'core',
        marketplace: 'clio',
        removable: false,
        provenance: { source: 'core', via: 'core' },
      },
      {
        id: 'documents',
        marketplace: 'clio',
        kind: 'pack',
        members: ['pdf'],
        provenance: { source: 'agent', via: 'standard' },
      },
      { id: 'pdf', marketplace: 'clio', provenance: { source: 'pack', via: 'documents' } },
      ...delta.add.map((plugin) => ({
        id: plugin.split('/').at(-1),
        marketplace: 'clio',
        provenance: { source: 'user' },
      })),
    ].filter((plugin) => !delta.remove.includes(plugin.id!)),
    tools: [{ name: 'fs_read_file', plugin: 'core', description: 'Read a workspace file.' }],
    skills: [{ id: 'pdf', plugin: 'pdf', description: 'Work with PDF documents.' }],
    prompt: {
      sections: [
        {
          section: 'identity',
          fragments: [
            {
              id: 'identity',
              plugin: `agent:${agent.id}`,
              text: 'Investigate evidence and explain the result.',
            },
          ],
        },
      ],
    },
  });
}
let saved = sessionAgentSchema.parse({
  session_id: sessionId,
  resolution: resolveAgent('clio/earthscope'),
  delta: emptyAgentDelta,
});
const catalog = pluginCatalogSchema.parse({
  plugins: [
    {
      id: 'documents',
      ref: 'clio/documents',
      kind: 'pack',
      marketplace: 'clio',
      trusted: true,
      members: ['pdf'],
      description: 'Document formats and workflows.',
    },
    {
      id: 'manufacturing',
      ref: 'clio/manufacturing',
      marketplace: 'clio',
      trusted: true,
      description: 'Manufacturing and materials science.',
    },
  ],
});
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
});
client.setQueryData(queryKeys.key('capabilities', endpoint, scope), {
  capabilities: { x_clio_agent_plugins: true },
});
client.setQueryData(queryKeys.key('agents', endpoint, scope), agents);
client.setQueryData(queryKeys.key('plugins', endpoint, scope), catalog);
client.setQueryData(queryKeys.key('session-agent', endpoint, sessionId), saved);
useLiveStore.getState().mergeSnapshots({
  messages: {
    evidence: {
      id: 'evidence',
      session_id: sessionId,
      role: 'user',
      created_at: '2026-10-29T12:00:00Z',
      blocks: [{ id: 'text', type: 'text', text: 'Investigate the evidence.' }],
    },
  },
});
// Review-only records back the production query and mutation hooks. No server or model is contacted.
const repository = Object.assign(createRepository({ endpoint }), {
  capabilities: async () => ({ capabilities: { x_clio_agent_plugins: true } }),
  agents: async () => agents,
  plugins: async () => catalog,
  sessionAgent: async () => saved,
  resolveAgent: async (ref: string, delta: AgentDelta) => resolveAgent(ref, delta),
  updateSessionAgent: async (
    _id: string,
    input: { ref?: string; delta?: AgentDelta; apply?: string },
  ) => {
    saved = sessionAgentSchema.parse({
      ...saved,
      resolution: resolveAgent(input.ref ?? saved.resolution.agent.ref, input.delta ?? saved.delta),
      delta: input.delta ?? saved.delta,
    });
    document.getElementById('review-change')!.textContent = JSON.stringify(input);
    return saved;
  },
});
const session: Session = {
  id: sessionId,
  workspace_id: 'default',
  title: 'New conversation',
  state: 'completed',
  created_at: '',
  updated_at: '',
  mode: 'edit',
  edit_mode: 'diff',
  routing_mode: 'auto',
  approval_mode: 'ask',
  pinned: false,
  archived: false,
  metadata: { agent_ref: 'clio/earthscope' },
};

function Review() {
  const [draft, setDraft] = useState({ ref: 'clio/earthscope', delta: emptyAgentDelta });
  const [existing, setExisting] = useState(false);
  const [request, setRequest] = useState<{ key: string; request: ClioWorkbenchOpenRequest }>();
  const openAgent = () =>
    setRequest({ key: `agent:${Date.now()}`, request: { kind: 'resources', section: 'agent' } });
  return (
    <>
      <header className="flex flex-wrap items-center gap-2 border-b bg-background px-4 py-2 text-xs text-foreground">
        <span>Production headers and Agent panel with synthetic data. No model calls.</span>
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            setExisting(false);
            setRequest(undefined);
          }}
        >
          Draft conversation
        </Button>
        <Button
          size="xs"
          variant="outline"
          onClick={() => {
            setExisting(true);
            setRequest(undefined);
          }}
        >
          Existing conversation
        </Button>
        <output id="review-change" className="sr-only" />
      </header>
      <ClioAppShell
        key={existing ? 'existing' : 'draft'}
        navigation={
          <Sidebar>
            <SidebarContent>
              <p className="p-4 text-sm">default</p>
            </SidebarContent>
          </Sidebar>
        }
        contextBar={
          existing ? (
            <ClioSessionContextBar
              session={session}
              workspaceLabel="default"
              agentLabel="EarthScope"
              actionsPending={false}
              onCompact={async () => undefined}
              onFork={async () => undefined}
              onShare={async () => ''}
              onUndo={async () => undefined}
              onReturnToParent={() => undefined}
              onOpenAgent={openAgent}
            />
          ) : (
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <label className="flex min-w-0 items-center gap-2">
                <span className="max-sm:sr-only">New conversation in</span>
                <select
                  aria-label="Conversation workspace"
                  className="min-w-0 rounded-md border bg-background px-2 py-1"
                >
                  <option>default</option>
                </select>
              </label>
              <ConversationAgentControls
                agents={agents}
                agentRef={draft.ref}
                defaultRef="clio/standard"
                changes={draft.delta.add.length + draft.delta.remove.length}
                onSelect={(ref) => setDraft({ ref, delta: emptyAgentDelta })}
                onCustomize={openAgent}
              />
              <ClioDraftActions
                onOpen={(section) =>
                  setRequest({
                    key: `${section}:${Date.now()}`,
                    request: { kind: 'resources', section },
                  })
                }
              />
            </div>
          )
        }
        workbenchRevealKey={request?.key}
        workbench={
          <ClioWorkbench
            workspaceId="default"
            sessionId={existing ? sessionId : ''}
            files={[]}
            artifacts={[]}
            diffs={[]}
            sessionView={null}
            onOpenSubagent={() => undefined}
            onUndoDiff={async () => undefined}
            requestedOpen={request}
            agentView={
              existing ? (
                <AgentCompositionView sessionId={sessionId} />
              ) : (
                <DraftAgentCompositionView draft={draft} onChange={setDraft} />
              )
            }
          />
        }
        statusStrip={null}
      >
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-foreground">
          <h1 className="text-lg font-medium">What should we investigate?</h1>
          <p className="text-sm text-muted-foreground">
            Choose the agent, then use Customize for its plugins and prompt.
          </p>
        </div>
      </ClioAppShell>
    </>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ArchiveConnectionProvider>
      <RepositoryOverride.Provider value={repository}>
        <TooltipProvider>
          <AppearanceProvider>
            <MemoryRouter>
              <Review />
            </MemoryRouter>
          </AppearanceProvider>
        </TooltipProvider>
      </RepositoryOverride.Provider>
    </ArchiveConnectionProvider>
  </QueryClientProvider>,
);
