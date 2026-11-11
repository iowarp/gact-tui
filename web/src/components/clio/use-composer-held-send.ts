import type { MessageDelivery } from '@clio/core/v3';
import { useEffect, useState, type RefObject } from 'react';

type HeldDelivery = MessageDelivery | 'queued';

/**
 * An Enter pressed while the connection is still loading. The draft stays
 * editable; the send waits and goes out once, on the frame after `connecting`
 * clears and the submit square re-enables.
 */
export function useComposerHeldSend(
  connecting: boolean,
  rootRef: RefObject<HTMLDivElement | null>,
  nextDeliveryRef: RefObject<HeldDelivery | undefined>,
) {
  const [heldSend, setHeldSend] = useState<{ delivery: HeldDelivery }>();
  useEffect(() => {
    if (connecting || !heldSend) return;
    const frame = window.requestAnimationFrame(() => {
      setHeldSend(undefined);
      const form = rootRef.current?.querySelector('form');
      const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (!form || !submit || submit.disabled) return;
      nextDeliveryRef.current = heldSend.delivery;
      form.requestSubmit();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [connecting, heldSend, nextDeliveryRef, rootRef]);
  return {
    held: Boolean(heldSend),
    hold: (delivery: HeldDelivery) => setHeldSend({ delivery }),
  };
}
