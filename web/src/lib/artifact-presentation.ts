import type { Artifact, MessageBlock } from '@clio/core/v3';

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
  return artifacts.filter(
    (artifact) =>
      artifactEvidenceLabel(artifact) === 'Output' || artifact.session_relation === 'used',
  );
}

/** Describe retained evidence from explicit producer intent, never file extensions. */
export function artifactEvidenceLabel(artifact: Artifact): string {
  if (artifact.session_relation === 'used') return 'Input';
  if (isDocumentPreview(artifact)) return 'Preview';
  if (artifact.producer?.['purpose'] === 'intermediate') return 'Intermediate';
  if (
    artifact.producer?.['purpose'] === 'verification' ||
    artifact.producer?.['designation'] === 'a2ui_visual_capture'
  )
    return 'Verification';
  return 'Output';
}

/** Fold legacy duplicate response links while retaining distinct causal outputs.
 * Server response links own publication intent, including an explicit promotion
 * of existing review evidence. Evidence lists must never use this projection.
 */
export function latestResponseArtifacts(artifacts: readonly Artifact[]): Artifact[] {
  const selected = new Map<string, Artifact>();
  for (const artifact of artifacts) {
    if (isDocumentPreview(artifact)) continue;
    const producer = artifact.producer;
    const owner = producer?.['session_id'];
    const key =
      typeof owner === 'string' && owner && artifact.workspace_id && artifact.version
        ? JSON.stringify([
            artifact.workspace_id,
            artifact.name,
            owner,
            producer?.['agent_id'] ?? '',
          ])
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
