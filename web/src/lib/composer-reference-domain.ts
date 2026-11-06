import type {
  ComposerMessagePart,
  SummonPart,
  SummonTargets,
  WorkspaceReference,
} from '@clio/core/v3';

export type ReferencePart = Exclude<
  ComposerMessagePart,
  { type: 'text' } | { type: 'comment_session' }
>;

/**
 * One reference the person put in a draft, and where it sits in the draft text.
 *
 * The offset is a plain-text character offset, so the inline editor can place
 * the token back at the same point in the prose after any re-render, and the
 * draft's owner can hold the selection across a composer remount.
 */
export interface InlineReferenceSelection {
  offset: number;
  reference: WorkspaceReference;
}

export function referenceIdentity(part: ReferencePart): string {
  if (part.type === 'summon') return `${part.target_kind}:${part.target}:`;
  return part.type === 'resource_ref'
    ? `resource:${part.resource_id}:${part.resource_revision}`
    : `${part.ref_kind}:${part.ref_id}:${part.revision ?? ''}`;
}

export function referenceLabel(part: ReferencePart): string {
  if (part.type === 'summon') return part.target;
  return part.type === 'resource_ref' ? part.name : part.label;
}

/** A subagent or MCP server the person can `@`-summon, as the popover lists it. */
export function isSummonReference(reference: { kind: string }): boolean {
  return reference.kind === 'subagent' || reference.kind === 'server';
}

/**
 * How a reference reads in the sent text, the way `@path` reads in a Claude Code
 * prompt: a workspace file by its path (with any `::/object` locator), anything
 * else by its label. The structured part still travels beside the text; the
 * mention keeps the reference where the person put it in the sentence.
 */
export function referenceMention(reference: { kind: string; id: string; label: string }): string {
  return `@${reference.kind === 'workspace_file' ? reference.id : reference.label}`;
}

/** The draft text with each selected reference written back in at its offset. */
export function withReferenceMentions(
  input: string,
  selections: readonly InlineReferenceSelection[],
): string {
  return [...selections]
    .sort((left, right) => right.offset - left.offset)
    .reduce((text, { offset, reference }) => {
      const at = Math.max(0, Math.min(offset, text.length));
      return `${text.slice(0, at)}${referenceMention(reference)}${text.slice(at)}`;
    }, input);
}

export function workspaceReferenceIdentity(reference: WorkspaceReference): string {
  return `${reference.kind}:${reference.id}:${reference.revision}`;
}

/**
 * How each reference kind is named to a reader.
 *
 * The wire names a reference by its protocol kind (`workspace_file`,
 * `evidence_source`). Those are internal vocabulary, so every surface that
 * shows a kind — the inline token, the transcript card, a refusal — reads it
 * through here rather than humanising the token on its own.
 */
const REFERENCE_KIND_LABELS: Record<string, string> = {
  agent_run: 'agent run',
  artifact: 'artifact',
  context_frame: 'context record',
  diff: 'changed file',
  evidence_source: 'source',
  plan: 'plan',
  resource: 'source',
  server: 'tools',
  session: 'conversation',
  subagent: 'agent',
  workspace_file: 'local file',
};

/** The reader-facing name for a reference kind, including one this build does not know. */
export function referenceKindLabel(kind: string): string {
  return REFERENCE_KIND_LABELS[kind] ?? kind.replaceAll('_', ' ');
}

export function toMessagePart(reference: WorkspaceReference): ReferencePart {
  if (reference.kind === 'unknown') {
    // Unreachable from the composer, which never offers a reference whose kind
    // this build has no wire mapping for. Explicit so a future caller gets a
    // refusal instead of an invalid ref_kind on the wire.
    throw new Error('This version cannot send a reference of an unrecognized kind.');
  }
  if (reference.kind === 'subagent' || reference.kind === 'server') {
    return { type: 'summon', target_kind: reference.kind, target: reference.id };
  }
  if (reference.kind === 'resource') {
    return {
      type: 'resource_ref',
      resource_id: reference.id,
      resource_revision: reference.revision,
      name: reference.label,
    };
  }
  return {
    type: 'context_ref',
    ref_kind: reference.kind,
    ref_id: reference.id,
    label: reference.label,
    revision: reference.revision || undefined,
  };
}

/** The session's summon targets as popover rows: Agents (subagents) and Tools (servers). */
export function summonReferences(targets?: SummonTargets): WorkspaceReference[] {
  if (!targets) return [];
  const row = (kind: 'subagent' | 'server', id: string, detail: string): WorkspaceReference => ({
    kind,
    id,
    label: id,
    detail,
    media_type: '',
    revision: '',
    navigation: {},
  });
  return [
    ...targets.subagents.map((agent) => row('subagent', agent.id, agent.description)),
    ...targets.servers.map((server) =>
      row(
        'server',
        server.name,
        [
          server.description,
          server.tools !== null
            ? `${server.tools} tool${server.tools === 1 ? '' : 's'}`
            : server.deferred
              ? 'tools load when used'
              : '',
        ]
          .filter(Boolean)
          .join(' — '),
      ),
    ),
  ];
}

const TYPED_MENTION = /(?:^|(?<=[\s([{"'“]))@([\w-]+)(?=$|[\s,;:!?)\]}"'”]|\.(?:\s|$))/gu;

/**
 * Summon parts for each `@name` the person typed in full, as its own word, that
 * exactly names one of the conversation's subagents or servers. Anything else
 * stays prose: `bob@example.org` is an address, `@explorer` names nobody.
 */
export function typedSummons(
  text: string,
  targets: SummonTargets | undefined,
  picked: readonly ReferencePart[],
): SummonPart[] {
  if (!targets) return [];
  const kinds = new Map<string, SummonPart['target_kind']>([
    ...targets.servers.map((server) => [server.name, 'server'] as const),
    ...targets.subagents.map((agent) => [agent.id, 'subagent'] as const),
  ]);
  const seen = new Set(
    picked.flatMap((part) =>
      part.type === 'summon' ? [`${part.target_kind}:${part.target}`] : [],
    ),
  );
  const found: SummonPart[] = [];
  for (const match of text.matchAll(TYPED_MENTION)) {
    const name = match[1] ?? '';
    const kind = kinds.get(name);
    if (!kind || seen.has(`${kind}:${name}`)) continue;
    seen.add(`${kind}:${name}`);
    found.push({ type: 'summon', target_kind: kind, target: name });
  }
  return found;
}
