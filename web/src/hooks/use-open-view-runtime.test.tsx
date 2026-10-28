import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activeA2uiOpenViewRuntime,
  subscribeViewSelection,
  useStudyViewFocus,
} from '@/lib/a2ui/open-view';
import { useOpenViewRuntime } from './use-open-view-runtime';

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const selection = { path: '/selection/case', field: 'case', values: ['c07'] };

function repository() {
  return {
    scienceLog: vi.fn(async () => ({
      session_id: 'sess_root',
      in_study: true as const,
      views: [{ entry: 'e_00000000000b', session_id: 'sess_b', surface_id: 'cases' }],
    })),
    artifactDetail: vi.fn(async (id: string) => ({
      resolved: {
        artifact_id: id,
        producer: {
          designation: id === 'artifact_dash' ? 'dashboard-report' : 'harness',
          session_id: 'sess_other',
        },
      },
      artifact: {
        id: 'rec',
        name: 'Overview',
        versions: [{ artifact_id: id, version: 1 }],
      },
    })),
    dashboard: vi.fn(async () => ({ surface: { id: 'dashboard_r1' } })),
  };
}

afterEach(() => {
  vi.clearAllMocks();
  useStudyViewFocus.getState().clear();
});

describe('openView runtime', () => {
  it('opens a study view in the Science log and hands it the selection', async () => {
    const repo = repository();
    const reveal = vi.fn();
    const { unmount } = renderHook(() =>
      useOpenViewRuntime(repo as never, 'sess_root', vi.fn(), reveal),
    );
    activeA2uiOpenViewRuntime()!.openView('e_00000000000b', selection);
    await vi.waitFor(() => expect(reveal).toHaveBeenCalledWith({ kind: 'science-log' }));
    expect(useStudyViewFocus.getState().entry).toBe('e_00000000000b');
    const applied = vi.fn();
    subscribeViewSelection('sess_b', 'cases', applied)();
    expect(applied).toHaveBeenCalledWith(selection);
    unmount();
    expect(activeA2uiOpenViewRuntime()).toBeUndefined();
  });

  it("says so when the view is not in this conversation's study", async () => {
    const repo = repository();
    const reveal = vi.fn();
    renderHook(() => useOpenViewRuntime(repo as never, 'sess_root', vi.fn(), reveal));
    activeA2uiOpenViewRuntime()!.openView('e_0000000000ff');
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "That view is not one of this conversation's study views.",
      ),
    );
    expect(reveal).not.toHaveBeenCalled();
  });

  it("opens another conversation's dashboard with the selection, and refuses other artifacts", async () => {
    const repo = repository();
    const openArtifact = vi.fn();
    renderHook(() => useOpenViewRuntime(repo as never, 'sess_root', openArtifact, vi.fn()));
    activeA2uiOpenViewRuntime()!.openView('artifact://artifact_dash', selection);
    await vi.waitFor(() => expect(openArtifact).toHaveBeenCalledTimes(1));
    expect(repo.dashboard).toHaveBeenCalledWith('sess_other', 'artifact_dash');
    const applied = vi.fn();
    subscribeViewSelection('sess_other', 'dashboard_r1', applied)();
    expect(applied).toHaveBeenCalledWith(selection);
    activeA2uiOpenViewRuntime()!.openView('artifact://artifact_plot');
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('That artifact is not a saved dashboard.'),
    );
    expect(openArtifact).toHaveBeenCalledTimes(1);
  });
});
