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
const requestedProvider = new URLSearchParams(window.location.search).get('provider');
const provider =
  requestedProvider === 'claude_code' || requestedProvider === 'vllm' ? requestedProvider : 'codex';
const model = {
  provider_id: provider,
  model_id:
    provider === 'claude_code'
      ? 'claude-sonnet-5'
      : provider === 'vllm'
        ? 'local-model-fixture'
        : 'gpt-6-luna',
};
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
  const checks: ToolInvocation[] = Array.from({ length: 6 }, (_, index) => ({
    id: `check-${index}`,
    session_id: 'fixture',
    name: 'exec_command',
    title: `Check sensor ${index + 1}`,
    state: index < 2 ? 'succeeded' : 'failed',
    input: { command: `sensor-check S-${index + 1}` },
    output: index < 2 ? 'Calibration record is present.' : undefined,
    error: index < 2 ? undefined : 'Calibration record is missing.',
    presentation: { action: 'Run', summary: `Sensor ${index + 1}`, blocks: [] },
  }));
  for (const check of checks) tools[check.id] = check;
  const message: Message = {
    id: 'review-turn',
    session_id: 'fixture',
    role: 'assistant',
    created_at: '2026-10-08T00:00:00Z',
    completed_at: live ? undefined : '2026-10-08T00:01:00Z',
    stop_reason: live ? undefined : 'completed',
    usage: { input: 492400, output: 1600, cache_read: 0, cache_write: 0 },
    blocks: [
      {
        id: 'reason-read',
        type: 'reasoning',
        provider_source: provider,
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
        provider_source: provider,
        text: 'The recommendation should request calibration records and matched readings without overstating the evidence.',
      },
      {
        id: 'update-write',
        type: 'text',
        channel: 'next_thought',
        text: 'I’ll save that distinction in the revised report.',
      },
      { id: 'tool-write', type: 'tool', tool_id: 'write' },
      ...checks.map((check) => ({
        id: `tool-${check.id}`,
        type: 'tool' as const,
        tool_id: check.id,
      })),
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
          Simulated turn fixture; actual transcript components; no inference or user-data writes
        </p>
        <Button size="sm" variant="outline" onClick={() => setLive((value) => !value)}>
          {live ? 'Finish recorded turn' : 'Stream recorded turn'}
        </Button>
      </header>
      <main className="min-h-0 min-w-0 flex-1">
        <ClioConversation
          messages={[
            {
              id: 'prompt',
              session_id: 'fixture',
              role: 'user',
              created_at: '2026-10-08T00:00:00Z',
              model,
              blocks: [{ id: 'prompt-text', type: 'text', text: 'Review the field measurements.' }],
            },
            message,
            {
              id: 'next-prompt',
              session_id: 'fixture',
              role: 'user',
              created_at: '2026-10-08T00:02:00Z',
              model: { provider_id: 'claude_code', model_id: 'claude-sonnet-5' },
              blocks: [
                { id: 'next-text', type: 'text', text: 'Explain the missing calibration records.' },
              ],
            },
          ]}
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
      <ThemeProvider
        attribute="class"
        forcedTheme={
          new URLSearchParams(window.location.search).get('theme') === 'dark' ? 'dark' : 'light'
        }
        enableSystem={false}
      >
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
