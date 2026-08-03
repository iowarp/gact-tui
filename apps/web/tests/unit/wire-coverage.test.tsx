/**
 * Every part kind the backend emits must render — no unrenderable fallbacks.
 *
 * The fixture is the same MOCK_WIRE_MESSAGE the e2e mock serves, shaped from
 * clio-agent's emitters (see contract/PARTS.md). If the backend grows a kind
 * and the mock is updated, this fails until a renderer exists.
 */
import { render, screen } from '@testing-library/react';
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

  it('renders one frame per part, in wire order', () => {
    const { container } = render(
      <Transcript messages={[MOCK_WIRE_MESSAGE as unknown as Message]} />,
    );
    expect(container.querySelectorAll('.kit-partcard')).toHaveLength(
      MOCK_WIRE_MESSAGE.parts.length,
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
