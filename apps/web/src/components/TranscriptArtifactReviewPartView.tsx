import type { PartArtifactReview } from '@clio/core';
import { PartCard } from './TranscriptPartCard.js';

/** Render one user review instruction without exposing its model-facing prompt. */
export function ArtifactReviewPartView(props: { part: PartArtifactReview }) {
  const selectedText = () =>
    typeof props.part.anchor['exact'] === 'string'
      ? props.part.anchor['exact']
      : 'Document selection';
  const artifactName = () =>
    typeof props.part.metadata?.['artifact_name'] === 'string'
      ? props.part.metadata['artifact_name']
      : props.part.artifact_id;

  return (
    <PartCard
      variant="artifact-review"
      testId={`artifact-review-${props.part.review_id}`}
      icon="mention"
      head={
        <>
          <strong>Document review</strong>
          <span>
            {artifactName()} · v{props.part.artifact_version}
          </span>
        </>
      }
    >
      <q>{selectedText()}</q>
      <p>{props.part.review_text}</p>
      <code>{props.part.artifact_sha256.slice(0, 12)}</code>
    </PartCard>
  );
}
