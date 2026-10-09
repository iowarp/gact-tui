import { renderHook, waitFor } from '@testing-library/react';
import type { Artifact, ArtifactDetail, ToolInvocation } from '@clio/core/v3';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDashboardReviewOpening } from './use-dashboard-review-opening';

const artifact: Artifact = {
  id: 'artifact_report',
  session_id: 'current',
  name: 'report.dashboard.json',
  uri: 'artifact://artifact_report',
  media_type: 'application/json',
};
const tool: ToolInvocation = {
  id: 'publish',
  session_id: 'current',
  name: 'publish_dashboard_report',
  state: 'succeeded',
  started_at: new Date(2000).toISOString(),
  output: { artifact_id: artifact.id },
};
const repository = { artifactDetail: vi.fn(() => new Promise<ArtifactDetail>(() => {})) };
function reportDetail(sessionId: string): ArtifactDetail {
  const version = {
    artifact_id: artifact.id,
    workspace_id: 'workspace',
    name: artifact.name,
    version: 1,
    kind: 'output',
    custody: 'cas',
    mechanism: 'tool',
    evidence_class: 'observed',
    created_at: new Date(2000).toISOString(),
    uri: artifact.uri,
    fetch_url: '/v1/artifacts/report/bytes',
    producer: { session_id: sessionId, designation: 'dashboard-report' },
    media_type: 'application/json',
  };
  const detail: ArtifactDetail = {
    resolved: version,
    artifact: {
      workspace_id: 'workspace',
      name: artifact.name,
      kind: 'output',
      latest_version: 1,
      head_artifact_id: artifact.id,
      aliases: {},
      versions: [version],
    },
  };
  return detail;
}

afterEach(() => vi.restoreAllMocks());

describe('new report visual review', () => {
  it.each([tool.output, [{ type: 'text', text: JSON.stringify(tool.output) }]])(
    'waits for the registered artifact, opens once, and handles live and reload result forms',
    (output) => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      const open = vi.fn();
      const { rerender } = renderHook(
        ({ artifacts }) =>
          useDashboardReviewOpening(
            { publish: { ...tool, output } },
            artifacts,
            'current',
            open,
            repository,
          ),
        { initialProps: { artifacts: {} as Record<string, Artifact> } },
      );
      expect(open).not.toHaveBeenCalled();
      rerender({ artifacts: { [artifact.id]: artifact } });
      expect(open).toHaveBeenCalledTimes(1);
      expect(open).toHaveBeenCalledWith(artifact);
      rerender({ artifacts: { [artifact.id]: { ...artifact } } });
      expect(open).toHaveBeenCalledTimes(1);
    },
  );

  it('does not open historical, failed, foreign, missing or unrelated outputs', () => {
    vi.spyOn(Date, 'now').mockReturnValue(3000);
    const open = vi.fn();
    const cases: ToolInvocation[] = [
      tool,
      { ...tool, started_at: undefined },
      { ...tool, started_at: new Date(4000).toISOString(), state: 'failed' },
      { ...tool, started_at: new Date(4000).toISOString(), session_id: 'other' },
      { ...tool, started_at: new Date(4000).toISOString(), name: 'capture_a2ui_surface' },
    ];
    renderHook(() =>
      useDashboardReviewOpening(
        Object.fromEntries(cases.map((item, i) => [i, item])),
        { [artifact.id]: artifact },
        'current',
        open,
        repository,
      ),
    );
    expect(open).not.toHaveBeenCalled();
  });

  it('keeps a newly published artifact from another conversation out of the active canvas', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const open = vi.fn();
    renderHook(() =>
      useDashboardReviewOpening(
        { publish: tool },
        { [artifact.id]: { ...artifact, session_id: 'other' } },
        'current',
        open,
        repository,
      ),
    );
    expect(open).not.toHaveBeenCalled();
  });

  it('opens the exact published version before message hydration finishes', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const detail = reportDetail('current');
    const resolve = { artifactDetail: vi.fn().mockResolvedValue(detail) };
    const open = vi.fn();
    renderHook(() => useDashboardReviewOpening({ publish: tool }, {}, 'current', open, resolve));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(open.mock.calls[0][0].id).toBe(artifact.id);
  });

  it.each([false, true])(
    'does not open a foreign report, including after navigation (%s)',
    async (navigated) => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      let finish!: (detail: ArtifactDetail) => void;
      const resolve = {
        artifactDetail: vi.fn(
          (_id: string, _signal?: AbortSignal) =>
            new Promise<ArtifactDetail>((done) => {
              finish = done;
            }),
        ),
      };
      const open = vi.fn();
      const { unmount } = renderHook(() =>
        useDashboardReviewOpening({ publish: tool }, {}, 'current', open, resolve),
      );
      if (navigated) unmount();
      finish(reportDetail('other'));
      await Promise.resolve();
      expect(resolve.artifactDetail.mock.calls[0][1]?.aborted).toBe(navigated);
      expect(open).not.toHaveBeenCalled();
    },
  );
});
