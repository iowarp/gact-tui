import {
  cloneElement,
  useEffect,
  useState,
  type ComponentProps,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';

interface TriggerProps {
  onPointerEnter?: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave?: (event: PointerEvent<HTMLElement>) => void;
}

interface LazyHoverCardProps extends Omit<ComponentProps<typeof HoverCardContent>, 'children'> {
  /** The hovered element: a mark that is not focusable (a dot, an info icon). */
  trigger: ReactElement<TriggerProps>;
  openDelay?: number;
  closeDelay?: number;
  children: ReactNode;
}

/**
 * A hover card for a mark repeated on every row (a status dot, an info icon).
 * Until the pointer first reaches it, only the mark renders: a list opens
 * without one Radix hover card per row. Its trigger must not take focus, since
 * the card mounts around it on that first hover.
 */
export function LazyHoverCard({
  trigger,
  openDelay = 700,
  closeDelay = 300,
  children,
  ...content
}: LazyHoverCardProps) {
  const [armed, setArmed] = useState(false);
  const [open, setOpen] = useState(false);
  // The first enter already happened before the card mounted, so its opening is timed here.
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => {
      setPending(false);
      setOpen(true);
    }, openDelay);
    return () => clearTimeout(timer);
  }, [pending, openDelay]);

  if (!armed) {
    return cloneElement(trigger, {
      onPointerEnter: (event: PointerEvent<HTMLElement>) => {
        trigger.props.onPointerEnter?.(event);
        if (event.pointerType === 'touch') return;
        setArmed(true);
        setPending(true);
      },
    });
  }
  return (
    <HoverCard
      closeDelay={closeDelay}
      onOpenChange={(next) => {
        setPending(false);
        setOpen(next);
      }}
      open={open}
      openDelay={openDelay}
    >
      <HoverCardTrigger asChild>
        {cloneElement(trigger, {
          onPointerLeave: (event: PointerEvent<HTMLElement>) => {
            trigger.props.onPointerLeave?.(event);
            setPending(false);
          },
        })}
      </HoverCardTrigger>
      <HoverCardContent {...content}>{children}</HoverCardContent>
    </HoverCard>
  );
}
