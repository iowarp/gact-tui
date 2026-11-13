import type { ToolInvocation } from '@clio/core/v3';
import { asRecord, toolResultRecord } from './tool-result-shared';

/** An image a call returned as a workspace file (`clio.workspace_image.v1`). */
export interface WorkspaceImage {
  path: string;
  mediaType: string;
  sha256?: string;
  sizeBytes?: number;
}

function workspaceImage(value: unknown): WorkspaceImage | undefined {
  const row = asRecord(value);
  if (row?.type !== 'clio.workspace_image.v1' || typeof row.path !== 'string') return undefined;
  return {
    path: row.path,
    mediaType: typeof row.media_type === 'string' ? row.media_type : 'image/png',
    sha256: typeof row.sha256 === 'string' ? row.sha256 : undefined,
    sizeBytes: typeof row.size_bytes === 'number' ? row.size_bytes : undefined,
  };
}

/** The images a value describes, when it is nothing but image descriptors (one or a list). */
export function workspaceImages(value: unknown): WorkspaceImage[] | undefined {
  const items = Array.isArray(value) ? value : [value];
  const images = items.map(workspaceImage);
  return images.length && images.every(Boolean) ? (images as WorkspaceImage[]) : undefined;
}

/** The tools that look at a file for the model (clio-agent #2272). */
const VIEWING_TOOLS = new Set(['view_image', 'view_pdf', 'capture_a2ui_surface']);

/** A presentation block's `status` when the file's pixels reached the model. */
export const SHOWN_TO_MODEL = 'attached_to_model';

export type ReachState = 'shown' | 'not-shown' | 'unconfirmed';

export interface ImageReach {
  state: ReachState;
  /** The row's words: "Shown to the model", "Not shown to the model", "Not confirmed". */
  label: string;
  /** Why, in a sentence, for the hover and the opened row. */
  detail: string;
}

const NOT_SHOWN = /_(not_shown|script_limit)$/u;

/** The typed reason a view was refused, wherever the agent recorded it. */
function refusal(tool: ToolInvocation): string | undefined {
  const output = asRecord(tool.output);
  const result = toolResultRecord(tool.output);
  const candidates = [output, result, asRecord(output?.error), asRecord(result?.error)].flatMap(
    (row) => [row?.reason, row?.code, row?.error_code],
  );
  const code = candidates.find(
    (value): value is string => typeof value === 'string' && NOT_SHOWN.test(value),
  );
  if (code) return code;
  return /NOT shown to the model/u.test(tool.error ?? '') ? 'not_shown' : undefined;
}

/**
 * Whether a viewed file's pixels reached the model. The agent says so itself
 * (`attached_to_model` on the result, `status: "attached_to_model"` on its block);
 * a refused view fails with `<tool>_not_shown` or `<tool>_script_limit`. An agent
 * that predates those fields leaves it unconfirmed, never seen.
 */
export function imageReach(tool: ToolInvocation): ImageReach | undefined {
  if (!VIEWING_TOOLS.has(tool.name)) return undefined;
  const kind = tool.name === 'view_pdf' ? 'PDF' : 'image';
  if (tool.state === 'failed') {
    const reason = refusal(tool);
    if (!reason) return undefined;
    return {
      state: 'not-shown',
      label: 'Not shown to the model',
      detail: reason.endsWith('script_limit')
        ? `The script had already attached as many files as one result may carry, so the model did not see this ${kind}.`
        : `A background script has no model step to attach to, so the model did not see this ${kind}.`,
    };
  }
  if (tool.state !== 'succeeded') return undefined;
  const result = toolResultRecord(tool.output) ?? asRecord(tool.output);
  const block = tool.presentation?.blocks.find((item) => item.status === SHOWN_TO_MODEL);
  if (block || result?.attached_to_model === true) {
    const via =
      result?.delivery === 'script_result'
        ? 'with the run_code script’s result'
        : 'as this call’s result';
    return {
      state: 'shown',
      label: 'Shown to the model',
      detail: block?.detail?.trim() || `Shown to the model on its next step, ${via}.`,
    };
  }
  return {
    state: 'unconfirmed',
    label: 'Not confirmed',
    detail: tool.parent_call_id
      ? `This agent does not report whether the model saw the ${kind}. Agents without that report pass a script only the file’s description, not its pixels.`
      : `This agent does not report whether the model saw the ${kind}.`,
  };
}

const REACH_WORDS: Record<ReachState, string> = {
  shown: 'shown to the model',
  'not-shown': 'not shown to the model',
  unconfirmed: 'not confirmed as seen',
};

/** One phrase for several views: "shown to the model", or "1 of 4 shown to the model". */
export function reachSummary(reaches: readonly ImageReach[]): string | undefined {
  if (!reaches.length) return undefined;
  const states = new Set(reaches.map((reach) => reach.state));
  if (states.size === 1) return REACH_WORDS[reaches[0]!.state];
  const shown = reaches.filter((reach) => reach.state === 'shown').length;
  if (shown) return `${shown} of ${reaches.length} shown to the model`;
  const refused = reaches.filter((reach) => reach.state === 'not-shown').length;
  return `${refused} of ${reaches.length} not shown to the model`;
}
