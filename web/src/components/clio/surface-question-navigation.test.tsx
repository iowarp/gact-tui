import type { A2UISurface, PendingInteraction } from '@clio/core/v3';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLIO_A2UI_CATALOG_ID,
  CLIO_WORKSPACE_CATALOG_ROW,
} from '@/test-fixtures/a2ui/v0_9_1/fixtures';
import { A2uiSessionRegistryOwner } from '@/test-fixtures/a2ui/v0_9_1/test-harness';
import { embedsQuestionSurface, questionTabPath } from '@/lib/a2ui/question-navigation';
import { ClioA2UISurface } from './a2ui-surface';
import { QuestionAnswerContext } from './question-answer-context';
import { useWorkspaceQuestions } from './use-workspace-questions';
import { useSurfaceQuestionNavigation } from './use-surface-question-navigation';
import { surfaceAwaitsPendingResponse } from './conversation-message-projection';

const repository = vi.hoisted(() => ({
  a2uiAction: vi.fn().mockResolvedValue({ status: 'accepted' }),
  a2uiCatalogs: vi.fn(),
  a2uiCapabilities: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));

function dashboard(bound = false): A2UISurface {
  return {
    id: 'dashboard',
    session_id: 'owner',
    message_id: 'view-message',
    part_id: 'view-part',
    run_id: 'view-run',
    catalog_id: CLIO_A2UI_CATALOG_ID,
    protocol_version: '0.9.1',
    revision: 1,
    state: 'ready',
    message_revisions: [1, 2, 3],
    messages: [
      {
        version: 'v0.9.1',
        createSurface: { surfaceId: 'dashboard', catalogId: CLIO_A2UI_CATALOG_ID },
      },
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId: 'dashboard',
          components: [
            {
              id: 'root',
              component: 'Tabs',
              ...(bound ? { activeTab: { path: '/activeTab' } } : {}),
              tabs: [
                { title: 'Overview', child: 'overview' },
                { title: 'Runs', child: 'runs' },
                { title: 'Metrics', child: 'metrics' },
                { title: 'Storage', child: 'storage' },
                { title: 'Decisions', child: 'decisions' },
              ],
            },
            {
              id: 'overview',
              component: 'TextField',
              label: 'Project name',
              value: { path: '/project' },
            },
            ...['runs', 'metrics', 'storage'].map((id) => ({
              id,
              component: 'Text',
              text: `${id} view`,
            })),
            { id: 'decisions', component: 'Column', children: ['warning', 'submit'] },
            { id: 'warning', component: 'Text', text: 'Delete 3 stale checkpoints?' },
            {
              id: 'submit',
              component: 'Button',
              child: 'submit-label',
              action: { event: { name: 'question.submit', context: { choice: 'delete' } } },
            },
            { id: 'submit-label', component: 'Text', text: 'Delete checkpoints' },
          ],
        },
      },
      {
        version: 'v0.9.1',
        updateDataModel: {
          surfaceId: 'dashboard',
          path: '/',
          value: { project: 'Demo', activeTab: 'overview' },
        },
      },
    ],
  };
}

function question(overrides: Partial<PendingInteraction> = {}): PendingInteraction {
  return {
    id: 'question:review',
    kind: 'question',
    owner_session_id: 'owner',
    attended_session_id: 'owner',
    status: 'pending',
    title: 'Question from agent',
    prompt: 'Review checkpoint cleanup',
    requires_human_response: true,
    source: { protocol: 'native', surface_id: 'dashboard' },
    payload: { response_mode: 'blocking', metadata: { a2ui_answer_action: 'question.submit' } },
    actions: ['answer', 'cancel'],
    created_at: '2026-10-15T00:00:00Z',
    ...overrides,
  };
}

function View({ surface }: { surface: A2UISurface }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useSurfaceQuestionNavigation({
    messages: [],
    sessionId: surface.session_id,
    scrollRef,
    jumpToMessage: vi.fn(),
  });
  return (
    <div ref={scrollRef}>
      <ClioA2UISurface surface={surface} />
    </div>
  );
}

function Scene({
  owner = 'owner',
  bound = false,
  revealOwner = vi.fn(),
}: {
  owner?: string;
  bound?: boolean;
  revealOwner?: (owner: string) => void;
}) {
  const [interactions, setInteractions] = useState<PendingInteraction[]>([]);
  const [surface] = useState(() => ({ ...dashboard(bound), session_id: owner }));
  const { questionAnswering, pendingInteractionsPanel } = useWorkspaceQuestions({
    interactions,
    messages: [],
    tools: [],
    focusComposer: vi.fn(),
    send: vi.fn(),
    respondInteraction: vi.fn(),
    revealSurfaceOwner: revealOwner,
    tray: { surfaces: { dashboard: surface }, viewedSessionId: 'owner' },
  });
  return (
    <QuestionAnswerContext.Provider value={questionAnswering.context}>
      <button onClick={() => setInteractions([question({ owner_session_id: owner })])}>
        Ask about cleanup
      </button>
      <View surface={surface} />
      {pendingInteractionsPanel}
    </QuestionAnswerContext.Provider>
  );
}

beforeEach(() => {
  repository.a2uiCatalogs.mockResolvedValue({ rows: [CLIO_WORKSPACE_CATALOG_ROW], rejected: [] });
  repository.a2uiCapabilities.mockResolvedValue({
    agent: { 'v0.9': { supportedCatalogIds: [CLIO_A2UI_CATALOG_ID] } },
    client: null,
    selection: null,
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('linked surface questions', () => {
  it.each([false, true])(
    'retains five tabs and draft values, with bound tabs=%s, and submits only on the answer control',
    async (bound) => {
      const user = userEvent.setup();
      render(
        <QueryClientProvider client={new QueryClient()}>
          <A2uiSessionRegistryOwner sessionId="owner">
            <Scene bound={bound} />
          </A2uiSessionRegistryOwner>
        </QueryClientProvider>,
      );
      const input = await screen.findByRole('textbox', { name: 'Project name' });
      await user.clear(input);
      await user.type(input, 'Retained draft');
      await user.click(screen.getByRole('button', { name: 'Ask about cleanup' }));
      expect(screen.getAllByRole('tab')).toHaveLength(5);
      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('data-state', 'active');
      expect(input).toHaveValue('Retained draft');
      expect(document.querySelectorAll('[data-slot="pending-a2ui"]')).toHaveLength(0);
      expect(repository.a2uiAction).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Go to question' }));
      await waitFor(() =>
        expect(screen.getByRole('tab', { name: 'Decisions' })).toHaveAttribute(
          'data-state',
          'active',
        ),
      );
      expect(screen.getAllByRole('button', { name: 'Delete checkpoints' })).toHaveLength(1);
      expect(repository.a2uiAction).not.toHaveBeenCalled();
      await user.click(screen.getByRole('tab', { name: 'Overview' }));
      expect(screen.getByRole('textbox', { name: 'Project name' })).toHaveValue('Retained draft');
      await user.click(screen.getByRole('button', { name: 'Go to question' }));
      await user.click(await screen.findByRole('button', { name: 'Delete checkpoints' }));
      expect(repository.a2uiAction).toHaveBeenCalledTimes(1);
      expect(repository.a2uiAction.mock.calls[0]?.[0]).toBe('owner');
    },
  );

  it('keeps linked and legacy questions in the original view; inline is an explicit choice', () => {
    const linked = question();
    expect(embedsQuestionSurface(linked)).toBe(false);
    expect(surfaceAwaitsPendingResponse([linked], 'dashboard')).toBe(false);
    const inline = question({ payload: { metadata: { a2ui_presentation: 'inline' } } });
    expect(embedsQuestionSurface(inline)).toBe(true);
    expect(surfaceAwaitsPendingResponse([inline], 'dashboard')).toBe(true);
    expect(
      surfaceAwaitsPendingResponse([{ ...inline, requires_human_response: false }], 'dashboard'),
    ).toBe(false);
  });

  it('finds the answer tab by action identity and refuses an ambiguous target', () => {
    const surface = dashboard();
    expect(questionTabPath(surface, 'question.submit').get('root')).toBe('decisions');
    expect(questionTabPath(surface, 'other.action').size).toBe(0);
    const update = surface.messages[1] as {
      updateComponents: { components: Record<string, unknown>[] };
    };
    update.updateComponents.components.push({
      id: 'runs',
      component: 'Button',
      child: 'submit-label',
      action: { event: { name: 'question.submit' } },
    });
    expect(questionTabPath(surface, 'question.submit').size).toBe(0);
  });

  it('reveals the exact child owner before selecting its answer tab', async () => {
    const reveal = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <A2uiSessionRegistryOwner sessionId="child">
          <Scene owner="child" revealOwner={reveal} />
        </A2uiSessionRegistryOwner>
      </QueryClientProvider>,
    );
    await screen.findByRole('textbox', { name: 'Project name' });
    await userEvent.click(screen.getByRole('button', { name: 'Ask about cleanup' }));
    await userEvent.click(screen.getByRole('button', { name: 'Go to question' }));
    expect(reveal).toHaveBeenCalledWith('child');
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Decisions' })).toHaveAttribute(
        'data-state',
        'active',
      ),
    );
    expect(repository.a2uiAction).not.toHaveBeenCalled();
  });

  it('finds nested tab ancestors and handles cyclic component references', () => {
    const surface = dashboard();
    const update = surface.messages[1] as {
      updateComponents: { components: Record<string, unknown>[] };
    };
    update.updateComponents.components.push(
      {
        id: 'decisions',
        component: 'Tabs',
        tabs: [
          { title: 'Other', child: 'cycle' },
          { title: 'Cleanup', child: 'submit' },
        ],
      },
      { id: 'cycle', component: 'Column', children: ['cycle'] },
    );
    expect([...questionTabPath(surface, 'question.submit')]).toEqual([
      ['root', 'decisions'],
      ['decisions', 'submit'],
    ]);
  });

  it('leaves malformed surface diagnostics to the renderer without crashing navigation', () => {
    expect(
      questionTabPath(
        {
          ...dashboard(),
          messages: [
            null,
            42,
            { updateComponents: { components: 42 } },
            {
              updateComponents: {
                components: [null, { id: 'tabs', component: 'Tabs', tabs: [null] }],
              },
            },
          ],
        },
        'question.submit',
      ).size,
    ).toBe(0);
  });
});
