import type { PendingInteraction } from '@clio/core/v3';
import { compileMessage } from '@lingui/message-utils/compileMessage';
import { generateMessageId } from '@lingui/message-utils/generateMessageId';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '@/i18n/instance';
import { ClioPendingInteractions } from './pending-interactions';

/** Load the shipped announcement joins of a locale's catalog (vitest has no .po loader). */
function loadShippedJoins(locale: string) {
  const po = readFileSync(`src/locales/${locale}/messages.po`, 'utf8');
  const messages: Record<string, ReturnType<typeof compileMessage>> = {};
  for (const [, context, id, message] of po.matchAll(
    /(?:msgctxt "([^"]*)"\n)?msgid "([^"]*)"\nmsgstr "([^"]*)"/g,
  )) {
    if (message && (id.startsWith('{text}') || id === '{position} of {total}'))
      messages[generateMessageId(id, context)] = compileMessage(message);
  }
  i18n.load(locale, messages);
  i18n.activate(locale);
}

afterEach(cleanup);

function pending(
  kind: PendingInteraction['kind'],
  overrides: Partial<PendingInteraction> = {},
): PendingInteraction {
  return {
    id: `${kind}:interaction_1`,
    kind,
    owner_session_id: 'sess_child',
    attended_session_id: 'sess_root',
    status: 'pending',
    title: 'Response requested',
    source: { protocol: kind === 'mcp_task_input' ? 'mcp' : 'native' },
    created_at: '2026-09-02T00:00:00Z',
    ...overrides,
  };
}

function renderPending(interactions: PendingInteraction[]) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ClioPendingInteractions
        interactions={interactions}
        onResponse={vi.fn(async () => undefined)}
        ownerLabels={{ sess_child: 'Evidence specialist' }}
        viewedSessionId="sess_root"
      />
    </QueryClientProvider>,
  );
}

/** The dock's polite live region: what a screen reader hears for the shown question. */
describe('pending interaction announcement', () => {
  it('announces a question once, without a second stop after its own punctuation', () => {
    renderPending([
      pending('question', {
        id: 'question:q-asks',
        prompt: 'Run it on flat-ndp?',
        title: 'Run it on flat-ndp?',
      }),
      pending('question', { id: 'question:q-plain', prompt: 'Pick a mesh', title: 'Pick a mesh' }),
    ]);

    const live = document.querySelector('p[aria-live="polite"]');
    expect(live).toHaveTextContent(/^Question: Run it on flat-ndp\? 1 of 2$/);

    cleanup();
    renderPending([
      pending('question', { id: 'question:q-plain', prompt: 'Pick a mesh', title: 'Pick a mesh' }),
      pending('question', {
        id: 'question:q-asks',
        prompt: 'Run it on flat-ndp?',
        title: 'Run it on flat-ndp?',
      }),
    ]);
    expect(document.querySelector('p[aria-live="polite"]')).toHaveTextContent(
      /^Question: Pick a mesh\. 1 of 2$/,
    );
  });

  function announced(title: string): string | null | undefined {
    cleanup();
    renderPending([
      pending('question', { id: 'question:q-first', prompt: title, title }),
      pending('question', { id: 'question:q-next', prompt: 'Pick a mesh', title: 'Pick a mesh' }),
    ]);
    return document.querySelector('p[aria-live="polite"]')?.textContent;
  }

  it('takes the Greek question mark, a semicolon and an ellipsis as sentence ends', () => {
    expect(announced('Να το τρέξω στο flat-ndp\u037e')).toBe(
      'Question: Να το τρέξω στο flat-ndp\u037e 1 of 2',
    );
    expect(announced('Να το τρέξω στο flat-ndp;')).toBe(
      'Question: Να το τρέξω στο flat-ndp; 1 of 2',
    );
    expect(announced('Run it on flat-ndp…')).toBe('Question: Run it on flat-ndp… 1 of 2');
  });

  it('keeps a gap after half-width punctuation in Japanese, and none after full-width', () => {
    loadShippedJoins('ja');
    try {
      const after = (title: string) => announced(title)?.split('flat-ndp')[1];
      // Half-width "?" ends Latin text: a full-width space, not a run-on "?2件中…".
      expect(after('Run it on flat-ndp?')).toMatch(/^\?\u3000\S/);
      // Full-width "？" ends Japanese text: no space.
      expect(after('flat-ndpで実行しますか？')).toMatch(/^で実行しますか？\S/);
      // No punctuation: the ja full stop joins, with no space.
      expect(after('flat-ndpで実行')).toMatch(/^で実行。\S/);
    } finally {
      i18n.activate('en');
    }
  });
});
