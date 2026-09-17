import type { Artifact } from '@clio/core/v3';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { activeA2uiOpenArtifactRuntime, useA2uiOpenArtifactRuntime } from './kernel-runtime';

const artifact: Artifact = {
  id: 'artifact_1',
  session_id: 'sess_1',
  name: 'result.csv',
  uri: 'artifact://artifact_1',
  media_type: 'text/csv',
  created_at: '2026-08-23T04:00:00.000Z',
};

describe('useA2uiOpenArtifactRuntime', () => {
  it('registers a runtime that finds an artifact by uri within the session', () => {
    const onOpen = (_artifact: Artifact) => undefined;
    const { unmount } = renderHook(() =>
      useA2uiOpenArtifactRuntime({ [artifact.id]: artifact }, 'sess_1', onOpen),
    );

    const runtime = activeA2uiOpenArtifactRuntime();
    expect(runtime?.sessionId).toBe('sess_1');
    expect(runtime?.findArtifact('artifact://artifact_1')).toEqual(artifact);
    expect(runtime?.findArtifact('artifact://not_registered')).toBeUndefined();

    unmount();
    expect(activeA2uiOpenArtifactRuntime()).toBeUndefined();
  });

  it('never matches an artifact belonging to a different session', () => {
    renderHook(() => useA2uiOpenArtifactRuntime({ [artifact.id]: artifact }, 'sess_other', () => undefined));
    expect(activeA2uiOpenArtifactRuntime()?.findArtifact('artifact://artifact_1')).toBeUndefined();
  });

  it('also matches by the id encoded in an artifact:// URI when .uri differs (S6 item 6)', () => {
    // The deleted use-a2ui-local-actions.ts matched by uri OR an
    // artifact_id/artifactId/id context key; openArtifact's sole declared
    // arg is uri, so the id fallback is derived from the artifact:// scheme.
    const renamed: Artifact = { ...artifact, id: 'artifact_2', uri: 'resource://unrelated-path' };
    renderHook(() => useA2uiOpenArtifactRuntime({ [renamed.id]: renamed }, 'sess_1', () => undefined));

    expect(activeA2uiOpenArtifactRuntime()?.findArtifact('artifact://artifact_2')).toEqual(renamed);
    expect(activeA2uiOpenArtifactRuntime()?.findArtifact('resource://unrelated-path')).toEqual(
      renamed,
    );
    expect(activeA2uiOpenArtifactRuntime()?.findArtifact('artifact://artifact_9')).toBeUndefined();
  });
});
