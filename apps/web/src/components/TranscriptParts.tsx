/**
 * Dispatches each message Part to its concrete part-view component and orders
 * the parts for display within a transcript message.
 */
import type {
  FileDiff,
  Part,
  PartAgentQuestion,
  PartCitation,
  PartCompaction,
  PartDocument,
  PartError,
  PartRedactedThinking,
  PartResource,
  PartResourceLink,
  PartRetryAttempt,
  PartSubagentCall,
  PartSubagentResult,
  PartUnknown,
} from '@clio/core';
import type { JSX } from 'solid-js';
import { ThinkingPartView } from './TranscriptPartViews.js';
import { FileDiffPartView } from './TranscriptFileDiffPartView.js';
import { ImagePartView } from './TranscriptImagePartView.js';
import { ExpertHandoffPartView, RoutingDecisionPartView } from './TranscriptRoutingPartViews.js';
import { TextPartView } from './TranscriptTextPartView.js';
import { ToolCallPartView, ToolResultPartView } from './TranscriptToolParts.js';
import { DocumentPartView } from './TranscriptDocumentPartView.js';
import { SubagentCallPartView, SubagentResultPartView } from './TranscriptSubagentParts.js';
import { ResourceLinkPartView, ResourcePartView } from './TranscriptResourceParts.js';
import { CitationPartView } from './TranscriptCitationPartView.js';
import { AgentQuestionPartView } from './TranscriptAgentQuestionPartView.js';
import { RetryAttemptPartView } from './TranscriptRetryAttemptPartView.js';
import { TranscriptErrorPartView } from './TranscriptErrorPartView.js';
import { TranscriptCompactionPartView } from './TranscriptCompactionPartView.js';
import { TranscriptRedactedThinkingPartView } from './TranscriptRedactedThinkingPartView.js';
import { UnknownPartView } from './TranscriptUnknownPartView.js';
import { AssistantTurnView } from './AssistantTurnView.js';
import { buildTurnModelFromNodes } from './executionTurnModel.js';
import type { PartExecutionTree } from './executionProjectionModel.js';
import './transcript-new-parts.css';

export type TranscriptDensity = 'verbose' | 'normal' | 'summary';

export function shouldRenderPart(part: Part, density: TranscriptDensity): boolean {
  if (density === 'verbose') return true;
  if (density === 'summary') {
    // summary keeps the answer + diffs + images, plus the routing decision so
    // a read-back still shows which expert handled the turn and how it routed.
    // The hierarchical execution tree is the projected turn itself, so it must
    // survive summary density too (else the projected message renders empty).
    return (
      part.type === 'text' ||
      part.type === 'file_diff' ||
      part.type === 'image' ||
      part.type === 'routing_decision' ||
      (part.type as string) === 'execution_tree'
    );
  }
  // normal density: hide thinking; show routing_decision so the user
  // can see which expert handled the turn.
  return part.type !== 'thinking';
}

/** Props threaded from the message view into each per-type part renderer. */
export interface PartViewProps {
  part: Part;
  density: TranscriptDensity;
  onOpenDiff?: (diff: FileDiff) => void;
  onPinFile?: (path: string) => void;
  searchQuery?: string;
  messageId?: string;
  currentMatchKey?: string;
  matchBaseIndex?: number;
  showCursor?: boolean;
  imagePartsSupported?: boolean;
  /** Resolve a workspace file path to an inline image — used by the LIVE
   *  execution turn to render tool-artifact images (e.g. a plot output_path). */
  readWorkspaceImage?: (path: string) => Promise<{ url: string; mediaType: string } | null>;
}

/**
 * A per-type renderer: receives the narrowed part plus the full PartView props
 * (most parts only need `part`; a few — text/tool_call/tool_result/file_diff/
 * image/execution_tree — also read search/diff/density props from `props`).
 */
type PartRenderer = (part: Part, props: PartViewProps) => JSX.Element;

// Registry: part.type -> its concrete view. Replaces the former if-else chain.
// Each entry narrows `part` to the type implied by its key (the union is
// keyed on `.type`, so the cast is sound) and may read extra props.
// `execution_tree` is a synthetic part carrying the projected multi-agent
// execution nodes; it is not in the wire `Part` union, hence the dual cast.
const PART_RENDERERS: Record<string, PartRenderer> = {
  // LIVE execution turn (RENDERING_SPEC §9): the projected execution nodes are
  // converted to the SAME clean AssistantTurnModel the persisted path uses and
  // rendered through AssistantTurnView — flat, no boxes, depth-indented,
  // content-typed tool output, full model text. Live === post-reload.
  execution_tree: (p, props) => {
    const tree = p as unknown as PartExecutionTree;
    const model = buildTurnModelFromNodes(tree.nodes);
    if (!model) return <></>;
    return (
      <AssistantTurnView
        model={model}
        density={props.density}
        onOpenDiff={props.onOpenDiff}
        onPinFile={props.onPinFile}
        imagePartsSupported={props.imagePartsSupported}
        readWorkspaceImage={props.readWorkspaceImage}
        messageId={props.messageId}
      />
    );
  },
  text: (p, props) => (
    <TextPartView
      part={p as Extract<Part, { type: 'text' }>}
      searchQuery={props.searchQuery}
      messageId={props.messageId}
      matchBaseIndex={props.matchBaseIndex}
      currentMatchKey={props.currentMatchKey}
      showCursor={props.showCursor}
    />
  ),
  thinking: (p) => <ThinkingPartView part={p} />,
  tool_call: (p, props) => (
    <ToolCallPartView part={p as Extract<Part, { type: 'tool_call' }>} density={props.density} />
  ),
  tool_result: (p, props) => (
    <ToolResultPartView
      part={p as Extract<Part, { type: 'tool_result' }>}
      searchQuery={props.searchQuery}
    />
  ),
  file_diff: (p, props) => (
    <FileDiffPartView
      part={p as Extract<Part, { type: 'file_diff' }>}
      onOpenDiff={props.onOpenDiff}
      onPinFile={props.onPinFile}
    />
  ),
  // routing_decision — clio's chosen expert + rationale (TUI detail_view parity).
  routing_decision: (p) => <RoutingDecisionPartView part={p} />,
  // expert_handoff — clio delegated the turn to a sub-expert (emitted as a Part,
  // not a standalone event, so it must be rendered here or it's silently dropped).
  expert_handoff: (p) => <ExpertHandoffPartView part={p} />,
  // Inline image parts (1.0 item 2). base64/url render directly; backend file
  // references show an honest placeholder until fetched.
  image: (p, props) => <ImagePartView part={p} imagePartsSupported={props.imagePartsSupported} />,
  // document (SPEC §4.5) — a source the model may quote/cite.
  document: (p) => <DocumentPartView part={p as PartDocument} />,
  // subagent_call / subagent_result (SPEC §4.5) — clio delegated a sub-turn.
  subagent_call: (p) => <SubagentCallPartView part={p as PartSubagentCall} />,
  subagent_result: (p) => <SubagentResultPartView part={p as PartSubagentResult} />,
  // MCP resource reference / inline resource content (SPEC §4.5).
  resource_link: (p) => <ResourceLinkPartView part={p as PartResourceLink} />,
  resource: (p) => <ResourcePartView part={p as PartResource} />,
  // citation (SPEC §4.5) — a cited span backed by a source reference.
  citation: (p) => <CitationPartView part={p as PartCitation} />,
  // agent_question (SPEC §4.5) — inline ask-user prompt; links to the live
  // ask-user answer card (user-question-<id>).
  agent_question: (p) => <AgentQuestionPartView part={p as PartAgentQuestion} />,
  // retry_attempt (SPEC §4.5) — a retry boundary marker (attempt N/max + reason).
  retry_attempt: (p) => <RetryAttemptPartView part={p as PartRetryAttempt} />,
  // error (SPEC §4.5) — a turn-level failure (distinct from a tool-result error);
  // own danger card so the failure leaves a trace.
  error: (p) => <TranscriptErrorPartView part={p as PartError} />,
  // compaction (SPEC §4.5) — clio summarised earlier messages to reclaim budget.
  compaction: (p) => <TranscriptCompactionPartView part={p as PartCompaction} />,
  // redacted_thinking (SPEC §4.5) — provider-encrypted reasoning; show a compact
  // note, never the opaque `data` blob.
  redacted_thinking: (p) => (
    <TranscriptRedactedThinkingPartView part={p as PartRedactedThinking} />
  ),
};

export function PartView(props: PartViewProps) {
  const p = props.part;
  const render = PART_RENDERERS[p.type as string];
  if (render) return render(p, props);
  // FORWARD-COMPAT fallback (SPEC §2 / §8.3): any Part type this client does
  // not recognise is rendered as an honest "unsupported part" note rather than
  // dropped, so a newer backend's parts still leave a trace in the transcript.
  return <UnknownPartView part={p as unknown as PartUnknown} />;
}

export function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    n += 1;
    i += needle.length;
  }
  return n;
}
