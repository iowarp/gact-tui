import type { ReactNode } from 'react';
import { useConnectionSettings } from '@/providers/connection-provider';
import { A2uiSourceSignInHost } from './a2ui-source-sign-in';
import { TranscriptDisclosures } from './transcript-disclosures';
import type { AttentionSessionAvailability } from '@clio/core/v3';
import { AttentionAvailabilityContext, hasAttentionCaptures } from '@/lib/attention-availability';

/**
 * Keep session state above the shell's desktop/mobile layout remounts. The shell and
 * left bar stay mounted across conversations; this state resets for each one, and the
 * page keys its conversation regions by endpoint and conversation.
 */
export function WorkspaceSessionProviders({
  children,
  sessionId,
  workspaceId,
  attention,
}: {
  children: ReactNode;
  sessionId: string;
  workspaceId: string;
  attention?: AttentionSessionAvailability;
}) {
  const { settings } = useConnectionSettings();
  return (
    <TranscriptDisclosures sessionId={sessionId}>
      <AttentionAvailabilityContext.Provider
        value={{ sessionId, available: hasAttentionCaptures(attention) }}
      >
        <A2uiSourceSignInHost scope={`${settings.endpoint}:${sessionId}`} workspaceId={workspaceId}>
          {children}
        </A2uiSourceSignInHost>
      </AttentionAvailabilityContext.Provider>
    </TranscriptDisclosures>
  );
}
