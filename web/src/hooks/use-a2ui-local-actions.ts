import type { Artifact } from '@clio/core/v3';
import type { A2uiClientAction } from '@a2ui/web_core/v0_9';
import { useCallback } from 'react';

function stringContext(
  context: Record<string, unknown>,
  ...keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const value = context[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

/** Route trusted client-local A2UI actions without crossing the server command boundary. */
export function useA2UILocalActions(
  artifacts: Record<string, Artifact>,
  sessionId: string,
  onOpenArtifact: (artifact: Artifact) => void,
) {
  return useCallback(
    (action: A2uiClientAction): string => {
      if (action.name === 'artifact.open') {
        const artifactId = stringContext(action.context, 'artifact_id', 'artifactId', 'id');
        const artifactUri = stringContext(action.context, 'uri');
        const artifact = Object.values(artifacts).find(
          (candidate) =>
            candidate.session_id === sessionId &&
            (candidate.id === artifactId || Boolean(artifactUri && candidate.uri === artifactUri)),
        );
        if (!artifact) throw new Error('The requested artifact is not available in this session.');
        onOpenArtifact(artifact);
        return `${artifact.name} opened in the workspace canvas`;
      }
      if (action.name === 'data.select') {
        const selection = stringContext(action.context, 'label', 'selection', 'row_id', 'id');
        return selection ? `Selected ${selection}` : 'Data selection kept in this surface';
      }
      if (action.name === 'workflow.focus') {
        const target = stringContext(action.context, 'label', 'node_id', 'selection', 'id');
        return target ? `Focused ${target}` : 'Workflow focus kept in this surface';
      }
      throw new Error(`Unsupported local action ${action.name}`);
    },
    [artifacts, onOpenArtifact, sessionId],
  );
}
