import { connectorSetupPayload, type PendingInteraction } from '@clio/core/v3';
import { ChevronRightIcon, PlugIcon } from 'lucide-react';
import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { useConnector } from '@/hooks/use-connectors';
import { draftValues, unfilledRequired, type ConnectorDraft } from '@/lib/connector-draft';
import { cn } from '@/lib/utils';
import { AskBody, AskButton, AskCard, AskError, AskOptions, AskSection } from './ask-card';
import { ConnectorLogo, ConnectorNeedRows } from './connector-need-rows';
import { pendingInteractionDomId, respondFromControl } from './interaction-control';
import type { ClioPendingInteractionsProps } from './pending-interactions';
import { StatusIndicator } from './primitives/status-indicator';

/**
 * The agent offers a connector that is off (connector discovery). The same card as a
 * setup request (CN5): the connector's logo, what it does, why the agent offers it and
 * what it needs. Turn on enables it for every conversation, or for this conversation's
 * agent only (CN10), and the agent's request continues; Not now refuses.
 */
export function ConnectorOfferResponse({
  disabled,
  interaction,
  onResponse,
  responseError,
}: {
  disabled?: boolean;
  interaction: PendingInteraction;
  onResponse: ClioPendingInteractionsProps['onResponse'];
  responseError?: Error;
}) {
  const payload = connectorSetupPayload(interaction.payload);
  const id = payload?.connector_id ?? '';
  const { connector } = useConnector(id || undefined);
  const [draft, setDraft] = useState<ConnectorDraft>({});
  const [everywhere, setEverywhere] = useState(true);
  const rows = (payload?.missing ?? []).map(
    (need) => connector?.needs.find((row) => row.key === need.key) ?? need,
  );
  const name = connector?.name ?? payload?.connector_name ?? id;
  const description = connector?.description ?? payload?.description ?? '';
  const agent = payload?.agent_name || payload?.agent_ref || 'this agent';
  const unfilled = unfilledRequired(rows, draft);
  // Required rows show at once; optional ones (where it runs, a command to run first)
  // wait behind one disclosure, so the offer stays short.
  const required = rows.filter((need) => need.required);
  const optional = rows.filter((need) => !need.required);
  const [showOptional, setShowOptional] = useState(false);
  const optionalId = `${pendingInteractionDomId(interaction.id)}-optional`;
  const offered = (action: string) => !interaction.actions || interaction.actions.includes(action);
  const turnOn = () => {
    if (disabled || unfilled.length) return;
    respondFromControl(
      onResponse(interaction, {
        action: 'submit',
        values: draftValues(rows, draft),
        metadata: { scope: everywhere ? 'all' : 'agent' },
      }),
    );
  };
  const switchId = `${pendingInteractionDomId(interaction.id)}-everywhere`;
  const needProps = {
    disabled,
    draft,
    onDraft: (key: string, value: string) => setDraft((current) => ({ ...current, [key]: value })),
    onSignIn: () => undefined,
    onSubmit: turnOn,
    submitLabel: `Turn on ${name}`,
  };
  return (
    <AskCard
      data-connector={id}
      data-interaction-kind="connector_setup"
      data-intent="enable"
      icon={PlugIcon}
      id={pendingInteractionDomId(interaction.id)}
      kind="question"
      spokenDetail={`${name}: not enabled. ${payload?.reason ?? ''}`}
      title={`Turn on ${name}?`}
      titleText={`Turn on ${name}?`}
      wrapTitle
    >
      <AskBody>
        <AskSection className="grid gap-2.5">
          <div className="flex min-w-0 items-start gap-2.5">
            <ConnectorLogo
              className="mt-0.5 size-8 text-[11px]"
              connector={connector ?? { id, name, logo_url: null }}
            />
            <div className="grid min-w-0 gap-0.5">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="min-w-0 font-medium [overflow-wrap:anywhere]">{name}</span>
                <StatusIndicator label="Not enabled" tone="inactive" />
              </div>
              {description ? (
                <p className="leading-5 text-muted-foreground [overflow-wrap:anywhere]">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
          {payload?.reason ? (
            <div className="grid gap-0.5" data-slot="connector-offer-reason">
              <span className="text-xs text-muted-foreground">Why the agent asks</span>
              <p className="leading-5 [overflow-wrap:anywhere]">{payload.reason}</p>
            </div>
          ) : null}
          {payload ? (
            <>
              {required.length ? (
                <ConnectorNeedRows {...needProps} needs={required} />
              ) : (
                <p className="text-xs text-muted-foreground">
                  {optional.length
                    ? 'Nothing is required to set up.'
                    : 'It needs nothing to set up.'}
                </p>
              )}
              {optional.length ? (
                <div className="grid gap-2" data-slot="connector-offer-optional">
                  <button
                    aria-controls={optionalId}
                    aria-expanded={showOptional}
                    className="flex w-fit items-center gap-1 rounded-[4px] text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                    onClick={() => setShowOptional((open) => !open)}
                    type="button"
                  >
                    <ChevronRightIcon
                      aria-hidden="true"
                      className={cn('size-3.5 transition-transform', showOptional && 'rotate-90')}
                    />
                    Optional settings ({optional.length})
                  </button>
                  {showOptional ? (
                    <div id={optionalId}>
                      <ConnectorNeedRows {...needProps} needs={optional} />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : (
            <p role="alert">This offer can’t be read by this version.</p>
          )}
          {payload?.asks_sign_in ? (
            <p className="text-xs text-muted-foreground">
              It also needs a sign-in, which it asks for the first time the agent uses it.
            </p>
          ) : null}
          <label
            className="flex min-w-0 items-center justify-between gap-3 rounded-[6px] border border-border/70 px-2.5 py-2"
            htmlFor={switchId}
          >
            <span className="grid min-w-0 gap-0.5">
              <span className="text-[0.8125rem]">Available in every conversation</span>
              <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {everywhere ? 'Every agent can use it.' : `Only ${agent} can use it.`}
              </span>
            </span>
            <Switch
              checked={everywhere}
              disabled={disabled}
              id={switchId}
              onCheckedChange={setEverywhere}
            />
          </label>
        </AskSection>
      </AskBody>
      <AskError error={responseError} />
      <AskOptions aria-label="Decision">
        {offered('submit') ? (
          <AskButton
            disabled={disabled || !payload || unfilled.length > 0}
            hint={unfilled.length ? undefined : 'Enter'}
            number={1}
            onClick={turnOn}
            primary
            title={unfilled.length ? 'Fill the required rows first' : undefined}
          >
            Turn on
          </AskButton>
        ) : null}
        {offered('decline') ? (
          <AskButton
            disabled={disabled}
            hint="Escape"
            onClick={() => respondFromControl(onResponse(interaction, { action: 'decline' }))}
          >
            Not now
          </AskButton>
        ) : null}
      </AskOptions>
    </AskCard>
  );
}
