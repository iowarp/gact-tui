import type { ToolInvocation } from '@clio/core/v3';
import { t } from '@lingui/core/macro';
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
  // Agents through #2272 carry the refusal only as text: the error, the output or the
  // presentation's error block, depending on how the history reached the client.
  const texts = [
    tool.error,
    typeof tool.output === 'string' ? tool.output : undefined,
    ...(tool.presentation?.blocks ?? []).map((block) => block.text),
  ];
  const text = texts.find((value) => typeof value === 'string' && NOT_SHOWN_TEXT.test(value));
  if (!text) return undefined;
  return /already attached \d+|script(?:'s)? limit/iu.test(text) ? 'script_limit' : 'not_shown';
}

const NOT_SHOWN_TEXT = /NOT shown to the model/u;

/**
 * Whether a viewed file's pixels reached the model. The agent says so itself
 * (`attached_to_model` on the result, `status: "attached_to_model"` on its block);
 * a refused view fails with `<tool>_not_shown` or `<tool>_script_limit`. An agent
 * that predates those fields leaves it unconfirmed, never seen.
 */
export function imageReach(tool: ToolInvocation): ImageReach | undefined {
  if (!VIEWING_TOOLS.has(tool.name)) return undefined;
  const pdf = tool.name === 'view_pdf';
  if (tool.state === 'failed') {
    const reason = refusal(tool);
    if (!reason) return undefined;
    const limit = reason.endsWith('script_limit');
    return {
      state: 'not-shown',
      label: t`Not shown to the model`,
      detail: limit
        ? pdf
          ? t`The script had already attached as many files as one result may carry, so the model did not see this PDF.`
          : t`The script had already attached as many files as one result may carry, so the model did not see this image.`
        : pdf
          ? t`A background script has no model step to attach to, so the model did not see this PDF.`
          : t`A background script has no model step to attach to, so the model did not see this image.`,
    };
  }
  if (tool.state !== 'succeeded') return undefined;
  const result = toolResultRecord(tool.output) ?? asRecord(tool.output);
  const block = tool.presentation?.blocks.find((item) => item.status === SHOWN_TO_MODEL);
  if (block || result?.attached_to_model === true) {
    return {
      state: 'shown',
      label: t`Shown to the model`,
      detail:
        block?.detail?.trim() ||
        (result?.delivery === 'script_result'
          ? t`Shown to the model on its next step, with the run_code script’s result.`
          : t`Shown to the model on its next step, as this call’s result.`),
    };
  }
  return {
    state: 'unconfirmed',
    label: t`Not confirmed`,
    detail: tool.parent_call_id
      ? pdf
        ? t`This agent does not report whether the model saw the PDF. Agents without that report pass a script only the file’s description, not its pixels.`
        : t`This agent does not report whether the model saw the image. Agents without that report pass a script only the file’s description, not its pixels.`
      : pdf
        ? t`This agent does not report whether the model saw the PDF.`
        : t`This agent does not report whether the model saw the image.`,
  };
}

const REACH_WORDS: Record<ReachState, string> = {
  shown: t`shown to the model`,
  'not-shown': t`not shown to the model`,
  unconfirmed: t`not confirmed as seen`,
};

/** One phrase for several views: "shown to the model", or "1 of 4 shown to the model". */
export function reachSummary(reaches: readonly ImageReach[]): string | undefined {
  if (!reaches.length) return undefined;
  const states = new Set(reaches.map((reach) => reach.state));
  if (states.size === 1) return REACH_WORDS[reaches[0]!.state];
  const shown = reaches.filter((reach) => reach.state === 'shown').length;
  const total = reaches.length;
  if (shown) return t`${shown} of ${total} shown to the model`;
  const refused = reaches.filter((reach) => reach.state === 'not-shown').length;
  return t`${refused} of ${total} not shown to the model`;
}
