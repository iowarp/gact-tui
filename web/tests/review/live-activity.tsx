import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ForcedTheme } from '../../src/theme/forced-theme';
import type { Message, ToolInvocation } from '@clio/core/v3';
import '../../src/index.css';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { ConversationDisplayProvider } from '../../src/providers/conversation-display-provider';
import { ClioConversation } from '../../src/components/clio/conversation';
import { TranscriptDisclosures } from '../../src/components/clio/transcript-disclosures';
import { ClioMotionProvider } from '../../src/components/clio/motion';
import { Button } from '../../src/components/ui/button';

function Review() {
  const [phase, setPhase] = useState(0);
  const [visible, setVisible] = useState(true);
  const read: ToolInvocation = {
    id: 'read',
    session_id: 'live-fixture',
    name: 'fs_read_file',
    state: 'succeeded',
    input: { path: 'measurements.csv' },
    output: 'time,value\n08:00,4\n08:15,0',
    presentation: { action: 'Read', summary: '2 observations', blocks: [] },
  };
  const check: ToolInvocation = {
    id: 'check',
    session_id: 'live-fixture',
    name: 'shell_bash',
    state: 'succeeded',
    input: { command: 'python inspect_units.py' },
    output: 'Units are consistent.',
    presentation: { action: 'Run', summary: 'exit 0', blocks: [] },
  };
  const write: ToolInvocation = {
    id: 'write',
    session_id: 'live-fixture',
    name: 'fs_write_file',
    state: phase === 1 ? 'running' : 'succeeded',
    input: { path: 'findings.md', content: 'The first recorded zero is at 08:15.' },
    output: phase === 1 ? undefined : 'Report saved.',
    presentation: { action: 'Write', summary: 'findings.md', blocks: [] },
  };
  const message: Message = {
    id: 'live-message',
    session_id: 'live-fixture',
    run_id: 'live-run',
    role: 'assistant',
    created_at: '2026-10-13T12:00:00Z',
    completed_at: phase === 2 ? '2026-10-13T12:01:00Z' : undefined,
    blocks: [
      { id: 'read-part', type: 'tool', tool_id: 'read' },
      { id: 'check-part', type: 'tool', tool_id: 'check' },
      ...(phase >= 1
        ? [
            {
              id: 'progress',
              type: 'text' as const,
              channel: 'answer' as const,
              text: 'The measurements use consistent units. I’ll save the finding and its limitations.',
            },
            { id: 'write-part', type: 'tool' as const, tool_id: 'write' },
          ]
        : []),
      ...(phase === 2
        ? [
            {
              id: 'final',
              type: 'text' as const,
              channel: 'answer' as const,
              text: 'The report is saved. Review the source observations before interpreting the change.',
            },
          ]
        : []),
    ],
  };
  return (
    <TranscriptDisclosures sessionId="live-fixture">
      <div className="flex h-dvh min-w-0 flex-col bg-background text-foreground">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-5 py-3 text-xs text-muted-foreground">
          <p>Simulated streaming fixture using the production renderer; no inference.</p>
          <Button size="sm" variant="outline" onClick={() => setPhase(1)}>
            Show next activity group
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPhase(2)}>
            Finish fixture
          </Button>
          <Button size="sm" variant="outline" onClick={() => setVisible(!visible)}>
            {visible ? 'Hide transcript' : 'Show transcript'}
          </Button>
        </header>
        <main className="min-h-0 min-w-0 flex-1">
          {visible ? (
            <ClioConversation
              sessionId="live-fixture"
              messages={[message]}
              tools={{ read, check, write }}
              tasks={{}}
              subagents={{}}
              artifacts={{}}
              surfaces={{}}
              preparation={{
                sessionState: phase === 2 ? 'idle' : 'running',
                activeTurnId: 'live-run',
              }}
            />
          ) : null}
        </main>
      </div>
    </TranscriptDisclosures>
  );
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ArchiveConnectionProvider>
      <ForcedTheme
        theme={new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light'}
      >
        <AppearanceProvider>
          <ClioMotionProvider>
            <ConversationDisplayProvider>
              <Review />
            </ConversationDisplayProvider>
          </ClioMotionProvider>
        </AppearanceProvider>
      </ForcedTheme>
    </ArchiveConnectionProvider>
  </QueryClientProvider>,
);
