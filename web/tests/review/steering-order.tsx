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

const sessionId = 'steering-review';
const created_at = '2026-10-15T18:00:00Z';
const human: Message = {
  id: 'human',
  session_id: sessionId,
  role: 'user',
  created_at,
  metadata: { steer_delivery: { assistant_message_id: 'assistant', after_part_id: 'thinking' } },
  blocks: [
    {
      id: 'steer-text',
      type: 'text',
      text: 'Do not launch a browser. Inspect the saved file instead.',
    },
  ],
};

function Review() {
  const [phase, setPhase] = useState<'thinking' | 'pending' | 'steered' | 'resumed'>('thinking');
  const [cancelled, setCancelled] = useState<string[]>([]);
  const [startedAt] = useState(() => new Date(Date.now() - 8000).toISOString());
  const humans = [
    human,
    ...['Keep it fast.', 'Use the existing file.'].map((text, index) => ({
      ...human,
      id: `human-${index + 2}`,
      blocks: [{ id: `human-text-${index + 2}`, type: 'text' as const, text }],
    })),
  ]
    .filter((row) => !cancelled.includes(row.id))
    .map((row) => (phase === 'pending' ? { ...row, metadata: undefined } : row));
  const assistant: Message = {
    id: 'assistant',
    session_id: sessionId,
    role: 'assistant',
    run_id: 'original',
    created_at,
    blocks: [
      {
        id: 'thinking',
        type: 'reasoning',
        text: 'Writing shader noise functions...\n\nStill writing shader code. I am considering how to inspect the result.',
        streaming: phase === 'thinking',
        started_at: phase === 'thinking' ? startedAt : created_at,
        duration_ms: phase === 'thinking' ? undefined : 12400,
        completed_at: phase === 'thinking' ? undefined : '2026-10-15T18:00:12.400Z',
      },
      ...(phase === 'thinking'
        ? []
        : phase === 'pending'
          ? [{ id: 'inspect-part', type: 'tool' as const, tool_id: 'inspect' }]
          : [
              {
                id: 'corrected',
                type: 'text' as const,
                channel: 'next_thought' as const,
                text: 'I will use your updated instructions for the next step.',
              },
              { id: 'inspect-part', type: 'tool' as const, tool_id: 'inspect' },
            ]),
    ],
  };
  const resumed: Message = {
    id: 'resumed',
    session_id: sessionId,
    role: 'assistant',
    run_id: 'resumed',
    created_at,
    blocks: [
      {
        id: 'judgment',
        type: 'injection',
        source: 'goal_judgment',
        text: 'Check the file syntax before finishing.',
      },
      { id: 'check-part', type: 'tool', tool_id: 'check' },
      {
        id: 'answer',
        type: 'text',
        channel: 'answer',
        text: 'The saved file passed the syntax check.',
      },
    ],
    stop_reason: 'end_turn',
    completed_at: created_at,
  };
  const tools: Record<string, ToolInvocation> = {
    inspect: {
      id: 'inspect',
      session_id: sessionId,
      name: 'fs_read_file',
      state: phase === 'pending' ? 'running' : 'succeeded',
      started_at: startedAt,
      duration_ms: phase === 'pending' ? undefined : 33900,
      input: { path: 'plasma.html' },
      output: 'HTML with an embedded script.',
      presentation: { action: 'Read', summary: 'plasma.html', blocks: [] },
    },
    check: {
      id: 'check',
      session_id: sessionId,
      name: 'shell_bash',
      state: 'succeeded',
      input: { command: 'node --check plasma.js' },
      output: 'Syntax valid.',
      presentation: { action: 'Run', summary: 'exit 0', blocks: [] },
    },
  };
  return (
    <TranscriptDisclosures sessionId={sessionId}>
      <div className="flex h-dvh min-w-0 flex-col bg-background text-foreground">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-5 py-3 text-xs text-muted-foreground">
          <p>
            Synthetic steering fixture using the production renderer. No inference or tools
            executed.
          </p>
          <Button size="sm" variant="outline" onClick={() => setPhase('thinking')}>
            Thinking only
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setCancelled([]);
              setPhase('pending');
            }}
          >
            Three steers during tool
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPhase('steered')}>
            Deliver steer
          </Button>
          <Button size="sm" variant="outline" onClick={() => setPhase('resumed')}>
            Show later goal activity
          </Button>
        </header>
        <main className="min-h-0 min-w-0 flex-1">
          <ClioConversation
            sessionId={sessionId}
            messages={
              phase === 'thinking'
                ? [assistant]
                : phase === 'steered'
                  ? [assistant, ...humans]
                  : phase === 'pending'
                    ? [assistant, ...humans]
                    : [assistant, ...humans, resumed]
            }
            pendingMessageIds={new Set(phase === 'pending' ? humans.map((row) => row.id) : [])}
            cancellablePendingMessageIds={
              new Set(phase === 'pending' ? humans.map((row) => row.id) : [])
            }
            onCancelPendingSteer={async (id) => {
              setCancelled((rows) => [...rows, id]);
            }}
            tools={phase === 'thinking' ? {} : tools}
            tasks={{}}
            subagents={{}}
            artifacts={{}}
            surfaces={{}}
            preparation={{
              sessionState: phase === 'resumed' ? 'idle' : 'running',
              activeTurnId: 'original',
            }}
          />
        </main>
      </div>
    </TranscriptDisclosures>
  );
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ArchiveConnectionProvider>
      <ForcedTheme theme="light">
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
