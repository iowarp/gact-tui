import { connectorSetupPayload, type PendingInteraction } from '@clio/core/v3';
import { PuzzleIcon } from 'lucide-react';
import { useConnector } from '@/hooks/use-connectors';
import { WaitingForYou } from './agent-answer-activity';
import { ConnectorLogo } from './connector-need-rows';
import { humanizePluginId } from '@/lib/plugin-presentation';
import { t } from '@lingui/core/macro';

const OUTCOME: Record<string, string> = {
  answered: 'set up',
  denied: 'declined',
  cancelled: 'cancelled',
  expired: 'expired',
};

/** An offer's outcomes: the person added the connector or plugin here, or said Not now. */
const OFFER_OUTCOME: Record<string, string> = {
  ...OUTCOME,
  answered: 'added',
  denied: 'not now',
};

/**
 * The conversation's line for a connector setup request: which connector, and whether
 * it waits for you. The card itself is above the composer; the line jumps to it.
 */
export function ConnectorSetupActivity({ interaction }: { interaction: PendingInteraction }) {
  const payload = connectorSetupPayload(interaction.payload);
  const id = payload?.connector_id ?? '';
  const { connector } = useConnector(id || undefined);
  const plugin = payload?.intent === 'add_plugin';
  const name = plugin
    ? humanizePluginId(payload?.plugin_id || 'a plugin')
    : (connector?.name ?? payload?.connector_name ?? (id || 'a connector'));
  const offer = payload?.intent === 'enable' || plugin;
  return (
    <div
      className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"
      data-interaction-kind="connector_setup"
      data-slot="connector-setup-activity"
    >
      {plugin ? (
        <PuzzleIcon aria-hidden="true" className="size-4 shrink-0" />
      ) : (
        <ConnectorLogo
          className="size-4 text-[8px]"
          connector={connector ?? { id, name, logo_url: null }}
        />
      )}
      <span className="min-w-0 truncate text-foreground/80">
        {offer ? t`Add ${name} to this conversation` : t`Set up ${name}`}
      </span>
      {interaction.status === 'pending' ? (
        <WaitingForYou interaction={interaction} />
      ) : (
        <span>{(offer ? OFFER_OUTCOME : OUTCOME)[interaction.status] ?? interaction.status}</span>
      )}
    </div>
  );
}
