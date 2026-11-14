import type { Artifact, MessageBlock } from '@clio/core/v3';
import { withoutPaperMembers } from './scientific-document';
import { t } from '@lingui/core/macro';

/** Recognize a retained document preview from its recorded binding, never its filename. */
export function isDocumentPreview(artifact: Artifact): boolean {
  return (
    artifact.producer?.['designation'] === 'document-rendition' &&
    typeof artifact.producer['source_artifact_id'] === 'string' &&
    artifact.producer['source_artifact_id'].length > 0
  );
}

/** Keep deliverables in output surfaces; preview records remain available for lineage. */
export function artifactDeliverables(artifacts: readonly Artifact[]): Artifact[] {
  return withoutPaperMembers(artifacts).filter(
    (artifact) =>
      artifactEvidenceKind(artifact) === 'output' || artifact.session_relation === 'used',
  );
}

export type ArtifactEvidenceKind = 'input' | 'preview' | 'intermediate' | 'verification' | 'output';

/** Classify retained evidence from explicit producer intent, never file extensions. */
export function artifactEvidenceKind(artifact: Artifact): ArtifactEvidenceKind {
  if (artifact.session_relation === 'used') return 'input';
  if (isDocumentPreview(artifact)) return 'preview';
  if (artifact.producer?.['purpose'] === 'intermediate') return 'intermediate';
  if (
    artifact.producer?.['purpose'] === 'verification' ||
    artifact.producer?.['designation'] === 'a2ui_visual_capture'
  )
    return 'verification';
  return 'output';
}

/** The evidence kind as a reader sees it. */
export function artifactEvidenceLabel(artifact: Artifact): string {
  switch (artifactEvidenceKind(artifact)) {
    case 'input':
      return t({ message: 'Input', context: 'artifact evidence' });
    case 'preview':
      return t({ message: 'Preview', context: 'artifact evidence' });
    case 'intermediate':
      return t({ message: 'Intermediate', context: 'artifact evidence' });
    case 'verification':
      return t({ message: 'Verification', context: 'artifact evidence' });
    case 'output':
      return t({ message: 'Output', context: 'artifact evidence' });
  }
}

/** Fold legacy duplicate response links while retaining distinct causal outputs.
 * Server response links own publication intent, including an explicit promotion
 * of existing review evidence. Evidence lists must never use this projection.
 */
export function latestResponseArtifacts(artifacts: readonly Artifact[]): Artifact[] {
  const selected = new Map<string, Artifact>();
  // A paper's sources are shown inside it, not as cards beside it.
  for (const artifact of withoutPaperMembers(artifacts)) {
    if (isDocumentPreview(artifact)) continue;
    const producer = artifact.producer;
    const owner = producer?.['session_id'];
    const key =
      typeof owner === 'string' && owner && artifact.workspace_id && artifact.version
        ? // Reconciliation preserves the producing session but need not record
          // agent_id. It is still the next version of the same logical file.
          JSON.stringify([artifact.workspace_id, artifact.name, owner])
        : artifact.id;
    const previous = selected.get(key);
    if (!previous || (artifact.version ?? 0) >= (previous.version ?? 0))
      selected.set(key, artifact);
  }
  return [...selected.values()];
}

/** Select final artifact blocks across a message without hiding its activity/text. */
export function responseArtifactBlocks(
  blocks: readonly MessageBlock[],
  artifacts: Readonly<Record<string, Artifact>>,
): MessageBlock[] {
  const selected = new Set(
    latestResponseArtifacts(
      blocks.flatMap((block) =>
        block.type === 'artifact' && artifacts[block.artifact_id]
          ? [artifacts[block.artifact_id]!]
          : [],
      ),
    ).map((artifact) => artifact.id),
  );
  const seen = new Set<string>();
  return blocks.filter((block) => {
    if (block.type !== 'artifact') return true;
    if (
      seen.has(block.artifact_id) ||
      (artifacts[block.artifact_id] && !selected.has(block.artifact_id))
    )
      return false;
    seen.add(block.artifact_id);
    return true;
  });
}
