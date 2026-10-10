import type { Artifact, ClioRepository, ToolInvocation } from '@clio/core/v3';
import { useEffect, useRef } from 'react';
import { artifactDetailVersionEntity } from '@/lib/session-artifacts';

function publishedArtifactId(output: unknown): string | undefined {
  if (Array.isArray(output)) {
    for (const block of output) {
      if (block?.type !== 'text' || typeof block.text !== 'string' || block.text.length > 10000)
        continue;
      try {
        const id = publishedArtifactId(JSON.parse(block.text));
        if (id) return id;
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
    return;
  }
  if (!output || typeof output !== 'object') return;
  const result = output as Record<string, unknown>;
  return result.ok !== false &&
    typeof result.artifact_id === 'string' &&
    /^artifact_[a-zA-Z0-9_-]+$/u.test(result.artifact_id)
    ? result.artifact_id
    : undefined;
}

/** Open freshly published reports in the viewed conversation so the agent can review their pixels. */
export function useDashboardReviewOpening(
  tools: Readonly<Record<string, ToolInvocation>>,
  artifacts: Readonly<Record<string, Artifact>>,
  sessionId: string,
  onOpenArtifact: (artifact: Artifact) => void,
  repository: Pick<ClioRepository, 'artifactDetail'>,
): void {
  const review = useRef<{
    sessionId: string;
    mountedAt: number;
    opened: Set<string>;
    pending: Map<string, AbortController>;
  }>(undefined);
  useEffect(() => {
    const current = {
      sessionId,
      mountedAt: Date.now(),
      opened: new Set<string>(),
      pending: new Map<string, AbortController>(),
    };
    review.current = current;
    return () => {
      for (const controller of current.pending.values()) controller.abort();
      if (review.current === current) review.current = undefined;
    };
  }, [sessionId]);
  useEffect(() => {
    const current = review.current;
    if (!current || current.sessionId !== sessionId) return;
    for (const tool of Object.values(tools)) {
      if (
        tool.session_id !== sessionId ||
        tool.name !== 'publish_dashboard_report' ||
        tool.state !== 'succeeded' ||
        !tool.started_at ||
        !(Date.parse(tool.started_at) >= current.mountedAt) ||
        current.opened.has(tool.id)
      )
        continue;
      const id = publishedArtifactId(tool.output);
      const artifact = id ? artifacts[id] : undefined;
      if (artifact) {
        if (artifact.session_id !== sessionId) continue;
        current.opened.add(tool.id);
        onOpenArtifact(artifact);
      } else if (id && !current.pending.has(tool.id)) {
        // Message hydration can attach artifacts only after the turn finishes.
        // Resolve the already-published registry entry while the agent is still
        // running, so its next inspection can find the actual mounted viewer.
        const controller = new AbortController();
        current.pending.set(tool.id, controller);
        void repository
          .artifactDetail(id, controller.signal)
          .then((detail) => {
            if (
              controller.signal.aborted ||
              review.current !== current ||
              current.opened.has(tool.id)
            )
              return;
            if (
              detail.resolved.artifact_id !== id ||
              detail.resolved.producer.session_id !== sessionId ||
              detail.resolved.producer.designation !== 'dashboard-report'
            )
              return;
            current.opened.add(tool.id);
            onOpenArtifact(artifactDetailVersionEntity(detail, id, sessionId));
          })
          .catch((error) => {
            if (!controller.signal.aborted)
              console.warn('Dashboard review could not resolve the published artifact', error);
          });
      }
    }
  }, [tools, artifacts, sessionId, onOpenArtifact, repository]);
}
