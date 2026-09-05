import type { ExecutionProvenanceNode, ExecutionProvenanceResult } from '@clio/core/v3';

/** Build the bounded, semantically useful execution slice that existed when an artifact was made. */
export function projectArtifactResearchProvenance(
  provenance: ExecutionProvenanceResult,
  artifactId: string,
): ExecutionProvenanceResult {
  const artifactNodeId = `artifact:${artifactId}`;
  const creationTimes = provenance.spans
    .filter((span) => span.artifact_refs.some((reference) => reference.artifact_id === artifactId))
    .map((span) => span.start_time)
    .filter((value): value is number => value !== null);
  const createdAt = creationTimes.length ? Math.min(...creationTimes) : undefined;
  const tools = provenance.nodes.filter(
    (node) =>
      node.kind === 'tool' &&
      Boolean(stringAttribute(node, 'tool_name')) &&
      (createdAt === undefined || node.start_time === null || node.start_time <= createdAt),
  );
  const rootSessionId = provenance.root_session_id || provenance.session_id;
  const sessionIds = new Set([rootSessionId, ...tools.map((node) => node.session_id)]);
  const sessionLineage = provenance.session_lineage?.filter((row) =>
    sessionIds.has(row.session_id),
  );
  const taskIds = new Set(sessionLineage?.map((row) => row.task_id).filter(Boolean) ?? []);
  const retainedIds = new Set([
    artifactNodeId,
    ...tools.map((node) => node.id),
    ...[...sessionIds].map((sessionId) => `session:${sessionId}`),
    ...[...taskIds].map((taskId) => `task:${taskId}`),
  ]);
  const nodes = provenance.nodes.filter((node) => retainedIds.has(node.id));
  const nodeIds = new Set(nodes.map((node) => node.id));

  return {
    ...provenance,
    session_lineage: sessionLineage,
    spans: provenance.spans.filter((span) => nodeIds.has(span.id)),
    nodes,
    edges: provenance.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)),
  };
}

export function describeArtifactResearch(provenance: ExecutionProvenanceResult): string {
  const tools = provenance.nodes.filter(
    (node) => node.kind === 'tool' && Boolean(stringAttribute(node, 'tool_name')),
  );
  const sessions = new Set(tools.map((node) => node.session_id));
  const searches = tools.filter(
    (node) => stringAttribute(node, 'tool_name') === 'web_search',
  ).length;
  const fetches = tools.filter((node) => stringAttribute(node, 'tool_name') === 'web_fetch').length;
  return `${tools.length.toLocaleString()} tool calls across ${sessions.size.toLocaleString()} runs before this result was created, including ${searches.toLocaleString()} searches and ${fetches.toLocaleString()} fetches. Workflow activity is observable history; declared evidence relationships remain separate.`;
}

function stringAttribute(node: ExecutionProvenanceNode, key: string): string {
  const value = node.attributes[key];
  return typeof value === 'string' ? value : '';
}
