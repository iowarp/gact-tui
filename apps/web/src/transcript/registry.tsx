import type { ReactNode } from 'react';
import { Chip, Icon, KvGrid } from '../kit';
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
 * A tool result's `content` is a LIST OF PARTS on the wire, never a string.
 *
 * Passing it to shortScalar hit its isRecord branch and rendered the literal
 * word "recorded" for every live tool result. The e2e mock had been shaped
 * with `content: 'staged 1,101 rows'`, so nothing caught it until the mock was
 * corrected to the observed shape.
 */
function toolResultText(part: Record<string, unknown>): string {
  const content = part['content'];
  if (Array.isArray(content)) {
    const text = content
      .map((child) => (child && typeof child === 'object' ? str((child as Record<string, unknown>)['text']) : str(child)))
      .filter((chunk) => chunk.length > 0)
      .join('\n');
    if (text) return shortScalar(text);
    // Content present but carrying no text: say so rather than render blank.
    return content.length > 0 ? `${content.length} non-text result part(s)` : '';
  }
  return shortScalar(content ?? part['text']);
}

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
    gutter: <Icon name="tool" />,
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
    gutter: <Icon name="tool" />,
    render: (part) => {
      const isError = part['is_error'] === true;
      return (
        <div className="part-tool" data-error={isError ? 'true' : undefined}>
          <span className="part-tool__name">{isError ? 'tool failed' : 'tool result'}</span>
          <p className="part-toolresult">{toolResultText(part)}</p>
        </div>
      );
    },
  },

  expert_handoff: {
    gutter: <HandoffGlyph />,
    render: (part) => <HandoffPart part={part} />,
  },

  subagent_call: {
    gutter: <HandoffGlyph />,
    render: (part) => <HandoffPart part={part} />,
  },

  subagent_result: {
    gutter: <HandoffGlyph />,
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

/** The handoff wrench sits in the ACCENT colour, unlike the muted tool glyph. */
function HandoffGlyph() {
  return (
    <span className="part-handoff__glyph">
      <Icon name="tool" />
    </span>
  );
}

