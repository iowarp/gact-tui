import type { Artifact, PendingInteraction } from '@clio/core/v3';

/** Resolve the immutable artifact registered for this specific plan review. */
export function planArtifact(
  interaction: PendingInteraction,
  artifacts: Record<string, Artifact>,
): Artifact | undefined {
  const artifactId = interaction.payload?.plan_exit?.artifact_ref?.artifact_id;
  // Revised plans share a filename; a missing reference must not open another version.
  return artifactId ? artifacts[artifactId] : undefined;
}
