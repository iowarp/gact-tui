import { useEffect } from 'react';

/** A field link opens the owning message's activity without changing other rows. */
export function useAttentionEvidenceTarget(messageId: string, reveal: () => void) {
  useEffect(() => {
    const inspect = () => {
      const [target, query] = window.location.hash.split('?');
      if (
        target === `#message-${encodeURIComponent(messageId)}` &&
        new URLSearchParams(query).has('part')
      )
        reveal();
    };
    inspect();
    window.addEventListener('hashchange', inspect);
    return () => window.removeEventListener('hashchange', inspect);
  }, [messageId, reveal]);
}
