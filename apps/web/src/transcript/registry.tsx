import type { ReactNode } from 'react';
import { Chip, KvGrid } from '../kit';
import { toolInputRows } from '../wire/presentation';
import { shortScalar } from '../wire/presentationUtils';
import { CollapsiblePart } from './parts/CollapsiblePart';
import { HandoffPart } from './parts/HandoffPart';
import './parts/parts.css';

/** A wire part, before this build knows what kind it is. */
export type WirePart = { type: string } & Record<string, unknown>;

export interface PartRenderer {
  /** Glyph for the PartCard's 14px gutter. */
  gutter?: ReactNode;
  render: (part: WirePart) => ReactNode;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined ? '' : String(v));

/**
 * THE part-renderer registry.
 *
 * One kind, one renderer, one pipeline. The legacy tree's dual pipeline dies
 * with it. Anything not in this map is rendered by the unrenderable fallback,
 * which NAMES the kind rather than dropping it.
 *
 * P3 kinds (a2ui, permission, documents, Live Web) are deliberately absent —
 * the backend does not emit them yet, and a renderer for an unemitted kind is
 * untestable decoration.
 */
export const PART_RENDERERS: Record<string, PartRenderer> = {
  text: {
    gutter: <span className="part-gutter-dot" aria-hidden="true" />,
    render: (part) => <p className="part-text">{str(part['text'])}</p>,
  },

  thinking: {
    render: (part) => {
      const tokens = part['tokens'];
      const summary =
        typeof tokens === 'number' ? `thinking (${tokens} tokens)` : 'thinking';
      return (
        <CollapsiblePart summary={summary}>
          <p className="part-thinking">{str(part['thinking'] ?? part['text'])}</p>
        </CollapsiblePart>
      );
    },
  },

  redacted_thinking: {
    render: () => <p className="part-muted">thinking (redacted by the provider)</p>,
  },

  tool_call: {
    gutter: <ToolGlyph />,
    render: (part) => {
      const rows = toolInputRows(part['input'] as Record<string, unknown> | undefined);
      return (
        <div className="part-tool">
          <span className="part-tool__name">{str(part['name'])}</span>
          {rows.length > 0 ? (
            <KvGrid
              label={`${str(part['name'])} params`}
              rows={rows.map((r) => ({ key: r.label, value: r.value }))}
            />
          ) : null}
        </div>
      );
    },
  },

  tool_result: {
    gutter: <ToolGlyph />,
    render: (part) => {
      const isError = part['is_error'] === true;
      return (
        <div className="part-tool" data-error={isError ? 'true' : undefined}>
          <span className="part-tool__name">{isError ? 'tool failed' : 'tool result'}</span>
          <p className="part-toolresult">{shortScalar(part['content'] ?? part['text'])}</p>
        </div>
      );
    },
  },

  expert_handoff: {
    render: (part) => <HandoffPart part={part} />,
  },

  subagent_call: {
    render: (part) => <HandoffPart part={part} />,
  },

  subagent_result: {
    render: (part) => <HandoffPart part={part} returned />,
  },

  routing_decision: {
    render: (part) => (
      <p className="part-muted">
        routed to <strong>{str(part['expert'] ?? part['selected_expert'])}</strong>
      </p>
    ),
  },

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
    render: (part) => {
      const status = str(part['exit_status'] ?? part['live_state']);
      const placement = str(part['placement']);
      // A run that exited on a remote host is not the same event as one that
      // exited locally, so the host travels with the exit rather than being
      // dropped as decoration.
      const remote = placement.startsWith('relay:');
      return (
        <div className="part-runhandle" data-testid="part-background-exit" data-status={status}>
          <span className="part-runhandle__label">exited</span>
          <span className="part-runhandle__run">
            {str(part['run_label']) || str(part['child_agent'])}
          </span>
          <Chip tone={status === 'failed' ? 'error' : 'accent'}>{status}</Chip>
          {remote ? <Chip title={placement}>{str(part['host'])}</Chip> : null}
        </div>
      );
    },
  },

  agent_message: {
    render: (part) => (
      <div className="part-runhandle" data-testid="part-agent-message">
        <span className="part-runhandle__label">{str(part['message_action']) || 'message'}</span>
        <span className="part-runhandle__run">
          {str(part['run_label']) || str(part['child_agent'])}
        </span>
        {part['status'] ? <Chip>{str(part['status'])}</Chip> : null}
        {part['text'] ? <p className="part-runhandle__text">{str(part['text'])}</p> : null}
      </div>
    ),
  },

  error: {
    render: (part) => (
      <p className="part-error" data-testid="part-error" role="alert">
        {str(part['message'] ?? part['error'])}
      </p>
    ),
  },
};

function ToolGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M7.6 1.8a2.6 2.6 0 0 0 3 3.4L8.2 7.6 4.4 3.8 6.8 1.4a2.6 2.6 0 0 0 .8.4zM4 4.2 7.8 8l-2.6 2.6a1.3 1.3 0 0 1-1.8 0l-1-1a1.3 1.3 0 0 1 0-1.8z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
