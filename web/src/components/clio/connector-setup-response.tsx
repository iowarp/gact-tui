import { connectorSetupPayload, isConnectorOffer, type PendingInteraction } from '@clio/core/v3';
import { PlugIcon } from 'lucide-react';
import { useState } from 'react';
import { useConnector, useInvalidateConnectors, useSessionConnector } from '@/hooks/use-connectors';
import { connectorStatus } from '@/lib/connector-presentation';
import { AskBody, AskButton, AskCard, AskError, AskOptions, AskSection } from './ask-card';
import { ConnectorLogo, ConnectorNeedRows } from './connector-need-rows';
import { ConnectorOfferResponse } from './connector-offer-response';
import { conversationAnswer, unfilledRequired, type ConnectorDraft } from '@/lib/connector-draft';
import { pendingInteractionDomId, respondFromControl } from './interaction-control';
import { McpSignInDialog } from './mcp-sign-in';
import type { ClioPendingInteractionsProps } from './pending-interactions';
import { StatusIndicator } from './primitives/status-indicator';

/**
 * The setup card inside the conversation (CN5). The agent called a tool on a connector
 * that is not ready; the call waits while the card shows the rows still missing. Filling
 * them continues the same call. Declining returns a refusal that names the connector.
 */
export function ConnectorSetupResponse(props: ConnectorCardProps) {
  // The agent's offer of a connector that is off is the same card, in its enable form.
  return isConnectorOffer(props.interaction.payload) ? (
    <ConnectorOfferResponse {...props} />
  ) : (
    <ConnectorSetupCard {...props} />
  );
}

interface ConnectorCardProps {
  disabled?: boolean;
  interaction: PendingInteraction;
  onResponse: ClioPendingInteractionsProps['onResponse'];
  responseError?: Error;
}

function ConnectorSetupCard({
  disabled,
  interaction,
  onResponse,
  responseError,
}: ConnectorCardProps) {
  const payload = connectorSetupPayload(interaction.payload);
  const id = payload?.connector_id ?? '';
  // The rows as this conversation sees them: its own values over the defaults (CV-D5).
  const { connector: everywhereRow } = useConnector(id || undefined);
  const { connector: conversationRow } = useSessionConnector(
    id || undefined,
    interaction.owner_session_id || undefined,
  );
  const connector = conversationRow ?? everywhereRow;
  const [saveAsDefault, setSaveAsDefault] = useState<Record<string, boolean>>({});
  const invalidate = useInvalidateConnectors();
  const [draft, setDraft] = useState<ConnectorDraft>({});
  const [signingIn, setSigningIn] = useState(false);
  // The rows this call is missing, read fresh from the connector so a sign-in or a value
  // the agent set shows here as soon as it lands.
  const rows = (payload?.missing ?? []).map(
    (need) => connector?.needs.find((row) => row.key === need.key) ?? need,
  );
  const name = connector?.name ?? payload?.connector_name ?? id;
  const unfilled = unfilledRequired(rows, draft);
  const answer = () => {
    const { values, save_as_default } = conversationAnswer(rows, draft, saveAsDefault);
    return { action: 'submit', values, metadata: { save_as_default } };
  };
  const offered = (action: string) => !interaction.actions || interaction.actions.includes(action);
  const submit = () => {
    if (disabled || unfilled.length) return;
    respondFromControl(onResponse(interaction, answer()));
  };
  const status = connector ? connectorStatus(connector) : undefined;
  const tool = payload?.tool_name ?? interaction.source.tool_name;
  return (
    <AskCard
      data-connector={id}
      data-interaction-kind="connector_setup"
      icon={PlugIcon}
      id={pendingInteractionDomId(interaction.id)}
      kind="question"
      meta={tool}
      metaMono
      spokenDetail={status ? `${name}: ${status.label}` : undefined}
      title={`Set up ${name}`}
      titleText={`Set up ${name}`}
      wrapTitle
    >
      <AskBody>
        <AskSection className="grid gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <ConnectorLogo
              className="size-5 text-[9px]"
              connector={connector ?? { id, name, logo_url: null }}
            />
            <span className="min-w-0 truncate font-medium">{name}</span>
            {status ? <StatusIndicator label={status.label} tone={status.tone} /> : null}
          </div>
          <p className="leading-5 text-muted-foreground">
            {tool ? (
              <>
                The agent’s call to <span className="font-mono text-[11.5px]">{tool}</span> waits
                until this is set up, then continues.
              </>
            ) : (
              'The agent’s call waits until this is set up, then continues.'
            )}
          </p>
          {payload ? (
            <ConnectorNeedRows
              disabled={disabled}
              draft={draft}
              needs={rows}
              onDraft={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
              onSignIn={() => setSigningIn(true)}
              onSaveAsDefault={(key, save) =>
                setSaveAsDefault((current) => ({ ...current, [key]: save }))
              }
              onSubmit={submit}
              saveAsDefault={saveAsDefault}
              submitLabel={`Set up ${name}`}
            />
          ) : (
            <p role="alert">This setup request can’t be read by this version.</p>
          )}
        </AskSection>
      </AskBody>
      <AskError error={responseError} />
      <AskOptions aria-label="Decision">
        {offered('submit') ? (
          <AskButton
            disabled={disabled || !payload || unfilled.length > 0}
            hint={unfilled.length ? undefined : 'Enter'}
            number={1}
            onClick={submit}
            primary
            title={unfilled.length ? 'Fill the required rows first' : undefined}
          >
            Continue
          </AskButton>
        ) : null}
        {offered('decline') ? (
          <AskButton
            disabled={disabled}
            hint="Escape"
            onClick={() => respondFromControl(onResponse(interaction, { action: 'decline' }))}
          >
            Decline
          </AskButton>
        ) : null}
      </AskOptions>
      {signingIn && id ? (
        <McpSignInDialog
          name={id}
          onClose={() => setSigningIn(false)}
          onConnected={() => {
            void invalidate();
            // A sign-in completes its row; with nothing else to fill, the call continues.
            const others = unfilled.filter((need) => need.kind !== 'sign-in');
            if (!others.length && offered('submit'))
              respondFromControl(onResponse(interaction, answer()));
          }}
          title={name}
        />
      ) : null}
    </AskCard>
  );
}
