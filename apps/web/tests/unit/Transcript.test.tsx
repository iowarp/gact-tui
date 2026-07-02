import { render, screen, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { Transcript } from '../../src/components/Transcript.js';
import type { Message } from '@clio/core';

afterEach(cleanup);

const messages: Message[] = [
  {
    id: 'm1',
    role: 'user',
    parts: [{ type: 'text', text: 'hello' }],
  },
  {
    id: 'm2',
    role: 'assistant',
    parts: [
      { type: 'thinking', text: 'pondering' },
      { type: 'tool_call', id: 'tc1', tool_name: 'ReadFile', input: { path: 'x' } },
      { type: 'text', text: 'done' },
    ],
  },
];

describe('Transcript', () => {
  it('renders a row per message', () => {
    render(() => <Transcript messages={messages} density="normal" />);
    expect(screen.getByTestId('msg-m1')).toBeTruthy();
    expect(screen.getByTestId('msg-m2')).toBeTruthy();
  });

  it('hides tool calls/results in summary mode (via CSS data-density)', () => {
    render(() => <Transcript messages={messages} density="summary" />);
    expect(screen.getByTestId('transcript').getAttribute('data-density')).toBe('summary');
  });

  it('renders the tool call through the unified tool row (name + args)', () => {
    // UNIFIED render: a tool_call becomes a ToolRow rendered by AssistantTurnView —
    // `name(args)` inline, not the retired flat per-arg verbose body. The tool name
    // and its argument value are both visible.
    render(() => <Transcript messages={messages} density="verbose" />);
    const tool = screen.getByTestId('assistant-turn-tool');
    expect(tool).toBeTruthy();
    expect(tool.textContent).toContain('ReadFile');
    expect(tool.textContent).toContain('x');
  });

  it('uses legacy assistant rendering only when no normalized transcript is present', () => {
    render(() => <Transcript messages={messages} density="normal" />);
    expect(screen.getByText('done')).toBeTruthy();
    expect(screen.queryByTestId('normalized-transcript-message')).toBeNull();
  });

  it('renders every turn through the unified parts path — no separate normalized render', () => {
    // UNIFIED: live and reload both render via MessageView/buildAssistantTurnModel.
    // The user turn and the assistant turn both show; there is no separate
    // normalized-transcript-message element (the normalized render is retired).
    render(() => <Transcript messages={messages} density="normal" />);
    expect(screen.getByText('hello')).toBeTruthy();
    expect(screen.getByText('done')).toBeTruthy();
    expect(screen.queryByTestId('normalized-transcript-message')).toBeNull();
  });

  it('highlights search matches in the unified render (no swap to a flat view)', () => {
    // The single render path keeps search highlighting: matches wrap in keyed
    // <mark> spans, and the current match carries tx-match--current for autoscroll.
    const searched: Message[] = [
      { id: 'u', role: 'user', parts: [{ type: 'text', text: 'resolve Los Angeles' }] },
      {
        id: 'a',
        role: 'assistant',
        parts: [{ type: 'text', text: 'Los Angeles resolved to 34.05, -118.24.' }],
      },
    ];
    render(() => (
      <Transcript
        density="normal"
        messages={searched}
        searchQuery="Angeles"
        currentMatchKey="a:1"
      />
    ));
    const marks = document.querySelectorAll('mark.tx-match');
    // One match in the user prompt, one in the assistant answer.
    expect(marks.length).toBe(2);
    // The keyed current match (global index 1 = the assistant occurrence) is marked.
    const current = document.querySelector('mark.tx-match--current');
    expect(current).toBeTruthy();
    expect(current!.getAttribute('data-match-key')).toBe('a:1');
  });

  it('strips display-only typed workflow state, keeping only the prose', () => {
    // UNIFIED render: `CLIO typed workflow state: { … }` is backend display-only
    // machine state, stripped by cleanProse (same as the handoff path) — the prose
    // is kept, the JSON blob and the retired workflow-state card are gone.
    render(() => (
      <Transcript
        density="normal"
        messages={[
          {
            id: 'm-workflow',
            role: 'assistant',
            parts: [
              {
                type: 'text',
                text:
                  'Evidence is ready.\n\nCLIO typed workflow state:\n' +
                  JSON.stringify({
                    workflow_state: {
                      acquisition: {
                        status: 'staged',
                        local_path: '/tmp/run/MTA1.csv',
                        size_bytes: 50424246,
                      },
                    },
                  }),
              },
            ],
          },
        ]}
      />
    ));

    expect(screen.getByText('Evidence is ready.')).toBeTruthy();
    expect(screen.queryByTestId('workflow-state-card')).toBeNull();
    expect(screen.queryByText(/"workflow_state"/)).toBeNull();
    expect(screen.queryByText(/typed workflow state/)).toBeNull();
  });

  it('renders an expert handoff as a flowing step with prose, not a workflow-state card', () => {
    render(() => (
      <Transcript
        density="normal"
        messages={[
          {
            id: 'm-handoff',
            role: 'assistant',
            parts: [
              {
                type: 'expert_handoff',
                metadata: {
                  parent_id: 'main',
                  agent_id: 'data',
                  status: 'failed',
                  output_summary:
                    "Child expert 'data' failed while delegated from 'main': _UnsupportedSessionAgent. data\n\n" +
                    'CLIO durable typed workflow state:\n' +
                    JSON.stringify({
                      workflow_state: {
                        delegation: {
                          status: 'failed',
                          failed_child: 'data',
                          parent: 'main',
                          error: '_UnsupportedSessionAgent',
                        },
                      },
                    }),
                },
              },
            ],
          },
        ]}
      />
    ));
    // The delegation renders as an indented step (agent + status) with the real
    // prose; the workflow_state JSON / "Raw state" card is gone (stripped).
    const step = screen.getByTestId('assistant-turn-step');
    expect(step).toBeTruthy();
    expect(step.textContent).toContain('data');
    expect(step.textContent).toContain('failed');
    expect(step.textContent).toContain("Child expert 'data' failed");
    expect(screen.queryByText('Raw state')).toBeNull();
    expect(screen.queryByTestId('workflow-state-card')).toBeNull();
    expect(step.textContent).not.toContain('workflow_state');
  });

  it('keeps a turn-level workflow blocker visible after the final answer text', () => {
    render(() => (
      <Transcript
        density="normal"
        messages={[
          {
            id: 'm-turn-blocker',
            role: 'assistant',
            parts: [
              {
                type: 'expert_handoff',
                metadata: {
                  parent_id: 'main',
                  agent_id: 'data',
                  status: 'completed',
                  workflow_state: {
                    delegation: {
                      status: 'failed',
                      failed_child: 'ndp_dataset_discovery',
                      parent: 'data',
                      error: '_UnsupportedSessionAgent',
                    },
                  },
                },
              },
              {
                type: 'text',
                text:
                  '## Region\nSan Diego area resolved.\n\n' +
                  'The final answer is visible after a long workflow trace.',
              },
            ],
          },
        ]}
      />
    ));

    expect(screen.getByText('San Diego area resolved.')).toBeTruthy();
    expect(screen.getByTestId('turn-workflow-blocker')).toBeTruthy();
    expect(screen.getAllByText('Workflow blocker').length).toBeGreaterThanOrEqual(1);
    // The blocker detail is built GENERICALLY from the nested entry's own fields
    // (no hardcoded backend error-code copy).
    expect(screen.getByText(/Failed Child: ndp_dataset_discovery/)).toBeTruthy();
  });

  it('treats a bare JSON handoff body as display-only state (not rendered as prose)', () => {
    render(() => (
      <Transcript
        density="normal"
        messages={[
          {
            id: 'm-handoff-json',
            role: 'assistant',
            parts: [
              {
                type: 'expert_handoff',
                metadata: {
                  parent_id: 'main',
                  agent_id: 'geospatial',
                  status: 'completed',
                  output_summary:
                    JSON.stringify({
                      REGION_LABEL: 'San Diego area',
                      CENTER_LAT: 32.7157,
                      CENTER_LON: -117.1611,
                      RADIUS_KM: 50,
                      CONFIDENCE: 'high',
                      WARNINGS: ['Default radius of 50 km applied for area query.'],
                    }) +
                    '\n\nCLIO durable typed workflow state:\n' +
                    JSON.stringify({
                      workflow_state: {
                        geospatial: {
                          status: 'resolved',
                          region_name: 'San Diego area',
                        },
                      },
                    }),
                },
              },
            ],
          },
        ]}
      />
    ));

    // The handoff body is a bare JSON evidence object — display-only structured
    // state per the contract — with no task and no tools, so the delegation is
    // entirely empty: NO prose result, NO raw JSON keys, NO workflow-state card.
    expect(screen.queryByTestId('assistant-turn-result')).toBeNull();
    expect(screen.queryByText(/REGION_LABEL/)).toBeNull();
    expect(screen.queryByText(/"workflow_state"/)).toBeNull();
    expect(screen.queryByTestId('workflow-state-card')).toBeNull();
  });

});
