import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ClioStreamingText } from './streaming-text';
import { splitStreamingText } from './streaming-text-model';

afterEach(cleanup);

describe('ClioStreamingText', () => {
  it('shows the authoritative text immediately while animating only its trailing chunk', () => {
    const text = 'A received streaming response remains authoritative and visible without delay.';
    const { container } = render(<ClioStreamingText active text={text} />);

    expect(screen.getByText(/A received streaming response/)).toHaveTextContent(text);
    expect(container.querySelector('[data-slot="stream-trail"]')?.textContent).toBe(
      text.slice(-48),
    );
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('keeps the trailing node mounted while authoritative text advances', () => {
    const { container, rerender } = render(<ClioStreamingText active text="delta-0 " />);
    const trail = container.querySelector('[data-slot="stream-trail"]');

    rerender(<ClioStreamingText active text="delta-0 delta-1 " />);

    expect(container.querySelector('[data-slot="stream-trail"]')).toBe(trail);
    expect(container).toHaveTextContent('delta-0 delta-1');
  });

  it('removes the animated text split when reduced motion is requested', () => {
    expect(splitStreamingText('Reduced motion remains immediate.', true, true)).toEqual({
      stableText: 'Reduced motion remains immediate.',
      trailingText: '',
    });
  });
});
