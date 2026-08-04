/**
 * Every part kind the backend emits must render — no unrenderable fallbacks.
 *
 * The fixture is the same MOCK_WIRE_MESSAGE the e2e mock serves, shaped from
 * clio-agent's emitters (see contract/PARTS.md). If the backend grows a kind
 * and the mock is updated, this fails until a renderer exists.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { Message } from '@clio/core';
import { describe, expect, it } from 'vitest';
import { Transcript } from '../../src/transcript/Transcript';
import { MOCK_WIRE_MESSAGE } from '../e2e/mock-backend';

describe('real-wire coverage', () => {
  it('renders every emitted kind without hitting the unrenderable fallback', () => {
    render(<Transcript messages={[MOCK_WIRE_MESSAGE as unknown as Message]} />);
    // The fallback is the safety net, not the destination. If it fires here,
    // a kind the backend really emits has no renderer.
    expect(screen.queryAllByTestId('part-unrenderable')).toHaveLength(0);
  });

  it('renders one frame per GROUP, in wire order', () => {
    // The transcript pairs a tool_call with its tool_result into one row
    // (the prototype's isToolSeg fold, gact-tui#333 E3/E6) — the fixture's
    // one tool_call/tool_result pair collapses two wire parts into one card,
    // so the frame count is parts.length minus that one merge.
    const { container } = render(
      <Transcript messages={[MOCK_WIRE_MESSAGE as unknown as Message]} />,
    );
    expect(container.querySelectorAll('.kit-partcard')).toHaveLength(
      MOCK_WIRE_MESSAGE.parts.length - 1,
    );
  });

  it('shows the remote host on a relay-placed background exit', () => {
    render(<Transcript messages={[MOCK_WIRE_MESSAGE as unknown as Message]} />);
    expect(screen.getByTestId('part-background-exit')).toHaveTextContent('ares');
  });

  it('keeps the wire spelling of exit_status (canceled, one l)', () => {
    // background_exit.py:16 maps task status `cancelled` -> `canceled`. The
    // spelling does not round-trip, so a renderer must not "correct" it.
    const canceled = {
      ...MOCK_WIRE_MESSAGE,
      parts: [
        {
          type: 'background_exit',
          child_agent: 'data',
          run_label: 'data #1',
          exit_status: 'canceled',
          placement: 'local',
        },
      ],
    };
    render(<Transcript messages={[canceled as unknown as Message]} />);
    expect(screen.getByTestId('part-background-exit')).toHaveTextContent('canceled');
  });
});

describe('corrected wire fields actually reach the screen', () => {
  // Not hitting the unrenderable fallback is a weak guarantee: a part can
  // render an empty frame and still pass it. These assert the substantive
  // value from each corrected field is visible, which is what "routed to"
  // with no name looked like against the live backend.
  it('names the routed agent from selected_agent', () => {
    // Scoped to the routing frame: "data" is also the agent_id on several
    // other parts, so a document-wide query proves nothing about this one.
    render(<Transcript messages={[MOCK_WIRE_MESSAGE as unknown as Message]} />);
    expect(screen.getByTestId('part-routing').textContent).toContain('data');
  });

  it('names the tool from tool_name', () => {
    render(<Transcript messages={[MOCK_WIRE_MESSAGE as unknown as Message]} />);
    expect(screen.getAllByText(/stage_resource/).length).toBeGreaterThan(0);
  });

  it('shows thinking text carried in `text` once opened', () => {
    // CollapsiblePart omits its body until asked for — deliberately, so a long
    // reasoning block costs nothing while collapsed. The text must appear on
    // open, and it must come from `text`, not a `thinking` field.
    render(<Transcript messages={[MOCK_WIRE_MESSAGE as unknown as Message]} />);
    fireEvent.click(screen.getByRole('button', { name: /thinking/i }));
    expect(screen.getByText(/Resolving the region before staging data/)).toBeInTheDocument();
  });

  it('shows tool_result content unwrapped from its part list, once opened', () => {
    render(<Transcript messages={[MOCK_WIRE_MESSAGE as unknown as Message]} />);
    // The merged tool row is closed by default (E3/E6) — open it first.
    fireEvent.click(screen.getByRole('button', { name: /stage_resource/ }));
    expect(screen.getByText(/staged 1,101 rows/)).toBeInTheDocument();
  });

  it('names the delegate from child_agent', () => {
    render(<Transcript messages={[MOCK_WIRE_MESSAGE as unknown as Message]} />);
    expect(screen.getAllByText(/geospatial/).length).toBeGreaterThan(0);
  });

  it('shows the resource_link name and the file_diff path', () => {
    // The csv name legitimately appears twice: once as the linked resource and
    // once as the background exit's artifact_ref.
    render(<Transcript messages={[MOCK_WIRE_MESSAGE as unknown as Message]} />);
    expect(screen.getAllByText(/earthscope_stations\.csv/).length).toBeGreaterThan(0);
    expect(screen.getByText(/analysis\/profile\.py/)).toBeInTheDocument();
  });
});
