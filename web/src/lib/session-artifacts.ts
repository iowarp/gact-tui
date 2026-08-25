import type { Artifact, ArtifactRecord, SessionArtifactListing } from '@clio/core/v3';

/** Projects authoritative registry records into the normalized artifact shape used by the UI. */
export function sessionArtifactEntities(
  listing: SessionArtifactListing | undefined,
  transcriptArtifacts: readonly Artifact[],
  sessionId: string,
): Artifact[] {
  const artifacts = new Map<string, Artifact>();
  if (listing) {
    for (const record of listing.artifacts) {
      const artifact = artifactRecordHead(record, sessionId, 'produced');
      if (artifact) artifacts.set(recordKey(record), artifact);
    }
    for (const record of listing.used) {
      const key = recordKey(record);
      if (artifacts.has(key)) continue;
      const artifact = artifactRecordHead(record, sessionId, 'used');
      if (artifact) artifacts.set(key, artifact);
    }
  }
  for (const artifact of transcriptArtifacts) {
    const key = `${artifact.workspace_id ?? ''}:${artifact.name.toLocaleLowerCase()}`;
    if (!artifacts.has(key)) {
      artifacts.set(key, { ...artifact, session_relation: 'produced' });
    }
  }
  return [...artifacts.values()];
}

function artifactRecordHead(
  record: ArtifactRecord,
  sessionId: string,
  relation: 'produced' | 'used',
): Artifact | undefined {
  const version =
    record.versions.find((candidate) => candidate.artifact_id === record.head_artifact_id) ??
    record.versions.toSorted((left, right) => right.version - left.version)[0];
  if (!version) return undefined;
  return {
    id: version.artifact_id,
    session_id: sessionId,
    workspace_id: record.workspace_id,
    name: record.name,
    media_type: mediaTypeForArtifact(record.name, record.kind),
    uri: version.uri,
    fetch_path: version.fetch_url,
    custody: version.custody,
    sha256: version.sha256,
    size: version.size_bytes,
    created_at: version.created_at,
    session_relation: relation,
  };
}

function recordKey(record: ArtifactRecord): string {
  return `${record.workspace_id}:${record.name.toLocaleLowerCase()}`;
}

function mediaTypeForArtifact(name: string, kind: string): string {
  const extension = name.split('.').at(-1)?.toLocaleLowerCase();
  const byExtension: Record<string, string> = {
    avif: 'image/avif',
    csv: 'text/csv',
    gif: 'image/gif',
    geojson: 'application/geo+json',
    html: 'text/html',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    json: 'application/json',
    md: 'text/markdown',
    parquet: 'application/vnd.apache.parquet',
    pdf: 'application/pdf',
    png: 'image/png',
    svg: 'image/svg+xml',
    tsv: 'text/tab-separated-values',
    txt: 'text/plain',
    webp: 'image/webp',
    yaml: 'application/yaml',
    yml: 'application/yaml',
    zip: 'application/zip',
  };
  if (extension && byExtension[extension]) return byExtension[extension];
  if (kind === 'document') return 'text/plain';
  if (kind === 'plot' || kind === 'image') return 'image/png';
  return 'application/octet-stream';
}
