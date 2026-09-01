import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClioRelativeTime } from './relative-time';

describe('ClioRelativeTime', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['2026-08-24T17:59:40Z', 'Now'],
    ['2026-08-24T17:48:00Z', '12m ago'],
    ['2026-08-24T14:00:00Z', '4h ago'],
    ['2026-08-22T18:00:00Z', '2d ago'],
  ])('shows recent interaction %s as %s', (timestamp, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-24T18:00:00Z'));

    render(<ClioRelativeTime compact timestamp={timestamp} />);

    expect(screen.getByText(expected)).toHaveAccessibleName(/Last interaction/);
  });

  it('keeps an exact, discoverable interaction timestamp', () => {
    const { container } = render(
      <ClioRelativeTime compact timestamp="2026-08-23T23:21:00Z" />,
    );

    const timestamp = container.querySelector('time');
    expect(timestamp).toHaveAttribute('dateTime', '2026-08-23T23:21:00Z');
    expect(timestamp).toHaveAttribute('title', expect.stringMatching(/^Last interaction /));
  });
});
