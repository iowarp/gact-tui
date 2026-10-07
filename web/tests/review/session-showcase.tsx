import type { Artifact, Message } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { useRef } from 'react';
import '../../src/index.css';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { RepositoryOverrideProvider } from '../../src/providers/repository-override';
import { createRepository } from '../../src/lib/connection';
import { ClioMotionProvider } from '../../src/components/clio/motion';
import { ClioConversation } from '../../src/components/clio/conversation';
import { ClioComposer } from '../../src/components/clio/composer';
import { ClioObservabilityDock } from '../../src/components/clio/observability-dock';
import { ClioAppShell } from '../../src/components/clio/app-shell';
import { Sidebar, SidebarContent } from '../../src/components/ui/sidebar';
import { connectionScope } from '../../src/lib/connection-scope';

const sessionId = 'showcase_fixture';
const workspaceId = 'workspace_fixture';
const endpoint = 'https://archive.invalid';
const client = new QueryClient({
  defaultOptions: { queries: { enabled: false, staleTime: Infinity } },
});
client.setQueryData(['session-work', endpoint, sessionId, 0], {
  todos: [
    { content: 'Review the sensor report', status: 'in_progress' },
    { content: 'Confirm the assumptions', status: 'pending' },
  ],
  goal: null,
  loop: null,
});
client.setQueryData(['session-work-schedules', endpoint, sessionId], {
  schedules: [{ id: 'schedule', question: 'Check new sensor readings', enabled: true }],
});
client.setQueryData(
  ['connected-storage', connectionScope({ endpoint }), workspaceId, 'sources'],
  [{ id: 'source', label: 'Sensor repository', connected: true }],
);
// This test-only repository reads the labelled fixture records without a live connection.
const baseRepository = createRepository({ endpoint });
const repository = Object.assign(baseRepository, {
  sessionWork: async () =>
    client.getQueryData<Awaited<ReturnType<typeof baseRepository.sessionWork>>>([
      'session-work',
      endpoint,
      sessionId,
      0,
    ])!,
  scheduledTurns: async () =>
    client.getQueryData<Awaited<ReturnType<typeof baseRepository.scheduledTurns>>>([
      'session-work-schedules',
      endpoint,
      sessionId,
    ])!,
  connectedSources: async () =>
    client.getQueryData<Awaited<ReturnType<typeof baseRepository.connectedSources>>>([
      'connected-storage',
      connectionScope({ endpoint }),
      workspaceId,
      'sources',
    ])!,
});
const artifacts: Artifact[] = [
  {
    id: 'docx',
    session_id: sessionId,
    name: 'Sensor_Summary_Team_Report.docx',
    media_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    uri: 'artifact://docx',
    size: 58700,
  },
  {
    id: 'pdf',
    session_id: sessionId,
    name: 'Sensor_Summary_Team_Report.pdf',
    media_type: 'application/pdf',
    uri: 'artifact://pdf',
    size: 134700,
  },
];
const messages: Message[] = [
  {
    id: 'prompt',
    session_id: sessionId,
    role: 'user',
    created_at: '2026-10-07T05:00:00Z',
    blocks: [
      {
        id: 'prompt_text',
        type: 'text',
        text: 'Create a short report from the sensor notes, with findings and next steps.',
      },
    ],
  },
  {
    id: 'answer',
    session_id: sessionId,
    role: 'assistant',
    created_at: '2026-10-07T05:00:00Z',
    stop_reason: 'end_turn',
    blocks: [
      {
        id: 'answer_text',
        type: 'text',
        text: 'The report includes the station comparison, limitations and recommended next steps. The editable report and PDF preview are listed below.',
      },
      ...artifacts.map((artifact) => ({
        id: artifact.id,
        type: 'artifact' as const,
        artifact_id: artifact.id,
      })),
    ],
  },
];
const evidence = {
  artifacts,
  messages,
  sessionId,
  workspaceId,
  context: {
    session_id: sessionId,
    used_tokens: 42000,
    limit_tokens: 272000,
    provenance: { source: 'server' as const, observed_at: '2026-10-07T05:00:00Z', stale: false },
  },
  contextFiles: [
    { path: 'sources/sensor-notes.md', display_path: 'sensor-notes.md', mode: 'pin' as const },
  ],
  contextFrames: [],
  diffs: [],
  processes: [],
  runs: [],
  tools: [],
  tasks: [
    { id: 'task', session_id: sessionId, title: 'Review findings', state: 'running' as const },
  ],
  subagents: [
    {
      id: 'child',
      session_id: sessionId,
      title: 'Evidence reviewer',
      task: 'Check the station comparisons',
      state: 'running' as const,
    },
  ],
};

export function SessionShowcaseReview() {
  const surfaceRef = useRef<HTMLElement>(null);
  return (
    <ArchiveConnectionProvider>
      <QueryClientProvider client={client}>
        <RepositoryOverrideProvider repository={repository}>
          <AppearanceProvider>
            <ClioMotionProvider>
              <div className="h-dvh">
                <ClioAppShell
                  navigation={
                    <Sidebar collapsible="icon" contained>
                      <SidebarContent>
                        <div className="p-5 text-sm">CLIO · Layout review</div>
                      </SidebarContent>
                    </Sidebar>
                  }
                  contextBar={
                    <h1 className="truncate text-sm font-semibold">
                      Showcase layout · browser fixture
                    </h1>
                  }
                  toolbarActions={
                    <ClioObservabilityDock {...evidence} toolbar surfaceRef={surfaceRef} />
                  }
                  workbench={<div className="p-5">Fixture canvas</div>}
                  statusStrip={
                    <p className="py-2 text-xs text-muted-foreground">
                      Simulated records. No provider calls.
                    </p>
                  }
                >
                  <section
                    ref={surfaceRef}
                    data-slot="session-transcript"
                    className="relative flex h-full min-h-0 flex-1 flex-col"
                  >
                    <div className="min-h-0 flex-1">
                      <ClioConversation
                        messages={messages}
                        artifacts={Object.fromEntries(artifacts.map((a) => [a.id, a]))}
                        tools={{}}
                        tasks={{}}
                        subagents={{}}
                        surfaces={{}}
                      />
                    </div>
                    <ClioComposer
                      state="idle"
                      attachments={false}
                      provider="codex"
                      model="gpt-6-luna"
                      variant="docked"
                      onSubmit={async () => {
                        throw new Error('This fixture cannot send a message.');
                      }}
                    />
                  </section>
                </ClioAppShell>
              </div>
            </ClioMotionProvider>
          </AppearanceProvider>
        </RepositoryOverrideProvider>
      </QueryClientProvider>
    </ArchiveConnectionProvider>
  );
}

createRoot(document.getElementById('root')!).render(<SessionShowcaseReview />);
