import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import type { Message, ToolInvocation } from '@clio/core/v3';
import '../../src/index.css';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { ConversationDisplayProvider } from '../../src/providers/conversation-display-provider';
import { ClioConversation } from '../../src/components/clio/conversation';
import { Button } from '../../src/components/ui/button';
import { ClioMotionProvider } from '../../src/components/clio/motion';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function Review() {
  const [live, setLive] = useState(false);
  const tools: Record<string, ToolInvocation> = {
    read: {
      id: 'read',
      session_id: 'fixture',
      name: 'fs_read_file',
      title: 'Read field measurements',
      state: live ? 'running' : 'succeeded',
      input: { path: 'sources/field-measurements.csv' },
      output: live
        ? undefined
        : 'sensor,time,temperature\nS-01,10:00,19.8\nS-02,10:00,20.1\n' +
          Array.from({ length: 90 }, (_, i) => `S-${i + 3},10:05,${20 + i / 10}`).join('\n'),
      presentation: {
        action: 'Read',
        summary: live ? 'Reading measurements' : '92 measurements read',
        blocks: [],
      },
    },
    write: {
      id: 'write',
      session_id: 'fixture',
      name: 'fs_write_file',
      title: 'Save recommendations',
      state: 'succeeded',
      input: {
        path: 'outputs/recommendations.md',
        content: '# Field review\nVerify calibration before comparing sites.',
      },
      output: { path: 'outputs/recommendations.md', bytes: 67 },
      presentation: { action: 'Write', summary: 'Recommendations saved', blocks: [] },
    },
  };
  const message: Message = {
    id: 'review-turn',
    session_id: 'fixture',
    role: 'assistant',
    created_at: '2026-10-08T00:00:00Z',
    completed_at: live ? undefined : '2026-10-08T00:01:00Z',
    stop_reason: live ? undefined : 'completed',
    blocks: [
      {
        id: 'reason-read',
        type: 'reasoning',
        text: 'I will compare the timestamps and units first. A temperature difference alone does not establish a sensor fault.',
        streaming: live,
      },
      {
        id: 'update-read',
        type: 'text',
        channel: 'next_thought',
        text: 'I’ll inspect the recorded measurements before revising the recommendations.',
      },
      { id: 'tool-read', type: 'tool', tool_id: 'read' },
      {
        id: 'intermediate',
        type: 'text',
        channel: 'answer',
        text: 'The records use matching units. Calibration information is still needed to interpret the difference.',
      },
      {
        id: 'reason-write',
        type: 'reasoning',
        text: 'The recommendation should request calibration records and matched readings without overstating the evidence.',
      },
      {
        id: 'update-write',
        type: 'text',
        channel: 'next_thought',
        text: 'I’ll save that distinction in the revised report.',
      },
      { id: 'tool-write', type: 'tool', tool_id: 'write' },
      {
        id: 'answer',
        type: 'text',
        channel: 'answer',
        text: 'The revised recommendations are saved. They request calibration records and matched source readings before drawing a conclusion.',
      },
    ],
  };
  return (
    <div className="flex h-dvh min-w-0 flex-col bg-background text-foreground">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-5 py-3 text-xs text-muted-foreground">
        <p>
          Simulated turn fixture · actual transcript components · no inference or user-data writes
        </p>
        <Button size="sm" variant="outline" onClick={() => setLive((value) => !value)}>
          {live ? 'Finish recorded turn' : 'Stream recorded turn'}
        </Button>
      </header>
      <main className="min-h-0 min-w-0 flex-1">
        <ClioConversation
          messages={[message]}
          tools={tools}
          tasks={{}}
          artifacts={{}}
          subagents={{}}
          surfaces={{}}
        />
      </main>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={client}>
    <ArchiveConnectionProvider>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
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
