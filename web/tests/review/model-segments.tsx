import type { Message } from '@clio/core/v3';
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import '../../src/index.css';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { ClioConversation } from '../../src/components/clio/conversation';
import { ClioMotionProvider } from '../../src/components/clio/motion';
import { Button } from '../../src/components/ui/button';

const first = { provider_id: 'codex', model_id: 'gpt-6-luna' };
const second = { provider_id: 'codex', model_id: 'gpt-5.6-luna' };
const third = { provider_id: 'claude_code', model_id: 'claude-sonnet-5' };

function turn(id: string, text: string, role: Message['role'], model?: Message['model']): Message {
  return {
    id,
    role,
    model,
    session_id: 'model_segment_fixture',
    created_at: '2026-10-06T12:00:00Z',
    stop_reason: role === 'assistant' ? 'end_turn' : undefined,
    blocks: [{ id: `${id}_text`, type: 'text', text }],
  };
}

const initial = [
  turn('prompt_1', 'What should we review first?', 'user', first),
  turn(
    'answer_1',
    'Start with the available data and the question it needs to answer.',
    'assistant',
  ),
  turn('prompt_2', 'Give me the next step.', 'user', second),
  turn('answer_2', 'Choose an analysis and record the assumptions used.', 'assistant'),
  turn('prompt_3', 'What should the report include?', 'user', third),
  turn(
    'answer_3',
    'Include the findings, supporting evidence and remaining uncertainty.',
    'assistant',
  ),
];

export function ModelSegmentsReview() {
  const [messages, setMessages] = useState(initial);
  return (
    <AppearanceProvider>
      <ClioMotionProvider>
        <main className="flex h-dvh flex-col bg-background text-foreground">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
            <div>
              <h1 className="text-sm font-semibold">Model changes · browser fixture</h1>
              <p className="text-xs text-muted-foreground">Simulated turns. No provider calls.</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setMessages((rows) => [
                  ...rows,
                  turn(
                    `repeat_${rows.length}`,
                    'One more point, using the same model.',
                    'user',
                    third,
                  ),
                ])
              }
            >
              Add same-model turn
            </Button>
          </header>
          <section className="min-h-0 flex-1">
            <ClioConversation
              messages={messages}
              tools={{}}
              tasks={{}}
              subagents={{}}
              artifacts={{}}
              surfaces={{}}
            />
          </section>
        </main>
      </ClioMotionProvider>
    </AppearanceProvider>
  );
}

createRoot(document.getElementById('root')!).render(<ModelSegmentsReview />);
