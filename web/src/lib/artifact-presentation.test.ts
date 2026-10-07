import type { Artifact } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { artifactDeliverables, isDocumentPreview } from './artifact-presentation';
import {
  artifactDetailVersionEntity,
  sessionArtifactEntities,
  sessionArtifactVersionEntities,
} from './session-artifacts';

describe('document preview presentation', () => {
  it('hides only recorded previews while retaining explicit PDF deliverables and immutable lookup', () => {
    const base: Artifact = {
      id: 'doc',
      session_id: 'session',
      name: 'report.docx',
      media_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      uri: 'artifact://doc',
    };
    const preview: Artifact = {
      ...base,
      id: 'preview',
      name: 'report.docx.v1.pdf',
      media_type: 'application/pdf',
      producer: {
        designation: 'document-rendition',
        source_artifact_id: 'doc',
        source_sha256: 'a'.repeat(64),
      },
    };
    const requestedPdf: Artifact = {
      ...preview,
      id: 'pdf',
      name: 'report.pdf',
      producer: { designation: 'model-proposed' },
    };
    expect(artifactDeliverables([base, preview, requestedPdf])).toEqual([base, requestedPdf]);
    expect(isDocumentPreview({ ...preview, producer: { designation: 'document-rendition' } })).toBe(
      false,
    );
    const records = [base, preview, requestedPdf].map((artifact) => ({
      workspace_id: 'workspace',
      name: artifact.name,
      kind: 'report',
      latest_version: 1,
      head_artifact_id: artifact.id,
      aliases: {},
      versions: [
        {
          artifact_id: artifact.id,
          workspace_id: 'workspace',
          name: artifact.name,
          version: 1,
          kind: 'report',
          custody: 'cas',
          mechanism: 'harness',
          evidence_class: 'hashed-at-use',
          created_at: '',
          producer: artifact.producer ?? {},
          uri: artifact.uri,
          fetch_url: '/bytes',
          media_type: artifact.media_type,
        },
      ],
    }));
    const listing = {
      artifacts: records,
      used: [],
      count: 3,
      include_children: false,
      child_session_ids: [],
    };
    expect(sessionArtifactEntities(listing, [preview], 'session').map((a) => a.id)).toEqual([
      'doc',
      'pdf',
    ]);
    expect(sessionArtifactVersionEntities(listing, 'session').map((a) => a.id)).toEqual([
      'doc',
      'preview',
      'pdf',
    ]);
    expect(
      artifactDetailVersionEntity(
        { artifact: records[1]!, resolved: records[1]!.versions[0]! },
        'preview',
        'session',
      ).producer,
    ).toEqual(preview.producer);
  });
});
