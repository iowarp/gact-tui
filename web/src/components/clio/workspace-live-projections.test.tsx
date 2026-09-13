import { cleanup, render, screen } from '@testing-library/react';
import type { Artifact, A2UISurface } from '@clio/core/v3';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  entities: {
    artifacts: {},
    infrastructure: {},
    messages: {},
    subagents: {},
    surfaces: {},
    tasks: {},
    tools: {},
    active_turns: {},
    responded_turns: {},
  },
}));

vi.mock('@/store/live-store', () => ({
  useLiveStore: (selector: (state: { entities: typeof mocks.entities }) => unknown) =>
    selector({ entities: mocks.entities }),
}));

vi.mock('./conversation', () => ({
  ClioConversation: ({
    artifacts,
    surfaces,
  }: {
    artifacts: Record<string, Artifact>;
    surfaces: Record<string, A2UISurface>;
  }) => (
    <>
      <output data-testid="artifact-size">{artifacts['artifact_plot']?.size}</output>
      <output data-testid="artifact-ids">{Object.keys(artifacts).join(',')}</output>
      <output data-testid="surface-ids">{Object.keys(surfaces).join(',')}</output>
    </>
  ),
}));

vi.mock('./observability-dock', () => ({
  ClioObservabilityDock: () => null,
  ClioObservabilityView: ({
    messages,
    sessionId,
  }: {
    messages: readonly unknown[];
    sessionId?: string;
  }) => (
    <>
      <output data-testid="observability-session">{sessionId}</output>
      <output data-testid="observability-message-count">{messages.length}</output>
    </>
  ),
}));

import {
  WorkspaceLiveConversation,
  WorkspaceLiveObservabilityView,
} from './workspace-live-projections';

describe('WorkspaceLiveConversation', () => {
  beforeEach(() => {
    cleanup();
    mocks.entities.artifacts = {};
    mocks.entities.messages = {};
    mocks.entities.surfaces = {};
  });

  it('uses the registry-enriched artifact projection supplied by the workspace query', () => {
    const artifact = {
      id: 'artifact_plot',
      session_id: 'sess_1',
      workspace_id: 'ws_1',
      name: 'vertical-displacement.png',
      media_type: 'image/png',
      uri: 'artifact://ws_1/vertical-displacement.png@v1',
      size: 128,
      created_at: '2026-09-05T00:00:00Z',
    } satisfies Artifact;

    render(<WorkspaceLiveConversation artifacts={[artifact]} sessionId="sess_1" subagents={[]} />);

    expect(screen.getByTestId('artifact-size')).toHaveTextContent('128');
  });

  it('keeps exact historical result versions without importing other sessions', () => {
    const previous: Artifact = {
      id: 'version_1',
      session_id: 'sess_1',
      name: 'evidence.txt',
      media_type: 'text/plain',
      uri: 'artifact://ws/evidence.txt@v1',
    };
    mocks.entities.artifacts = {
      version_1: previous,
      unrelated: { ...previous, id: 'unrelated', session_id: 'sess_2' },
    };
    render(
      <WorkspaceLiveConversation
        artifacts={[{ ...previous, id: 'version_2' }]}
        sessionId="sess_1"
        subagents={[]}
      />,
    );
    expect(screen.getByTestId('artifact-ids')).toHaveTextContent('version_1,version_2');
    expect(screen.getByTestId('artifact-ids')).not.toHaveTextContent('unrelated');
  });

  it('does not import detached A2UI surfaces from another session', () => {
    const surface = {
      id: 'surface_current',
      session_id: 'sess_1',
      catalog_id: 'catalog_1',
      protocol_version: '0.9.1',
      revision: 1,
      state: 'ready',
      messages: [],
    } satisfies A2UISurface;
    mocks.entities.surfaces = {
      surface_current: surface,
      surface_other: { ...surface, id: 'surface_other', session_id: 'sess_2' },
    };

    render(<WorkspaceLiveConversation artifacts={[]} sessionId="sess_1" subagents={[]} />);

    expect(screen.getByTestId('surface-ids')).toHaveTextContent('surface_current');
    expect(screen.getByTestId('surface-ids')).not.toHaveTextContent('surface_other');
  });

  it('passes the authoritative session identity into the observability state owner', () => {
    mocks.entities.messages = {
      current: {
        id: 'message_current',
        session_id: 'sess_1',
        role: 'assistant',
        created_at: '2026-09-10T12:00:00Z',
        blocks: [],
      },
      other: {
        id: 'message_other',
        session_id: 'sess_2',
        role: 'assistant',
        created_at: '2026-09-10T12:00:01Z',
        blocks: [],
      },
    };

    render(
      <WorkspaceLiveObservabilityView
        artifacts={[]}
        contextFiles={[]}
        contextFrames={[]}
        diffs={[]}
        processes={[]}
        runs={[]}
        sessionId="sess_1"
        subagents={[]}
        tasks={[]}
        tools={[]}
      />,
    );

    expect(screen.getByTestId('observability-session')).toHaveTextContent('sess_1');
    expect(screen.getByTestId('observability-message-count')).toHaveTextContent('1');
  });
});
