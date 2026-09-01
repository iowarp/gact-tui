import { render as renderComponent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Mermaid } from './mermaid';

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async () => ({ svg: '<svg viewBox="0 0 10 10"><text>Ready</text></svg>' })),
}));

vi.mock('mermaid', () => ({ default: mermaidMock }));

describe('Mermaid renderer configuration', () => {
  it('disables HTML labels at the Mermaid 11 root configuration seam', async () => {
    renderComponent(
      <Mermaid
        chart={'flowchart TD\n  source[Scientific source] --> result[Result]'}
        config={{ flowchart: { htmlLabels: false }, htmlLabels: false }}
        debounceTime={0}
      />,
    );

    await waitFor(() => expect(mermaidMock.initialize).toHaveBeenCalled());

    expect(mermaidMock.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({
        htmlLabels: false,
        flowchart: expect.objectContaining({ htmlLabels: false }),
      }),
    );
  });
});
