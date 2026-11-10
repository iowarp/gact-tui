import type { ToolInvocation } from '@clio/core/v3';
import type { ObservabilityActivityItem } from './observability-activity';
import { provenanceFileFact } from './session-evidence-projection';
import { toolOperationLabel } from './tool-presentation';
import { toolActivityName } from './workbench-activity-model';

/*
 * How a provenance span reads as one Activity row: its kind, its humane label
 * ("Read soil.csv", "Approved run script", "Created regrid.py v1") and the
 * transcript call it records, so the same action never appears twice.
 */

export function projectedKind(kind: string): ObservabilityActivityItem['kind'] {
  if (kind === 'artifact') return 'artifact';
  if (kind === 'resource') return 'resource';
  if (kind === 'interaction' || kind === 'interactive_work') return 'interaction';
  return 'tool';
}

export function projectedActivityDetail(kind: string): string | undefined {
  const detail =
    kind === 'tool'
      ? undefined
      : kind === 'artifact'
        ? 'Produced artifact'
        : kind === 'resource'
          ? 'Evidence source'
          : kind === 'interaction'
            ? 'Human interaction'
            : 'Interactive surface or MCP task';
  return detail;
}

export function projectedToolName(toolName: string | undefined, label: string): string | undefined {
  if (toolName) return toolName;
  return /^Tool\s+([^\s]+)\s+(?:started|completed|failed)\.?$/iu.exec(label)?.[1];
}

/** How far a provenance span's start may sit from its transcript call's start. */
const SPAN_MATCH_WINDOW_MS = 2_000;

/**
 * The transcript call a provenance span records, matched by owner, tool and
 * start time. Consuming a match keeps two same-named calls from pairing twice.
 */
export function spanToolMatcher(knownTools: readonly ToolInvocation[]) {
  const consumed = new Set<string>();
  return (sessionId: string, toolName: string, at: number | null, consume: boolean) => {
    if (at === null || !knownTools.length) return undefined;
    let best: ToolInvocation | undefined;
    let bestGap = SPAN_MATCH_WINDOW_MS;
    for (const tool of knownTools) {
      if (tool.name !== toolName || tool.session_id !== sessionId) continue;
      if (consume && consumed.has(tool.id)) continue;
      const gap = Math.abs(Date.parse(tool.started_at ?? '') - at * 1_000);
      if (gap <= bestGap) {
        best = tool;
        bestGap = gap;
      }
    }
    if (best && consume) consumed.add(best.id);
    return best;
  };
}

/** "Approved run command (sbatch …)": the decision and the action, never the request id. */
export function permissionActivityLabel(
  fallback: string,
  toolName: string | undefined,
  tool: ToolInvocation | undefined,
): string {
  const decision = /resolved:\s*([a-z_]+)/iu.exec(fallback)?.[1]?.toLocaleLowerCase();
  const verb =
    decision === 'allow' || decision === 'approve' || decision === 'approved'
      ? 'Approved'
      : decision === 'deny' || decision === 'denied' || decision === 'reject'
        ? 'Denied'
        : 'Answered';
  const action = tool ? toolActivityName(tool) : toolName ? toolOperationLabel(toolName) : '';
  if (!action) return `${verb} a permission request`;
  return `${verb} ${action.charAt(0).toLocaleLowerCase()}${action.slice(1)}`;
}

export function projectedActivityLabel(
  kind: string,
  toolName: string | undefined,
  fallback: string,
  attributes: Record<string, unknown>,
): string {
  if (kind !== 'tool' || !toolName) {
    // Recorder sentences ("Artifact regrid.py v1 created.") read as the action they record.
    const recorded = /^Artifact (.+?) (created|updated|deleted)\.?$/u.exec(fallback.trim());
    if (recorded) return `${recorded[2]![0]!.toUpperCase()}${recorded[2]!.slice(1)} ${recorded[1]}`;
    return fallback.trim().replace(/\.$/u, '');
  }
  const input = attributes.tool_input;
  const qualifier =
    input && typeof input === 'object'
      ? ['path', 'uri', 'resource_id', 'task_id']
          .map((key) => (input as Record<string, unknown>)[key])
          .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : undefined;
  const operation = provenanceFileFact(toolName) ?? toolOperationLabel(toolName);
  if (!qualifier) return operation;
  const compact = qualifier.split(/[\\/]/u).filter(Boolean).at(-1) ?? qualifier;
  return `${operation} ${compact}`;
}

export function projectedFilePath(
  toolName: string | undefined,
  attributes: Record<string, unknown>,
): string | undefined {
  // Only the file tools' `path` names a file; the listing and search tools' names a folder.
  if (!toolName || !provenanceFileFact(toolName)) return undefined;
  const input = attributes.tool_input;
  if (!input || typeof input !== 'object') return undefined;
  const value = (input as Record<string, unknown>).path;
  return typeof value === 'string' && value.trim() ? value : undefined;
}
