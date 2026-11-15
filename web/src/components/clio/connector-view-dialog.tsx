import type { Connector } from '@clio/core/v3';
import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useInvalidateConnectors } from '@/hooks/use-connectors';
import { ConnectorPane } from './connector-pane';
import { McpSignInDialog } from './mcp-sign-in';
import { t } from '@lingui/core/macro';

/**
 * A connector over the conversation, from an offer card's "View connector" (PL-D1): the
 * same pane Extensions shows (its name, logo, state, needs, sign-in and Enable), so a
 * connector is never shown through its carrier plugin's files or `connector-<id>`.
 */
export function ConnectorViewDialog({
  connector,
  onClose,
}: {
  connector: Connector;
  onClose: () => void;
}) {
  const [signing, setSigning] = useState(false);
  const invalidate = useInvalidateConnectors();
  return (
    <>
      <Dialog
        onOpenChange={(value) => {
          if (!value) onClose();
        }}
        open
      >
        <DialogContent
          className="flex max-h-[min(48rem,calc(100dvh-2rem))] min-w-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">{t`Connector details`}</DialogTitle>
          <ConnectorPane
            className="min-h-0 flex-1 overflow-y-auto"
            connector={connector}
            onClose={onClose}
            onSignIn={() => setSigning(true)}
          />
        </DialogContent>
      </Dialog>
      {signing ? (
        <McpSignInDialog
          name={connector.id}
          onClose={() => setSigning(false)}
          onConnected={() => void invalidate()}
          title={connector.name}
        />
      ) : null}
    </>
  );
}
