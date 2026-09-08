import { render, screen } from '@testing-library/react';
import type { Artifact } from '@clio/core/v3';
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
  ClioConversation: ({ artifacts }: { artifacts: Record<string, Artifact> }) => (
    <>
      <output data-testid="artifact-size">{artifacts['artifact_plot']?.size}</output>
      <output data-testid="artifact-ids">{Object.keys(artifacts).join(',')}</output>
    </>
  ),
}));

import { WorkspaceLiveConversation } from './workspace-live-projections';

describe('WorkspaceLiveConversation', () => {
  beforeEach(() => {
    mocks.entities.artifacts = {};
    mocks.entities.messages = {};
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

    render(<WorkspaceLiveConversation artifacts={[artifact]} sessionId="sess_1" />);

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
      />,
    );
    expect(screen.getByTestId('artifact-ids')).toHaveTextContent('version_1,version_2');
    expect(screen.getByTestId('artifact-ids')).not.toHaveTextContent('unrelated');
  });
});
