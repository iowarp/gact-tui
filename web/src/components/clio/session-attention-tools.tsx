import type { useAttentionMode } from '@/hooks/use-attention-mode';
import { useAttentionAvailable } from '@/lib/attention-availability';
import { AttentionModeBanner } from './attention-mode-banner';
import { AttentionLookupPanel } from './attention-lookup-panel';

/** Keep session inspection controls behind the same captured-attention capability. */
export function SessionAttentionTools({
  attention,
  sessionId,
}: {
  attention: ReturnType<typeof useAttentionMode>;
  sessionId: string;
}) {
  const available = useAttentionAvailable(sessionId);
  if (!available) return null;
  return (
    <>
      <AttentionModeBanner
        onDismiss={attention.dismiss}
        state={attention.state}
        onProfileChange={attention.changeProfile}
        onFocusItem={attention.focusItem}
      />
      <AttentionLookupPanel sessionId={sessionId} onHeatChange={attention.showLookupHeat} />
    </>
  );
}
