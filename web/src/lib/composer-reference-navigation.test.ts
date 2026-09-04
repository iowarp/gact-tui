import type {
  Artifact,
  ClioRepository,
  SessionDiff,
  WorkspaceReference,
  WorkspaceResource,
} from '@clio/core/v3';
import { describe, expect, it, vi } from 'vitest';
import { navigateComposerReference } from './composer-reference-navigation';

function reference(
  kind: WorkspaceReference['kind'],
  navigation: Record<string, unknown> = {},
  overrides: Partial<WorkspaceReference> = {},
): WorkspaceReference {
  return {
    kind,
    id: `${kind}_1`,
    label: `${kind} one`,
    detail: `${kind} detail`,
    media_type: 'text/plain',
    revision: '1',
    navigation,
    ...overrides,
  };
}

function harness(overrides: Partial<Parameters<typeof navigateComposerReference>[0]> = {}) {
  const calls = {
    openArtifact: vi.fn(),
    openDiff: vi.fn(),
    openExternal: vi.fn(),
    openSession: vi.fn(),
    openWorkspaceFile: vi.fn(),
    openWorkspaceResource: vi.fn(),
    revealSession: vi.fn(),
  };
  const repository = {
    artifactDetail: vi.fn(),
    resource: vi.fn(),
  } as unknown as Pick<ClioRepository, 'artifactDetail' | 'resource'>;
  const run = (target: WorkspaceReference) =>
    navigateComposerReference({
      artifacts: [],
      diffs: [],
      ...calls,
      reference: target,
      repository,
      resources: {},
      sessionId: 'session_1',
      workspaceId: 'workspace_1',
      ...overrides,
    });
  return { calls, repository, run };
}

describe('navigateComposerReference resolves every reference kind', () => {
  it('loads a selected upload authoritatively when the workspace cache is stale', async () => {
    const resource = {
      id: 'resource_nvda',
      workspace_id: 'workspace_1',
      name: '10K-NVDA.pdf',
    } as WorkspaceResource;
    const repository = {
      artifactDetail: vi.fn(),
      resource: vi.fn(async () => resource),
    } as unknown as Pick<ClioRepository, 'artifactDetail' | 'resource'>;
    const { calls, run } = harness({ repository });

    const outcome = await run(
      reference(
        'resource',
        { workspace_id: 'workspace_1', resource_id: 'resource_nvda' },
        { id: 'resource_nvda', label: '10K-NVDA.pdf' },
      ),
    );

    expect(outcome).toEqual({ status: 'opened' });
    expect(repository.resource).toHaveBeenCalledWith('workspace_1', 'resource_nvda');
    expect(calls.openWorkspaceResource).toHaveBeenCalledWith(resource);
  });

  it('opens a workspace file from its navigation path', async () => {
    const { calls, run } = harness();

    const outcome = await run(reference('workspace_file', { path: 'data/stations.csv' }));

    expect(outcome).toEqual({ status: 'opened' });
    expect(calls.openWorkspaceFile).toHaveBeenCalledWith('data/stations.csv');
  });

  it('opens an artifact already loaded in the session', async () => {
    const artifact = { id: 'artifact_1', name: 'Plot' } as unknown as Artifact;
    const { calls, run } = harness({ artifacts: [artifact] });

    const outcome = await run(reference('artifact', {}, { id: 'artifact_1' }));

    expect(outcome).toEqual({ status: 'opened' });
    expect(calls.openArtifact).toHaveBeenCalledWith(artifact);
  });

  it('opens a changed file from the session diff it names', async () => {
    const diff = { path: 'src/app.ts' } as SessionDiff;
    const { calls, run } = harness({ diffs: [diff] });

    const outcome = await run(reference('diff', { path: 'src/app.ts' }));

    expect(outcome).toEqual({ status: 'opened' });
    expect(calls.openDiff).toHaveBeenCalledWith(diff);
  });

  it('falls back to the working file when the session no longer holds the diff', async () => {
    const { calls, run } = harness();

    const outcome = await run(reference('diff', { path: 'src/app.ts' }));

    expect(outcome).toEqual({ status: 'opened' });
    expect(calls.openWorkspaceFile).toHaveBeenCalledWith('src/app.ts');
  });

  it('reports a diff reference that names no file instead of doing nothing', async () => {
    const { calls, run } = harness();

    const outcome = await run(reference('diff', {}));

    expect(outcome).toEqual({
      status: 'unresolved',
      reason: 'This change is no longer in the session and the reference names no file.',
    });
    expect(calls.openDiff).not.toHaveBeenCalled();
    expect(calls.openWorkspaceFile).not.toHaveBeenCalled();
    expect(calls.revealSession).not.toHaveBeenCalled();
  });

  it('opens an evidence source that names a workspace resource', async () => {
    const resource = { id: 'resource_1' } as WorkspaceResource;
    const { calls, run } = harness({ resources: { resource_1: resource } });

    const outcome = await run(reference('evidence_source', { resource_id: 'resource_1' }));

    expect(outcome).toEqual({ status: 'opened' });
    expect(calls.openWorkspaceResource).toHaveBeenCalledWith(resource);
  });

  it('opens an evidence source that names a web address', async () => {
    const { calls, run } = harness();

    const outcome = await run(reference('evidence_source', { uri: 'https://example.org/paper' }));

    expect(outcome).toEqual({ status: 'opened' });
    expect(calls.openExternal).toHaveBeenCalledWith('https://example.org/paper');
  });

  it('reports an evidence source whose address this client cannot open', async () => {
    const { calls, run } = harness();

    const outcome = await run(reference('evidence_source', { uri: 'ftp://archive/paper.pdf' }));

    expect(outcome).toEqual({
      status: 'unresolved',
      reason:
        'This source points at ftp://archive/paper.pdf, which is not a workspace resource or a web address.',
    });
    expect(calls.openExternal).not.toHaveBeenCalled();
    expect(calls.revealSession).not.toHaveBeenCalled();
  });

  it('reports an evidence source that names nothing to open', async () => {
    const { calls, run } = harness();

    const outcome = await run(reference('evidence_source', {}));

    expect(outcome).toEqual({
      status: 'unresolved',
      reason: 'This source names no workspace resource or address to open.',
    });
    expect(calls.revealSession).not.toHaveBeenCalled();
  });

  it.each(['context_frame', 'plan', 'session', 'agent_run'] as const)(
    'opens the conversation a %s reference belongs to',
    async (kind) => {
      const { calls, run } = harness();

      const outcome = await run(
        reference(kind, { session_id: 'session_2', workspace_id: 'workspace_2' }),
      );

      expect(outcome).toEqual({ status: 'opened' });
      expect(calls.openSession).toHaveBeenCalledWith('workspace_2', 'session_2');
    },
  );

  it.each(['context_frame', 'plan', 'session', 'agent_run'] as const)(
    'reveals the open conversation when a %s reference belongs to it',
    async (kind) => {
      const { calls, run } = harness();

      const outcome = await run(reference(kind, { session_id: 'session_1' }));

      expect(outcome).toEqual({ status: 'opened' });
      expect(calls.revealSession).toHaveBeenCalledOnce();
      expect(calls.openSession).not.toHaveBeenCalled();
    },
  );

  it.each(['context_frame', 'plan', 'session', 'agent_run'] as const)(
    'reports a %s reference that names no conversation instead of revealing this one',
    async (kind) => {
      const { calls, run } = harness();

      const outcome = await run(reference(kind, {}));

      expect(outcome).toEqual({
        status: 'unresolved',
        reason: 'This reference names no conversation to open.',
      });
      expect(calls.revealSession).not.toHaveBeenCalled();
      expect(calls.openSession).not.toHaveBeenCalled();
    },
  );

  it('reports a workspace file reference that names no path', async () => {
    const { calls, run } = harness();

    const outcome = await run(reference('workspace_file', {}, { id: '' }));

    expect(outcome).toEqual({
      status: 'unresolved',
      reason: 'This reference names no workspace path.',
    });
    expect(calls.openWorkspaceFile).not.toHaveBeenCalled();
  });
});
