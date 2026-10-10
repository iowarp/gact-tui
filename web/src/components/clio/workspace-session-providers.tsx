import type { ReactNode } from 'react';
import { useConnectionSettings } from '@/providers/connection-provider';
import { A2uiSourceSignInHost } from './a2ui-source-sign-in';
import { TranscriptDisclosures } from './transcript-disclosures';

/** Keep session state above the shell's desktop/mobile layout remounts. */
export function WorkspaceSessionProviders({
  children,
  sessionId,
  workspaceId,
}: {
  children: ReactNode;
  sessionId: string;
  workspaceId: string;
}) {
  const { settings } = useConnectionSettings();
  return (
    <TranscriptDisclosures key={`${settings.endpoint}:${sessionId}`} sessionId={sessionId}>
      <A2uiSourceSignInHost workspaceId={workspaceId}>{children}</A2uiSourceSignInHost>
    </TranscriptDisclosures>
  );
}
