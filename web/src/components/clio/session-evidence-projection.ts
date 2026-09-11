import type {
  Artifact,
  ContextFile,
  ExecutionProvenanceResult,
  Message,
  PendingInteraction,
  SessionDiff,
  ToolInvocation,
} from '@clio/core/v3';

export interface EvidenceFile {
  id: string;
  path: string;
  displayPath: string;
  facts: string[];
  size?: number;
}

export interface EvidencePlan {
  id: string;
  title: string;
  detail?: string;
  path?: string;
  artifact?: Artifact;
}

export function sessionFiles(
  contextFiles: readonly ContextFile[],
  tools: readonly ToolInvocation[],
  executionProvenance?: ExecutionProvenanceResult,
): EvidenceFile[] {
  const files = new Map<string, EvidenceFile>();
  const add = (path: string, displayPath: string, fact: string, size?: number) => {
    const key = normalizedFilePath(path);
    const current = files.get(key);
    if (current) {
      if (!current.facts.includes(fact)) current.facts.push(fact);
      if (size !== undefined) current.size = size;
      return;
    }
    files.set(key, {
      id: key,
      path,
      displayPath: displayPath || fileName(path),
      facts: [fact],
      size,
    });
  };
  for (const file of contextFiles) {
    add(
      file.path,
      file.display_path,
      file.mode === 'pin'
        ? 'Pinned to context'
        : file.mode === 'edit'
          ? 'Attached for editing'
          : 'Attached for reading',
      file.size,
    );
  }
  for (const tool of tools) {
    if (tool.state !== 'succeeded' || !tool.presentation) continue;
    const action = tool.presentation.action?.toLocaleLowerCase() ?? '';
    const fact = action.includes('read')
      ? 'Read by agent'
      : action.includes('propose')
        ? 'Proposed by agent'
        : action.includes('write') || action.includes('edit') || action.includes('patch')
          ? 'Written by agent'
          : undefined;
    if (!fact) continue;
    const size = presentationByteCount(tool.presentation.summary) ?? outputByteCount(tool.output);
    for (const block of tool.presentation.blocks) {
      if (block.type !== 'link' || block.target !== 'file') continue;
      const path = block.uri || block.label || '';
      if (path) add(path, block.label || fileName(path), fact, size);
    }
  }
  if (executionProvenance) {
    const ownerBySession = new Map(
      executionProvenance.session_lineage?.map((owner) => [owner.session_id, owner.label]) ?? [],
    );
    for (const node of executionProvenance.nodes) {
      if (node.kind !== 'tool' || node.status !== 'completed') continue;
      const toolName = stringAttribute(node.attributes, 'tool_name');
      const fact = provenanceFileFact(toolName);
      const toolInput = objectAttribute(node.attributes, 'tool_input');
      const path = stringAttribute(toolInput, 'filepath');
      if (!fact || !path) continue;
      const ownerSessionId =
        stringAttribute(node.attributes, 'owner_session_id') || node.session_id;
      const ownerLabel = ownerBySession.get(ownerSessionId);
      add(
        path,
        fileName(path),
        ownerSessionId === executionProvenance.session_id || !ownerLabel
          ? `${fact} by agent`
          : `${fact} by ${ownerLabel}`,
      );
    }
  }
  return [...files.values()];
}

export function provenanceFileFact(
  toolName: string,
): 'Read' | 'Proposed' | 'Written' | undefined {
  if (toolName === 'fs_read_file') return 'Read';
  if (toolName === 'fs_propose_edit') return 'Proposed';
  if (toolName === 'fs_apply_edit_write') return 'Written';
  return undefined;
}

function objectAttribute(
  attributes: Record<string, unknown> | undefined,
  key: string,
): Record<string, unknown> | undefined {
  const value = attributes?.[key];
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringAttribute(attributes: Record<string, unknown> | undefined, key: string): string {
  const value = attributes?.[key];
  return typeof value === 'string' ? value : '';
}

export function sessionDiffs(
  authoritativeDiffs: readonly SessionDiff[],
  tools: readonly ToolInvocation[],
): SessionDiff[] {
  const diffs = new Map(
    authoritativeDiffs.map((diff) => [normalizedFilePath(diff.path), diff] as const),
  );
  for (const tool of tools) {
    if (tool.state !== 'succeeded' || !tool.presentation) continue;
    const link = tool.presentation.blocks.find(
      (block) => block.type === 'link' && block.target === 'file',
    );
    const path = link?.uri || link?.label || '';
    if (!path) continue;
    const action = tool.presentation.action ?? '';
    const directWrite = !/propose/iu.test(action) && /(?:write|edit|patch|apply)/iu.test(action);
    for (const block of tool.presentation.blocks) {
      if (block.type !== 'diff' || !block.text) continue;
      const key = normalizedFilePath(path);
      const existing = diffs.get(key);
      // The pending-diff ledger is the current review state for any path it
      // reports. Transcript blocks are historical evidence and must not replay
      // an older proposal over an applied, rejected, or newer pending record.
      if (existing) continue;
      diffs.set(key, {
        path,
        status: directWrite ? 'applied' : 'pending',
        applied: directWrite,
        unified_diff: block.text,
        part_id: `${tool.id}:${block.id}`,
      });
    }
  }
  return [...diffs.values()];
}

export function sessionPlans(
  messages: readonly Message[],
  interactions: readonly PendingInteraction[],
  artifacts: readonly Artifact[],
): EvidencePlan[] {
  const plans = new Map<string, EvidencePlan>();
  for (const message of messages) {
    for (const block of message.blocks) {
      if (block.type !== 'plan') continue;
      plans.set(`message:${message.id}:${block.id}`, {
        id: `message:${message.id}:${block.id}`,
        title: block.title,
        detail: block.detail,
      });
    }
  }
  for (const interaction of interactions) {
    const review = interaction.payload?.plan_exit;
    if (!review) continue;
    const artifact = artifacts.find(
      (candidate) => candidate.id === review.artifact_ref?.artifact_id,
    );
    const key = review.plan_file
      ? normalizedFilePath(review.plan_file)
      : `interaction:${interaction.id}`;
    plans.set(key, {
      id: key,
      title:
        markdownTitle(review.plan_content) ||
        artifact?.name ||
        (review.plan_file ? fileName(review.plan_file) : interaction.title),
      detail: review.summary,
      path: review.plan_file,
      artifact,
    });
  }
  for (const artifact of artifacts) {
    if (!/^plan[-_]/iu.test(artifact.name)) continue;
    const key = normalizedFilePath(artifact.name);
    if ([...plans.values()].some((plan) => plan.artifact?.id === artifact.id)) continue;
    plans.set(key, { id: key, title: artifact.name, artifact });
  }
  return [...plans.values()];
}

export function fileName(path: string): string {
  return path.replaceAll('\\', '/').split('/').at(-1) || path;
}

function normalizedFilePath(path: string): string {
  return path.replaceAll('\\', '/').toLocaleLowerCase();
}

function presentationByteCount(summary: string): number | undefined {
  const match = /(?:^|\s)([\d,]+)\s+bytes?$/iu.exec(summary.trim());
  if (!match) return undefined;
  const size = Number(match[1].replaceAll(',', ''));
  return Number.isSafeInteger(size) && size >= 0 ? size : undefined;
}

function outputByteCount(value: unknown, depth = 0): number | undefined {
  if (!value || typeof value !== 'object' || depth > 3) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ['size_bytes', 'bytes_written', 'size']) {
    const candidate = record[key];
    if (typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate >= 0) {
      return candidate;
    }
  }
  for (const key of ['structuredContent', 'structured_content', 'result']) {
    const candidate = outputByteCount(record[key], depth + 1);
    if (candidate !== undefined) return candidate;
  }
  return undefined;
}

function markdownTitle(content?: string): string | undefined {
  const title = /^#\s+(.+)$/mu.exec(content ?? '')?.[1].trim();
  return title ? title.replaceAll('`', '') : undefined;
}
