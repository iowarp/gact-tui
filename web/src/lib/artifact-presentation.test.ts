import type { Artifact } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  artifactDeliverables,
  artifactEvidenceLabel,
  isDocumentPreview,
  latestResponseArtifacts,
  responseArtifactBlocks,
} from './artifact-presentation';
import {
  artifactDetailVersionEntity,
  sessionArtifactEntities,
  sessionArtifactVersionEntities,
} from './session-artifacts';

describe('document preview presentation', () => {
  it('folds separated artifact blocks and exact repeats while preserving explanatory text and activity', () => {
    const base: Artifact = {
      id: 'v1',
      session_id: 's',
      workspace_id: 'w',
      name: 'report.html',
      uri: 'artifact://w/report.html@v1',
      media_type: 'text/html',
      version: 1,
      producer: { session_id: 's', agent_id: 'main' },
    };
    const second = { ...base, id: 'v2', version: 2 };
    expect(
      responseArtifactBlocks(
        [
          { id: 'old', type: 'artifact', artifact_id: 'v1' },
          { id: 'text', type: 'text', text: 'Corrected report.' },
          { id: 'new', type: 'artifact', artifact_id: 'v2' },
          { id: 'tool', type: 'tool', tool_id: 'create-v2' },
          { id: 'repeat', type: 'artifact', artifact_id: 'v2' },
          { id: 'unknown', type: 'artifact', artifact_id: 'unresolved' },
          { id: 'repeat-unknown', type: 'artifact', artifact_id: 'unresolved' },
        ],
        { v1: base, v2: second },
      ).map((block) => block.id),
    ).toEqual(['text', 'new', 'tool', 'unknown']);
  });
  it('collapses revised response outputs without losing independent child results or changing evidence', () => {
    const first: Artifact = {
      id: 'v1',
      session_id: 'parent',
      workspace_id: 'workspace',
      name: 'report.html',
      uri: 'artifact://workspace/report.html@v1',
      media_type: 'text/html',
      version: 1,
      producer: { session_id: 'child-a', turn_id: 'turn-a', agent_id: 'main' },
    };
    const second = {
      ...first,
      id: 'v2',
      version: 2,
      producer: { ...first.producer, turn_id: 'later-turn' },
    };
    const other = {
      ...first,
      id: 'v3',
      version: 3,
      producer: { ...first.producer, session_id: 'child-b' },
    };
    const evidence = [first, second, other];
    expect(latestResponseArtifacts(evidence).map((a) => a.id)).toEqual(['v2', 'v3']);
    expect(evidence.map((a) => a.id)).toEqual(['v1', 'v2', 'v3']);
    expect(latestResponseArtifacts([second, first, other, second]).map((a) => a.id)).toEqual([
      'v2',
      'v3',
    ]);
    expect(
      latestResponseArtifacts([
        { ...first, producer: undefined },
        { ...second, producer: undefined },
      ]),
    ).toHaveLength(2);
  });
  it('uses recorded purpose while preserving requested images/PDFs and explicitly re-designated response links', () => {
    const pdf: Artifact = {
      id: 'pdf',
      session_id: 's',
      name: 'review.pdf',
      uri: 'artifact://pdf',
      media_type: 'application/pdf',
    };
    const image = { ...pdf, id: 'image', name: 'review.png', media_type: 'image/png' };
    const verification = { ...image, id: 'verification', producer: { purpose: 'verification' } };
    const intermediate = { ...pdf, id: 'working', producer: { purpose: 'intermediate' } };
    expect(artifactDeliverables([pdf, image, verification, intermediate]).map((a) => a.id)).toEqual(
      ['pdf', 'image'],
    );
    expect([verification, intermediate, pdf].map(artifactEvidenceLabel)).toEqual([
      'Verification',
      'Intermediate',
      'Output',
    ]);
    expect(latestResponseArtifacts([verification])).toEqual([verification]);
  });
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
