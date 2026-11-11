import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './hover-card';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * Radix's trigger calls `preventDefault()` from a React `onTouchStart`. React
 * listens for touch events passively, so the browser refused it and logged
 * "Unable to preventDefault inside passive event listener invocation" on every
 * tap of a file chip, citation or attachment preview.
 */
describe('HoverCardTrigger', () => {
  it('never calls preventDefault on touchstart, so a tap logs no passive-listener error', () => {
    const preventDefault = vi.spyOn(Event.prototype, 'preventDefault');
    render(
      <HoverCard>
        <HoverCardTrigger asChild>
          <a href="#throughput">throughput.png</a>
        </HoverCardTrigger>
        <HoverCardContent>Preview</HoverCardContent>
      </HoverCard>,
    );
    fireEvent.touchStart(screen.getByRole('link', { name: 'throughput.png' }), {
      touches: [{ clientX: 4, clientY: 4 }],
    });
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("keeps the caller's own touchstart handlers on the trigger and its child", () => {
    const triggerTouch = vi.fn();
    const childTouch = vi.fn();
    render(
      <HoverCard>
        <HoverCardTrigger asChild onTouchStart={triggerTouch}>
          <a href="#source" onTouchStart={childTouch}>
            Source
          </a>
        </HoverCardTrigger>
      </HoverCard>,
    );
    fireEvent.touchStart(screen.getByRole('link', { name: 'Source' }));
    expect(triggerTouch).toHaveBeenCalledTimes(1);
    expect(childTouch).toHaveBeenCalledTimes(1);
  });

  it('renders its own anchor without asChild, as the Radix trigger does', () => {
    const preventDefault = vi.spyOn(Event.prototype, 'preventDefault');
    render(
      <HoverCard>
        <HoverCardTrigger className="usage" href="#usage">
          Usage
        </HoverCardTrigger>
      </HoverCard>,
    );
    const trigger = screen.getByRole('link', { name: 'Usage' });
    expect(trigger.tagName).toBe('A');
    expect(trigger).toHaveClass('usage');
    expect(trigger).toHaveAttribute('data-slot', 'hover-card-trigger');
    expect(trigger).toHaveAttribute('data-state', 'closed');
    fireEvent.touchStart(trigger);
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('still opens the card on hover and on focus', async () => {
    const user = userEvent.setup();
    render(
      <>
        <HoverCard openDelay={0} closeDelay={0}>
          <HoverCardTrigger asChild>
            <a href="#hovered">Hovered</a>
          </HoverCardTrigger>
          <HoverCardContent>Hover preview</HoverCardContent>
        </HoverCard>
        <HoverCard openDelay={0} closeDelay={0}>
          <HoverCardTrigger asChild>
            <a href="#focused">Focused</a>
          </HoverCardTrigger>
          <HoverCardContent>Focus preview</HoverCardContent>
        </HoverCard>
      </>,
    );
    await user.hover(screen.getByRole('link', { name: 'Hovered' }));
    expect(await screen.findByText('Hover preview')).toBeInTheDocument();
    act(() => screen.getByRole('link', { name: 'Focused' }).focus());
    expect(await screen.findByText('Focus preview')).toBeInTheDocument();
  });
});
