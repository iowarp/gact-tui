import type { ClioRepository, WorkspaceReference, WorkspaceResource } from '@clio/core/v3';
import { describe, expect, it, vi } from 'vitest';
import { navigateComposerReference } from './composer-reference-navigation';

describe('navigateComposerReference', () => {
  it('loads a selected upload authoritatively when the workspace cache is stale', async () => {
    const reference: WorkspaceReference = {
      kind: 'resource',
      id: 'resource_nvda',
      label: '10K-NVDA.pdf',
      detail: 'Uploaded source 10K-NVDA.pdf',
      media_type: 'application/pdf',
      revision: '1',
      navigation: { workspace_id: 'workspace_1', resource_id: 'resource_nvda' },
    };
    const resource = {
      id: 'resource_nvda',
      workspace_id: 'workspace_1',
      name: '10K-NVDA.pdf',
    } as WorkspaceResource;
    const repository = {
      artifactDetail: vi.fn(),
      resource: vi.fn(async () => resource),
    } as unknown as Pick<ClioRepository, 'artifactDetail' | 'resource'>;
    const openWorkspaceResource = vi.fn();

    await navigateComposerReference({
      artifacts: [],
      diffs: [],
      openArtifact: vi.fn(),
      openDiff: vi.fn(),
      openExternal: vi.fn(),
      openSession: vi.fn(),
      openWorkspaceFile: vi.fn(),
      openWorkspaceResource,
      reference,
      repository,
      resources: {},
      revealSession: vi.fn(),
      sessionId: 'session_1',
      workspaceId: 'workspace_1',
    });

    expect(repository.resource).toHaveBeenCalledWith('workspace_1', 'resource_nvda');
    expect(openWorkspaceResource).toHaveBeenCalledWith(resource);
  });
});
