import type { Artifact } from '@clio/core/v3';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useA2UILocalActions } from './use-a2ui-local-actions';

const artifact: Artifact = {
  id: 'artifact_1',
  session_id: 'sess_1',
  name: 'result.csv',
  uri: 'workspace://result.csv',
  media_type: 'text/csv',
  created_at: '2026-08-23T04:00:00.000Z',
};

describe('useA2UILocalActions', () => {
  it('opens only an artifact owned by the focused session', () => {
    const onOpen = vi.fn();
    const { result } = renderHook(() =>
      useA2UILocalActions({ [artifact.id]: artifact }, 'sess_1', onOpen),
    );

    expect(
      result.current({
        name: 'artifact.open',
        surfaceId: 'surface_1',
        sourceComponentId: 'artifact-card',
        timestamp: '2026-08-23T04:00:00.000Z',
        context: { artifact_id: 'artifact_1' },
      }),
    ).toBe('result.csv opened in the workspace canvas');
    expect(onOpen).toHaveBeenCalledWith(artifact);
  });

  it('rejects an artifact that belongs to another session', () => {
    const { result } = renderHook(() =>
      useA2UILocalActions({ [artifact.id]: artifact }, 'sess_other', vi.fn()),
    );

    expect(() =>
      result.current({
        name: 'artifact.open',
        surfaceId: 'surface_1',
        sourceComponentId: 'artifact-card',
        timestamp: '2026-08-23T04:00:00.000Z',
        context: { artifact_id: 'artifact_1' },
      }),
    ).toThrow('not available in this session');
  });
});
