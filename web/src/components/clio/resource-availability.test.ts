import type { WorkspaceResource } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  resourceAvailability,
  resourcePipelineStages,
  summarizeResourcePipelineStages,
  type ResourcePipelineStage,
} from './resource-availability';

function workspaceResource(overrides: Partial<WorkspaceResource> = {}): WorkspaceResource {
  return {
    id: 'resource_1',
    workspace_id: 'workspace_1',
    client_upload_id: 'upload_1',
    revision: 1,
    name: 'reading.parquet',
    claimed_mime: 'application/vnd.apache.parquet',
    detected_mime: 'application/vnd.apache.parquet',
    detection_source: 'signature',
    declared_size: 12,
    received_size: 12,
    sha256: 'abc',
    state: 'ready',
    failure: '',
    created_at: '2026-08-31T00:00:00Z',
    updated_at: '2026-08-31T00:00:00Z',
    completed_at: '2026-08-31T00:00:00Z',
    mime_mismatch: false,
    ...overrides,
  };
}

const upload = (kind: ResourcePipelineStage['kind'], label: string): ResourcePipelineStage => ({
  kind,
  label,
  name: 'Upload',
});

const conversion = (kind: ResourcePipelineStage['kind'], label: string): ResourcePipelineStage => ({
  kind,
  label,
  name: 'Conversion',
});

describe('summarizeResourcePipelineStages', () => {
  it('lets a failed stage decide the summary even while another is still running', () => {
    expect(
      summarizeResourcePipelineStages(upload('failed', 'Failed'), conversion('active', 'Retrying')),
    ).toMatchObject({ overall: 'failed', overallLabel: 'Unavailable' });
    expect(
      summarizeResourcePipelineStages(
        upload('active', 'In progress'),
        conversion('failed', 'Failed'),
      ),
    ).toMatchObject({ overall: 'failed', overallLabel: 'Unavailable' });
  });

  it('keeps the running, waiting and complete summaries in that order', () => {
    expect(
      summarizeResourcePipelineStages(
        upload('complete', 'Complete'),
        conversion('active', 'In progress'),
      ),
    ).toMatchObject({ overall: 'active', overallLabel: 'Processing' });
    expect(
      summarizeResourcePipelineStages(
        upload('complete', 'Complete'),
        conversion('waiting', 'Queued'),
      ),
    ).toMatchObject({ overall: 'waiting', overallLabel: 'Waiting' });
    expect(
      summarizeResourcePipelineStages(
        upload('complete', 'Complete'),
        conversion('complete', 'Complete'),
      ),
    ).toMatchObject({ overall: 'complete', overallLabel: 'Ready' });
  });
});

describe('resourceAvailability', () => {
  it('takes the service delivery decision over a local media-type guess', () => {
    const resource = workspaceResource();

    // No delivery record yet: only the media type is available to judge by.
    expect(resourceAvailability(resource).state).toBe('needs_processing');
    // The service already decided how this reaches the model, and that answer
    // outranks a media-type allowlist the client keeps for the composer.
    expect(resourceAvailability(resource, { representation: 'bounded_tools' }).state).toBe('ready');
    expect(resourceAvailability(resource, { representation: 'metadata_only' }).state).toBe(
      'needs_processing',
    );
  });

  it('falls back to the media type only for an attachment with no delivery record', () => {
    expect(resourceAvailability(workspaceResource({ detected_mime: 'text/csv' })).state).toBe(
      'ready',
    );
    expect(
      resourceAvailability(workspaceResource({ detected_mime: 'application/geo+json' })).state,
    ).toBe('ready');
    expect(
      resourceAvailability(workspaceResource({ detected_mime: 'application/pdf' })).state,
    ).toBe('needs_processing');
  });

  it('reports an unverifiable attachment as unknown rather than unavailable', () => {
    expect(resourceAvailability().state).toBe('unknown');
  });

  it('carries no presentation class of its own', () => {
    expect(resourceAvailability(workspaceResource())).not.toHaveProperty('className');
  });

  it('reports the conversion stage without claiming partial agent availability', () => {
    const resource = workspaceResource({
      processing: {
        workspace_id: 'workspace_1',
        resource_id: 'resource_1',
        resource_revision: 1,
        source_sha256: 'abc',
        processor: 'docling',
        processor_url: 'http://processor.test',
        job_id: 'job_1',
        state: 'processing',
        progress: 40,
        progress_kind: 'stage',
        stage: 'docling',
        derivatives_available: false,
        failure: {},
        cancellation: {},
        created_at: '2026-08-31T00:00:00Z',
        updated_at: '2026-08-31T00:00:01Z',
      },
    });

    expect(resourceAvailability(resource)).toMatchObject({
      detail: 'Converting.',
      state: 'preparing',
    });
  });
});

describe('resourcePipelineStages', () => {
  it('names stage-based conversion honestly instead of displaying a milestone as percent', () => {
    const stages = resourcePipelineStages(
      workspaceResource({
        processing: {
          workspace_id: 'workspace_1',
          resource_id: 'resource_1',
          resource_revision: 1,
          source_sha256: 'abc',
          processor: 'docling',
          processor_url: 'http://processor.test',
          job_id: 'job_1',
          state: 'processing',
          progress: 40,
          progress_kind: 'stage',
          stage: 'docling',
          derivatives_available: false,
          failure: {},
          cancellation: {},
          created_at: '2026-08-31T00:00:00Z',
          updated_at: '2026-08-31T00:00:01Z',
        },
      }),
    );

    expect(stages.conversion).toMatchObject({
      detail: undefined,
      kind: 'active',
      label: 'Converting',
    });
  });

  it('shows a percentage only when a converter declares measured progress', () => {
    const resource = workspaceResource({
      processing: {
        workspace_id: 'workspace_1',
        resource_id: 'resource_1',
        resource_revision: 1,
        source_sha256: 'abc',
        processor: 'measured-converter',
        processor_url: 'http://processor.test',
        job_id: 'job_1',
        state: 'processing',
        progress: 42,
        progress_kind: 'measured',
        stage: 'conversion',
        derivatives_available: false,
        failure: {},
        cancellation: {},
        created_at: '2026-08-31T00:00:00Z',
        updated_at: '2026-08-31T00:00:01Z',
      },
    });

    expect(resourcePipelineStages(resource).conversion.detail).toBe('42%');
  });

  it('keys the conversion stage off the availability state, not its wording', () => {
    const resource = workspaceResource({ detected_mime: 'text/csv' });

    expect(resourcePipelineStages(resource).conversion).toMatchObject({
      kind: 'complete',
      label: 'Not required',
    });
    // A caller passing a differently worded availability must not change the
    // stage: the state decides, the label is only what a person reads.
    expect(
      resourcePipelineStages(resource, {
        detail: 'Reworded elsewhere',
        label: 'Good to go',
        state: 'ready',
      }).conversion,
    ).toMatchObject({ kind: 'complete', label: 'Not required' });
  });

  it('says the state is unknown instead of showing an attachment as waiting', () => {
    const stages = resourcePipelineStages(undefined);

    expect(stages.upload.kind).toBe('unknown');
    expect(stages).toMatchObject({ overall: 'unknown', overallLabel: 'Status unknown' });
  });
});
