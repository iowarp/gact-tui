import type { Artifact } from '@clio/core/v3';
import { plural } from '@lingui/core/macro';

/**
 * A scientific document (a paper): one artifact the server builds from a project's source
 * files. It is shown by its title, with its type, venue and pages, and opens as the LaTeX
 * workspace. Its members are the exact source versions it was built from; they are shown
 * inside the paper, not beside it.
 */
export function isScientificDocument(artifact: Artifact): boolean {
  return artifact.producer?.['designation'] === 'scientific-document';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** The paper's title, or its record name when the source sets no `\title`. */
export function paperTitle(artifact: Artifact): string {
  return text(artifact.producer?.['title']) || artifact.name;
}

/** What the card says a paper is: its type, its venue and its pages. */
export function paperLabels(artifact: Artifact): { type: string; venue: string; pages: string } {
  const producer = artifact.producer ?? {};
  const count = producer['page_count'];
  const pages =
    typeof count === 'number' && count > 0
      ? plural(count, { one: '# page', other: '# pages' })
      : '';
  return {
    type: text(producer['document_type']) || 'Paper',
    venue: text(producer['venue']),
    pages,
  };
}

/** The artifact ids of the source versions the papers in `artifacts` were built from. */
export function paperMemberIds(artifacts: readonly Artifact[]): Set<string> {
  const ids = new Set<string>();
  for (const artifact of artifacts) {
    if (!isScientificDocument(artifact)) continue;
    const members = artifact.producer?.['members'];
    if (!Array.isArray(members)) continue;
    for (const member of members) {
      // The reply's link carries member ids; the session listing carries member records.
      const id =
        typeof member === 'string'
          ? member
          : member && typeof member === 'object'
            ? text((member as Record<string, unknown>)['artifact_id'])
            : '';
      if (id) ids.add(id);
    }
  }
  return ids;
}

/** The workspace files (`workspace\u0000name`) the papers in `artifacts` were built from. */
function paperMemberFiles(artifacts: readonly Artifact[]): Set<string> {
  const files = new Set<string>();
  for (const artifact of artifacts) {
    if (!isScientificDocument(artifact)) continue;
    const members = artifact.producer?.['members'];
    if (!Array.isArray(members)) continue;
    for (const member of members) {
      if (!member || typeof member !== 'object') continue;
      const name = text((member as Record<string, unknown>)['name']);
      if (name) files.add(`${artifact.workspace_id ?? ''}\u0000${name}`);
    }
  }
  return files;
}

/**
 * `artifacts` without the sources a listed paper bundles: they are shown inside it. A
 * source is matched by its version, or by its file when the paper names it, so an earlier
 * version of a bundled section is inside the paper too.
 */
export function withoutPaperMembers(artifacts: readonly Artifact[]): Artifact[] {
  const ids = paperMemberIds(artifacts);
  const files = paperMemberFiles(artifacts);
  if (!ids.size && !files.size) return [...artifacts];
  return artifacts.filter(
    (artifact) =>
      !ids.has(artifact.id) && !files.has(`${artifact.workspace_id ?? ''}\u0000${artifact.name}`),
  );
}
