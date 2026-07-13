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

  it('renders a FAILED delegation return from TYPED status/error fields, empty output (#885)', () => {
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
                  child_agent: 'data',
                  parent_agent: 'main',
                  stage: 'delegate.completed',
                  status: 'failed',
                  // #885: the server no longer authors a failure sentence into
                  // `output`/`output_summary`. `output` is empty; the failure rides
                  // the TYPED `status`/`error` fields, which the client renders. The
                  // typed workflow_state travels structurally on the row.
                  output: '',
                  error:
                    "Child expert 'data' failed while delegated from 'main': _UnsupportedSessionAgent. data",
                },
              },
            ],
          },
        ]}
      />
    ));
    // The failed return renders its typed status + error; there is no server-authored
    // summary prose, no workflow_state JSON, no "Raw state" card.
    const ret = screen.getByTestId('assistant-turn-return');
    expect(ret).toBeTruthy();
    expect(ret.textContent).toContain('data');
    expect(ret.textContent).toContain('failed');
    expect(ret.textContent).toContain("Child expert 'data' failed");
    expect(screen.getByTestId('assistant-turn-return-error')).toBeTruthy();
    expect(screen.queryByText('Raw state')).toBeNull();
    expect(screen.queryByTestId('workflow-state-card')).toBeNull();
    expect(ret.textContent).not.toContain('workflow_state');
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

});
