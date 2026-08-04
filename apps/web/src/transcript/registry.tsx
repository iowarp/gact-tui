import { useState, type ReactNode } from 'react';
import { Icon } from '../kit';
import { HandoffPart } from './parts/HandoffPart';
import { extractToolResultText } from './parts/toolResultText';
import './parts/parts.css';

/** A wire part, before this build knows what kind it is. */
export type WirePart = { type: string } & Record<string, unknown>;

export interface PartRenderer {
  /** Glyph for the PartCard's 14px gutter. */
  gutter?: ReactNode;
  render: (part: WirePart) => ReactNode;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined ? '' : String(v));

function toolArgs(input: unknown): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '';
  return Object.entries(input)
    .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : (JSON.stringify(value) ?? String(value))}`)
    .join('\n');
}

function ThinkingDisclosure({ part }: { part: WirePart }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="part-collapsible">
      <button
        type="button"
        className="part-collapsible__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="part-thinkingdisclose" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span className="part-thinkinghead">thinking</span>
      </button>
      {open ? (
        <div className="part-collapsible__body">
          <p className="part-thinking">{str(part['thinking'] ?? part['text'])}</p>
        </div>
      ) : null}
    </div>
  );
}

export const PART_RENDERERS: Record<string, PartRenderer> = {
  text: {
    gutter: (
      <span className="part-textdot" aria-hidden="true">
        ●
      </span>
    ),
    render: (part) => <p className="part-text">{str(part['text'])}</p>,
  },

  thinking: {
    render: (part) => <ThinkingDisclosure part={part} />,
  },

  redacted_thinking: {
    render: () => <p className="part-muted">thinking (redacted by the provider)</p>,
  },

  // Reachable only if a `tool_call` somehow bypasses Transcript's pairing
  // (never dropped even so) — the normal path is the merged ToolPart.
  tool_call: {
    gutter: <WrenchGlyph />,
    render: (part) => {
      const args = toolArgs(part['input']);
      return (
        <div className="part-tool">
          <span className="part-tool__name">{str(part['tool_name'] ?? part['name'])}</span>
          {args ? <div className="part-tool__args">{args}</div> : null}
        </div>
      );
    },
  },

  // Reachable when a `tool_result` arrives with no matching preceding
  // `tool_call` in the same message — never dropped, just shown alone.
  tool_result: {
    gutter: <WrenchGlyph />,
    render: (part) => {
      const isError = part['is_error'] === true;
      return (
        <div className="part-tool" data-error={isError ? 'true' : undefined}>
          <span className="part-tool__name">{isError ? 'tool failed' : 'tool result'}</span>
          <pre className="part-toolresult">{extractToolResultText(part)}</pre>
        </div>
      );
    },
  },

  expert_handoff: {
    gutter: <WrenchGlyph />,
    render: (part) => <HandoffPart part={part} />,
  },

  subagent_call: {
    gutter: <WrenchGlyph />,
    render: (part) => <HandoffPart part={part} />,
  },

  subagent_result: {
    gutter: <WrenchGlyph />,
    render: (part) => <HandoffPart part={part} returned />,
  },

  routing_decision: {
    // The wire field is `selected_agent` (tool_observer.py:533). I had guessed
    // `expert`/`selected_expert`, which rendered a bare "routed to" with
    // nothing after it against a real backend.
    render: (part) => (
      <p className="part-muted" data-testid="part-routing">
        routed to <strong>{str(part['selected_agent'])}</strong>
        {part['rationale'] ? (
          <span className="part-routing__why"> — {str(part['rationale'])}</span>
        ) : null}
      </p>
    ),
  },

  // Reachable when a `resource_link` somehow bypasses Transcript's grouping
  // into an artifact grid — never dropped even so.
  resource_link: {
    render: (part) => (
      <a className="part-link" href={str(part['uri'])} target="_blank" rel="noreferrer">
        {str(part['name'] ?? part['uri'])}
      </a>
    ),
  },

  file_diff: {
    render: (part) => (
      <div className="part-tool">
        <span className="part-tool__name">{str(part['path'])}</span>
        <span className="part-muted">{str(part['status'])}</span>
      </div>
    ),
  },

  mcp_app: {
    // The backend emits this today, so it must render. The interactive host
    // (sandboxed ui:// iframe, tool bridge) is P3.1 / gact-tui#324 — until
    // then this names the app rather than letting an emitted kind fall through
    // to the unrenderable marker.
    render: (part) => (
      <div className="part-tool" data-testid="part-mcp-app">
        <span className="part-tool__name">{str(part['name'] ?? 'MCP App')}</span>
        <span className="part-muted">{str(part['uri'])}</span>
        <span className="part-muted">interactive rendering lands with #324</span>
      </div>
    ),
  },

  compaction: {
    render: (part) => (
      <p className="part-muted">
        context compacted{part['reason'] ? ` — ${str(part['reason'])}` : ''}
      </p>
    ),
  },

  background_exit: {
    gutter: <InjectionGlyph />,
    render: (part) => {
      const status = str(part['exit_status'] ?? part['live_state']);
      const placement = str(part['placement']);
      // A run that exited on a remote host is not the same event as one that
      // exited locally, so the host travels with the exit rather than being
      // dropped as decoration.
      const remote = placement.startsWith('relay:');
      const host = str(part['host']);
      return (
        <div className="part-inj" data-testid="part-background-exit" data-status={status}>
          <span className="part-inj__pill">
            exited{' '}
            <span className="part-inj__run">{str(part['run_label']) || str(part['child_agent'])}</span>
            {status ? (
              <>
                <span className="part-inj__sep">·</span>
                <span className="part-inj__status" data-error={status === 'failed' ? 'true' : undefined}>
                  {status}
                </span>
              </>
            ) : null}
            {remote && host ? (
              <>
                <span className="part-inj__sep">·</span>
                <span className="part-inj__host">{host}</span>
              </>
            ) : null}
          </span>
        </div>
      );
    },
  },

  agent_message: {
    gutter: <InjectionGlyph />,
    render: (part) => {
      const action = str(part['message_action']) || 'message';
      const status = str(part['status']);
      return (
        <div className="part-inj" data-testid="part-agent-message">
          <span className="part-inj__pill">
            {action}{' '}
            <span className="part-inj__run">{str(part['run_label']) || str(part['child_agent'])}</span>
            {status ? (
              <>
                <span className="part-inj__sep">·</span>
                <span className="part-inj__status">{status}</span>
              </>
            ) : null}
          </span>
          {part['text'] ? <p className="part-inj__text">{str(part['text'])}</p> : null}
        </div>
      );
    },
  },

  transcript_activity: {
    render: (part) => {
      const count = Number(part['count']);
      const noun = count === 1 ? 'agent' : 'agents';
      return (
        <p className="transcript__activity" data-testid="transcript-activity">
          <span className="transcript__activity-mark" aria-hidden="true">
            ✻
          </span>
          {` Waiting for ${count} background ${noun} to finish`}
        </p>
      );
    },
  },

  error: {
    render: (part) => (
      <p className="part-error" data-testid="part-error" role="alert">
        {str(part['message'] ?? part['error'])}
      </p>
    ),
  },
};

/** The handoff/tool wrench sits in the ACCENT colour, unlike the muted default gutter. */
export function WrenchGlyph() {
  return (
    <span className="part-handoff__glyph">
      <Icon name="wrench" size={11} />
    </span>
  );
}

/** The prototype's isInj marker (design/prototype/Clio Session.html) — a
 *  small red "●" for asynchronous injections into the transcript, regardless
 *  of whether the injected event itself is a success or a failure. */
function InjectionGlyph() {
  return (
    <span className="part-inj__glyph" aria-hidden="true">
      ●
    </span>
  );
}
