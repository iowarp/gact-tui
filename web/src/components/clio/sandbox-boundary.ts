import type { ToolInvocation } from '@clio/core/v3';
import { operationInput } from './tool-operation-data';

/**
 * A tool result's sandbox diagnosis (`boundary`, #1905): set by the server when a
 * confined command or script failed at CLIO's sandbox boundary. Shell results arrive
 * inside task envelopes and text copies, so the field is searched for, not addressed.
 */
export interface SandboxBoundary {
  kind: 'write_denied' | 'elevation_required' | string;
  confidence: 'confirmed' | 'possible' | string;
  mechanism?: string;
  paths: string[];
  request_roots: string[];
  message: string;
  /** The script or program the blocked call ran, read from the call's command. */
  program?: string;
}

function asBoundary(value: unknown): SandboxBoundary | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.kind !== 'string' || typeof row.message !== 'string') return undefined;
  const strings = (items: unknown) =>
    Array.isArray(items) ? items.filter((item): item is string => typeof item === 'string') : [];
  return {
    kind: row.kind,
    confidence: typeof row.confidence === 'string' ? row.confidence : 'possible',
    mechanism: typeof row.mechanism === 'string' ? row.mechanism : undefined,
    paths: strings(row.paths),
    request_roots: strings(row.request_roots),
    message: row.message,
  };
}

/** The first `boundary` object in a tool's output, looking through envelopes and JSON text. */
export function sandboxBoundary(output: unknown, depth = 0): SandboxBoundary | undefined {
  if (depth > 8 || output == null) return undefined;
  if (typeof output === 'string') {
    if (!output.includes('"boundary"')) return undefined;
    try {
      return sandboxBoundary(JSON.parse(output), depth + 1);
    } catch {
      return undefined; // text that only mentions the word
    }
  }
  if (Array.isArray(output)) {
    for (const item of output) {
      const found = sandboxBoundary(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof output !== 'object') return undefined;
  const row = output as Record<string, unknown>;
  const direct = asBoundary(row.boundary);
  if (direct) return direct;
  for (const value of Object.values(row)) {
    const found = sandboxBoundary(value, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** The script a shell command ran (`python qc_sites.py` ? qc_sites.py), else its program. */
export function blockedProgram(command: unknown): string | undefined {
  if (typeof command !== 'string') return undefined;
  const words = command
    .trim()
    .split(/\s+/u)
    .filter((word) => word && !word.startsWith('-'));
  const script = words.find((word, index) => index > 0 && /\.[a-z0-9]{1,5}$/iu.test(word));
  return (script ?? words[0])?.split(/[\\/]/u).pop() || undefined;
}

/** A call's sandbox boundary, naming what the call ran. */
export function toolSandboxBoundary(tool: ToolInvocation | undefined): SandboxBoundary | undefined {
  const boundary = sandboxBoundary(tool?.output);
  if (!boundary || !tool) return boundary;
  const program = blockedProgram(operationInput(tool).command);
  return program ? { ...boundary, program } : boundary;
}
