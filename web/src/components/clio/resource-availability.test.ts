import { describe, expect, it } from 'vitest';
import {
  summarizeResourcePipelineStages,
  type ResourcePipelineStage,
} from './resource-availability';

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
      summarizeResourcePipelineStages(upload('active', 'In progress'), conversion('failed', 'Failed')),
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
