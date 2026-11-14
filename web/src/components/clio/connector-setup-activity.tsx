import { connectorSetupPayload, type PendingInteraction } from '@clio/core/v3';
import { useConnector } from '@/hooks/use-connectors';
import { WaitingForYou } from './agent-answer-activity';
import { ConnectorLogo } from './connector-need-rows';

const OUTCOME: Record<string, string> = {
  answered: 'set up',
  denied: 'declined',
  cancelled: 'cancelled',
  expired: 'expired',
};

/** An offer's outcomes: the person added the connector here, or said Not now. */
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
  const name = connector?.name ?? payload?.connector_name ?? (id || 'a connector');
  const offer = payload?.intent === 'enable';
  return (
    <div
      className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"
      data-interaction-kind="connector_setup"
      data-slot="connector-setup-activity"
    >
      <ConnectorLogo
        className="size-4 text-[8px]"
        connector={connector ?? { id, name, logo_url: null }}
      />
      <span className="min-w-0 truncate text-foreground/80">
        {offer ? 'Add' : 'Set up'} {name}
        {offer ? ' to this conversation' : ''}
      </span>
      {interaction.status === 'pending' ? (
        <WaitingForYou interaction={interaction} />
      ) : (
        <span>{(offer ? OFFER_OUTCOME : OUTCOME)[interaction.status] ?? interaction.status}</span>
      )}
    </div>
  );
}
