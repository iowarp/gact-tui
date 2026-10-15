import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import type { Message, ToolInvocation } from '@clio/core/v3';
import '../../src/index.css';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { ConversationDisplayProvider } from '../../src/providers/conversation-display-provider';
import { ClioConversation } from '../../src/components/clio/conversation';
import { TranscriptDisclosures } from '../../src/components/clio/transcript-disclosures';
import { ClioMotionProvider } from '../../src/components/clio/motion';
import { Button } from '../../src/components/ui/button';
import { ClioComposer } from '../../src/components/clio/composer';

function Review() {
  const [phase, setPhase] = useState<
    'initial' | 'wait' | 'reasoning' | 'tool' | 'complete' | 'paused'
  >('wait');
  const tool: ToolInvocation = {
    id: 'read',
    session_id: 'model-wait',
    name: 'fs_read_file',
    title: 'Read notes',
    state: phase === 'tool' ? 'running' : 'succeeded',
    input: { filepath: 'notes.md' },
    output: phase === 'tool' ? undefined : 'Notes loaded.',
    presentation: { action: 'Read notes', summary: 'notes.md', blocks: [] },
  };
  const user: Message = {
    id: 'user',
    session_id: 'model-wait',
    run_id: 'response',
    role: 'user',
    created_at: '2026-10-15T12:00:00Z',
    blocks: [
      { id: 'prompt', type: 'text', text: 'Summarize the notes and explain the next step.' },
    ],
  };
  const assistant: Message = {
    ...user,
    id: 'assistant',
    role: 'assistant',
    blocks: [
      { id: 'read-block', type: 'tool', tool_id: 'read' },
      ...(phase === 'reasoning'
        ? [
            {
              id: 'thinking',
              type: 'reasoning' as const,
              provider_source: 'model:provider_field',
              streaming: true,
              text: 'Comparing the notes\n\nSimulated reasoning sample for this UI fixture.',
            },
          ]
        : []),
      ...(phase === 'complete'
        ? [
            {
              id: 'answer',
              type: 'text' as const,
              text: 'The notes are summarized. Review the source before acting.',
            },
          ]
        : []),
    ],
  };
  return (
    <TranscriptDisclosures sessionId="model-wait">
      <div className="flex h-dvh min-w-0 flex-col bg-background text-foreground">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b px-5 py-3 text-xs text-muted-foreground">
          <p className="w-full">
            Simulated MAG waiting states using the production renderer. No inference.
          </p>
          {(['initial', 'wait', 'reasoning', 'tool', 'complete', 'paused'] as const).map(
            (state) => (
              <Button key={state} size="sm" variant="outline" onClick={() => setPhase(state)}>
                {state}
              </Button>
            ),
          )}
        </header>
        <main className="min-h-0 min-w-0 flex-1">
          <ClioConversation
            sessionId="model-wait"
            messages={phase === 'initial' ? [user] : [user, assistant]}
            tools={{ read: tool }}
            tasks={{}}
            subagents={{}}
            artifacts={{}}
            surfaces={{}}
            preparation={{
              activeTurnId: 'response',
              activeTurnResponded: phase !== 'initial',
              sessionState:
                phase === 'complete'
                  ? 'completed'
                  : phase === 'paused'
                    ? 'waiting_user'
                    : 'running',
            }}
          />
        </main>
        <div className="mx-auto w-full max-w-4xl shrink-0 px-3 pb-3">
          <ClioComposer
            attachments={false}
            state="completed"
            provider="amsc_mag"
            model="inkling-small-xhigh@cborg"
            modelOptions={[
              {
                providerId: 'amsc_mag',
                providerName: 'AmSC Model Access Gateway',
                id: 'inkling-small-xhigh@cborg',
                label: 'inkling-small-xhigh@cborg',
                available: true,
                reasoning: { levels: ['low', 'medium', 'high'], default: 'high' },
              },
            ]}
            onSubmit={async () => undefined}
          />
        </div>
      </div>
    </TranscriptDisclosures>
  );
}

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <ArchiveConnectionProvider>
      <ThemeProvider attribute="class" forcedTheme="light" enableSystem={false}>
        <AppearanceProvider>
          <ClioMotionProvider>
            <ConversationDisplayProvider>
              <Review />
            </ConversationDisplayProvider>
          </ClioMotionProvider>
        </AppearanceProvider>
      </ThemeProvider>
    </ArchiveConnectionProvider>
  </QueryClientProvider>,
);
