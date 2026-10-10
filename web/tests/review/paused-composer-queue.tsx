import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { ThemeProvider } from 'next-themes';
import type { QueuedMessage } from '@clio/core/v3';
import '../../src/index.css';
import { ClioComposerQueue } from '../../src/components/clio/composer-queue';
import { AppearanceProvider } from '../../src/providers/appearance-provider';
import { ClioMotionProvider } from '../../src/components/clio/motion';

const queued: QueuedMessage[] = ['Review the README', 'Summarize the release notes'].map(
  (text, position) => ({
    id: `queue_${position}`,
    session_id: 'fixture',
    revision: 1,
    position,
    parts: [{ type: 'text', text }],
    metadata: {},
    client_message_id: `future_${position}`,
    idempotency_key: `future_${position}`,
    behavior: {
      reasoning_effort: 'medium',
      execution_mode: 'execute',
      confirmation_policy: 'ask',
    },
    model: { provider_id: 'codex', model_id: 'gpt-6-luna' },
    created_at: '2026-10-08T09:00:00Z',
    updated_at: '2026-10-08T09:00:00Z',
  }),
);

export function Review() {
  const [messages, setMessages] = useState(queued);
  const [sent, setSent] = useState('No queued message was sent automatically.');
  return (
    <main className="flex min-h-dvh flex-col gap-6 bg-background px-3 py-8 text-foreground">
      <p className="mx-auto max-w-4xl text-sm text-muted-foreground">
        Simulated Stop state; actual composer queue component. No inference or user-data writes.
      </p>
      <div className="mx-auto w-full max-w-4xl">
        <h1 className="mb-3 text-xl font-medium">Submitted feedback continues after Stop</h1>
        <p className="text-sm text-muted-foreground">Future messages remain in the paused queue.</p>
      </div>
      <ClioComposerQueue
        messages={messages}
        paused
        promoteDelivery="start"
        onDelete={async (message) =>
          setMessages((rows) => rows.filter((row) => row.id !== message.id))
        }
        onPromote={async (message) => {
          setMessages((rows) => rows.filter((row) => row.id !== message.id));
          setSent(
            `Explicitly sent ${message.parts[0]?.type === 'text' ? message.parts[0].text : message.id}`,
          );
        }}
        onReorder={async (rows) => setMessages(rows)}
        onUpdate={async (message, text) =>
          setMessages((rows) =>
            rows.map((row) =>
              row.id === message.id
                ? {
                    ...row,
                    parts: [{ type: 'text', text }],
                  }
                : row,
            ),
          )
        }
      />
      <p
        role="status"
        aria-label="Manual queue action"
        className="mx-auto w-full max-w-4xl text-sm text-muted-foreground"
      >
        {sent}
      </p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
    <AppearanceProvider>
      <ClioMotionProvider>
        <Review />
      </ClioMotionProvider>
    </AppearanceProvider>
  </ThemeProvider>,
);
