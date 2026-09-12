import type {
  AsyncProcess,
  ExecutionProvenanceResult,
  Message,
  SessionDiff,
  WorkspaceResource,
} from '@clio/core/v3';
import { formatBytes } from '@/lib/format';

/** One labelled fact rendered as its own sibling element — never middot-joined into a string. */
interface EvidenceSourceDetailPart {
  id: string;
  text: string;
  title?: string;
}

export interface EvidenceSource {
  id: string;
  label: string;
  link: boolean;
  /** The link href for a citation, or the raw value for a workflow-derived source. */
  value?: string;
  /** Structured detail for a resource source, rendered as separate spans. */
  detailParts?: readonly EvidenceSourceDetailPart[];
  /** Identity used to collapse duplicates — never the rendered text, so a formatting change
   *  can't change what dedups. */
  dedupeKey: string;
  resource?: WorkspaceResource;
  ownerLabel?: string;
  relation?: string;
}
/**
 * Typed execution-provenance ownership for artifacts: the `generated` edges
 * `sessionSources` deliberately excludes from the Sources section (an
 * artifact already has its own Artifacts section) are the same edges that
 * answer "who produced this artifact" here.
 */
export function artifactOwnerLabels(provenance: ExecutionProvenanceResult | undefined): Map<string, string> {
  const labels = new Map<string, string>();
  if (!provenance) return labels;
  const nodeById = new Map(provenance.nodes.map((node) => [node.id, node]));
  const lineageBySession = new Map(
    provenance.session_lineage?.map((owner) => [owner.session_id, owner]) ?? [],
  );
  for (const node of provenance.nodes) {
    if (node.kind !== 'artifact') continue;
    const artifactId = stringAttribute(node.attributes, 'artifact_id');
    if (!artifactId) continue;
    const relation = provenance.edges.find(
      (edge) => edge.target === node.id && edge.kind === 'generated',
    );
    if (!relation) continue;
    const ownerNode = nodeById.get(relation.source);
    const ownerSessionId =
      stringAttribute(ownerNode?.attributes, 'owner_session_id') ||
      ownerNode?.session_id ||
      stringAttribute(node.attributes, 'owner_session_id') ||
      node.session_id;
    const owner = lineageBySession.get(ownerSessionId);
    const label = ownerNode?.label || owner?.label;
    if (label) labels.set(artifactId, label);
  }
  return labels;
}
export function sessionSources(
  messages: readonly Message[],
  processes: readonly AsyncProcess[],
  resources: readonly WorkspaceResource[],
  executionProvenance?: ExecutionProvenanceResult,
): EvidenceSource[] {
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  const sources: EvidenceSource[] = messages.flatMap((message) =>
    message.blocks.flatMap((block): EvidenceSource[] => {
      if (block.type === 'citation') {
        return [
          {
            id: `citation:${message.id}:${block.id}`,
            label: block.label,
            value: block.uri,
            link: isWebLink(block.uri),
            dedupeKey: `citation:${block.uri}`,
          },
        ];
      }
      if (block.type !== 'resource') return [];
      const resource = resourcesById.get(block.resource_id);
      return [
        {
          id: `resource:${block.workspace_id}:${block.resource_id}:${block.resource_revision}`,
          label: resource?.name ?? block.name,
          link: false,
          detailParts: resourceEvidenceDetail(resource, block.media_type, block.resource_revision),
          // Keyed on resource identity, never the rendered string: two distinct resources can
          // render identical detail text, and a formatting change must not change what collapses.
          dedupeKey: `resource:${block.resource_id}:${block.resource_revision}`,
          resource,
        },
      ];
    }),
  );
  // An empty session_lineage ([]) is a legal "no children" answer, not a
  // missing provenance read — it must still fall back to workflow-state
  // sources, or a leaf session with no delegated children loses them all.
  if (executionProvenance?.session_lineage?.length) {
    sources.push(...provenanceSources(executionProvenance));
  } else {
    for (const process of processes) {
      collectWorkflowSources(process.result?.workflow_state, process.title, sources);
    }
  }
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.dedupeKey)) return false;
    seen.add(source.dedupeKey);
    return true;
  });
}

function provenanceSources(provenance: ExecutionProvenanceResult): EvidenceSource[] {
  const nodeById = new Map(provenance.nodes.map((node) => [node.id, node]));
  const lineageBySession = new Map(
    provenance.session_lineage?.map((owner) => [owner.session_id, owner]) ?? [],
  );
  const sources: EvidenceSource[] = [];
  for (const node of provenance.nodes) {
    const relation = provenance.edges.find(
      (edge) => edge.target === node.id && ['used', 'generated'].includes(edge.kind),
    );
    if (!relation) continue;
    const isTypedSource =
      node.kind === 'resource' || (node.kind === 'artifact' && relation.kind === 'used');
    if (!isTypedSource) continue;
    const ownerNode = nodeById.get(relation.source);
    const ownerSessionId =
      stringAttribute(ownerNode?.attributes, 'owner_session_id') ||
      ownerNode?.session_id ||
      stringAttribute(node.attributes, 'owner_session_id') ||
      node.session_id;
    const owner = lineageBySession.get(ownerSessionId);
    const value =
      firstStringAttribute(node.attributes, [
        'uri',
        'url',
        'resource_id',
        'artifact_id',
        'sha256',
      ]) || node.id;
    sources.push({
      id: `provenance:${node.id}`,
      label: node.label || value,
      value,
      link: isWebLink(value),
      dedupeKey: `provenance:${node.id}`,
      ownerLabel: ownerNode?.label || owner?.label || 'Unknown session',
      relation: relation.kind,
    });
  }
  return sources;
}

function stringAttribute(attributes: Record<string, unknown> | undefined, key: string): string {
  const value = attributes?.[key];
  return typeof value === 'string' ? value : '';
}

function firstStringAttribute(
  attributes: Record<string, unknown>,
  keys: readonly string[],
): string {
  for (const key of keys) {
    const value = stringAttribute(attributes, key);
    if (value) return value;
  }
  return '';
}

/**
 * Builds the resource detail parts for one source, favoring what was actually DELIVERED
 * (the message block's own media type and revision) over the live workspace resource, which
 * may have since changed. The live resource only fills in fields the block never carries
 * (size, SHA-256) and, when its revision has moved on, that is called out explicitly rather
 * than silently replacing the delivered revision.
 */
function resourceEvidenceDetail(
  resource: WorkspaceResource | undefined,
  deliveredMediaType: string,
  deliveredRevision: string,
): EvidenceSourceDetailPart[] {
  const mediaType = deliveredMediaType || resource?.detected_mime || resource?.claimed_mime;
  const parts: EvidenceSourceDetailPart[] = [
    { id: 'type', text: mediaType || 'Unknown type' },
    { id: 'revision', text: `Revision ${deliveredRevision}` },
  ];
  if (resource && String(resource.revision) !== deliveredRevision) {
    parts.push({
      id: 'current-revision',
      text: `Current revision ${resource.revision}`,
      title:
        'The workspace resource has since changed; this reference delivered an earlier revision to the model.',
    });
  }
  if (resource?.received_size !== undefined) {
    parts.push({ id: 'size', text: formatBytes(resource.received_size) });
  }
  if (resource?.sha256) {
    parts.push({ id: 'sha', text: `SHA-256 ${resource.sha256.slice(0, 12)}…` });
  }
  return parts;
}

function collectWorkflowSources(
  value: unknown,
  owner: string,
  sources: EvidenceSource[],
  path: string[] = [],
  depth = 0,
) {
  if (!value || depth > 5) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectWorkflowSources(item, owner, sources, [...path, String(index)], depth + 1),
    );
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = [...path, key];
    if (
      typeof child === 'string' &&
      child.length <= 2_048 &&
      (isWebLink(child) || /(?:^|_)(?:source|provenance)(?:_url)?$/iu.test(key))
    ) {
      sources.push({
        id: `workflow:${owner}:${nextPath.join('.')}:${sources.length}`,
        label: `${owner}, ${evidenceFieldLabel(key)}`,
        value: child,
        link: isWebLink(child),
        dedupeKey: `workflow:${child}`,
      });
    } else {
      collectWorkflowSources(child, owner, sources, nextPath, depth + 1);
    }
  }
}

export function diffStatus(diff: SessionDiff): 'pending' | 'succeeded' | 'cancelled' | 'unavailable' {
  if (diff.applied || diff.status === 'applied') return 'succeeded';
  if (diff.status === 'rejected') return 'cancelled';
  if (diff.status === 'pending') return 'pending';
  return 'unavailable';
}

export function friendlyStatus(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

function evidenceFieldLabel(value: string): string {
  return value
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .trim()
    .split(/\s+/u)
    .map((word, index) => {
      if (word.toLowerCase() === 'url') return 'URL';
      const normalized = word.toLowerCase();
      return index === 0 ? normalized.charAt(0).toUpperCase() + normalized.slice(1) : normalized;
    })
    .join(' ');
}

export function sourceDisplayValue(value: string): string {
  if (value.toLowerCase() === 'osm_nominatim') return 'OpenStreetMap Nominatim';
  return value;
}

function isWebLink(value: string): boolean {
  return /^https?:\/\//iu.test(value);
}
