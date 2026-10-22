import type { PendingInteraction } from '@clio/core/v3';
import { vocab } from './brand-vocabulary';

/** The tool whose permission asks to trust a flow's plugin before running it. */
export const RUN_FLOW_TOOL = 'run_flow';

/**
 * A permission to run a flow from a plugin that is not trusted yet: what the
 * card names (the flow, who wrote it, its file) and where its review is read.
 */
export interface FlowTrustRequest {
  flow: string;
  plugin: string;
  version: string;
  /** The plugin's author: the agent's own name, or a marketplace's. */
  author: string;
  authoredByAgent: boolean;
  /** The flow's file inside the plugin, relative to the plugin's folder. */
  file: string;
  /** `GET` address of the plugin's review; empty when the server named none. */
  reviewUrl: string;
}

/** The flow-trust request a permission carries, or `undefined` for any other permission. */
export function flowTrustRequest(interaction: PendingInteraction): FlowTrustRequest | undefined {
  if (interaction.kind !== 'permission') return undefined;
  const call = interaction.payload?.tool_call;
  if ((call?.tool_name ?? interaction.source.tool_name) !== RUN_FLOW_TOOL) return undefined;
  const input =
    call?.input && typeof call.input === 'object' && !Array.isArray(call.input)
      ? (call.input as Record<string, unknown>)
      : {};
  const text = (key: string) => (typeof input[key] === 'string' ? (input[key] as string) : '');
  const plugin = text('plugin').trim();
  if (!plugin) return undefined;
  return {
    flow: text('flow').trim() || plugin,
    plugin,
    version: text('version'),
    author: text('author').trim(),
    authoredByAgent: input['authored_by_clio'] === true,
    file: text('file').trim(),
    reviewUrl: text('review_url').trim(),
  };
}

/** Who wrote a flow's plugin, in words. */
export function flowTrustAuthor(request: FlowTrustRequest): string {
  if (request.authoredByAgent) return `Authored by ${vocab.agent}`;
  return request.author ? `From ${request.author}` : 'From an unknown source';
}

/** The last segment of a plugin-relative path (`flows/debate.py` -> `debate.py`). */
export function fileName(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? path;
}

/** What a plugin's code does by itself, in plain words. */
export function pluginReachLabel(reach: string): string {
  switch (reach) {
    case 'files':
      return 'Reads or writes files directly';
    case 'network':
      return 'Uses the network directly';
    case 'commands':
      return 'Runs commands';
    case 'dynamic code':
      return "Builds and runs code at run time, so its behaviour can't be read from the code alone";
    default:
      return `Reaches something this version cannot name (${reach})`;
  }
}
