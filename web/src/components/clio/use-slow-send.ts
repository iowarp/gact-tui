import { useEffect, useState } from 'react';

/** Delay after which a send the service has not taken yet reads as slow. */
const SLOW_SEND_MS = 700;

/**
 * Whether the current send is slow to be taken. The flag comes from the send itself,
 * so it survives the welcome composer handing off to the docked one.
 */
export function useSlowSend(sending: boolean): boolean {
  const [slow, setSlow] = useState(false);
  const [wasSending, setWasSending] = useState(sending);
  // A finished send clears the flag during render, before the next one starts.
  if (wasSending !== sending) {
    setWasSending(sending);
    if (!sending) setSlow(false);
  }
  useEffect(() => {
    if (!sending) return;
    const timer = window.setTimeout(() => setSlow(true), SLOW_SEND_MS);
    return () => window.clearTimeout(timer);
  }, [sending]);
  return sending && slow;
}
