import { useEffect, useMemo, useState } from 'react';
import {
  createSessionReadQueue,
  type SessionResourceLoading,
} from '@/lib/session-resource-loading';

/** Paint a usable log before starting bounded, cancellable surrounding reads. */
export function useSessionResourceLoading(
  sessionKey: string,
  logReady: boolean,
): SessionResourceLoading {
  const [painted, setPainted] = useState('');
  const load = useMemo(() => createSessionReadQueue(2), []);
  useEffect(() => {
    if (!logReady || !sessionKey) return;
    let first = 0;
    let second = 0;
    const arm = () => {
      if (document.visibilityState === 'hidden') return;
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setPainted(sessionKey));
      });
    };
    arm();
    document.addEventListener('visibilitychange', arm);
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      document.removeEventListener('visibilitychange', arm);
    };
  }, [sessionKey, logReady]);
  return { enabled: logReady && painted === sessionKey, load };
}
