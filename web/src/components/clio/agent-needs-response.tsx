import { connectorSetupPayload, type AgentNeedItem, type PendingInteraction } from '@clio/core/v3';
import { ChevronRightIcon, PlugIcon } from 'lucide-react';
import { useState } from 'react';
import { draftValues, unfilledRequired, type ConnectorDraft } from '@/lib/connector-draft';
import {
  agentNeedEffect,
  agentNeedKind,
  agentNeedProgress,
  agentNeedsTitle,
  agentNeedTone,
} from '@/lib/agent-needs';
import { cn } from '@/lib/utils';
import { AskBody, AskButton, AskCard, AskError, AskOptions, AskSection } from './ask-card';
import { BinaryAsk } from './ask-binary';
import { ConnectorLogo, ConnectorNeedRows } from './connector-need-rows';
import { pendingInteractionDomId, respondFromControl } from './interaction-control';
import type { ClioPendingInteractionsProps } from './pending-interactions';
import { StatusIndicator } from './primitives/status-indicator';
import { ph, plural, t } from '@lingui/core/macro';

/**
 * The agent-load card (clio-agent LZ-D2): the agent this conversation runs needs
 * connectors or plugins that are not ready. Four rows: the question ("EarthScope uses
 * Geo and National Data Platform, which are not enabled. Enable them?"); each item in
 * words, with its kind and what enabling does (downloads its tools, needs a value);
 * what Not now means; Enable all, Not now and Settings (n), where each item can be left
 * out and its optional values set. A required value that is missing shows in the card.
 *
 * Enable all downloads and turns them on in the background: the same rows then say each
 * one's progress in words until the person closes the card. Not now leaves the agent
 * working without them, and is remembered for this agent in this workspace.
 */
export function AgentNeedsResponse({
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
  const items = payload?.items ?? [];
  const phase = payload?.phase ?? 'ask';
  const asking = phase === 'ask';
  const agent = payload?.agent_name || t`This agent`;
  const [left, setLeft] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, ConnectorDraft>>({});
  const [showSettings, setShowSettings] = useState(false);
  const chosen = items.filter((item) => !left[item.id]);
  const unfilled = chosen.filter(
    (item) => unfilledRequired(item.missing, drafts[item.id] ?? {}).length,
  );
  const failed = items.filter((item) => item.progress === 'failed');
  const offered = (action: string) => (interaction.actions ?? []).includes(action);
  const draft = (id: string) => (key: string, value: string) =>
    setDrafts((current) => ({ ...current, [id]: { ...current[id], [key]: value } }));
  const enable = () => {
    if (disabled || !chosen.length) return;
    const values: Record<string, Record<string, string | null>> = {};
    for (const item of chosen) {
      const changed = draftValues([...item.missing, ...item.settings], drafts[item.id] ?? {});
      if (Object.keys(changed).length) values[item.id] = changed;
    }
    respondFromControl(
      onResponse(interaction, {
        action: 'submit',
        values,
        metadata: { items: chosen.map((item) => item.id) },
      }),
    );
  };
  const title = agentNeedsTitle(agent, items, phase);
  const settingsId = `${pendingInteractionDomId(interaction.id)}-settings`;
  const withSettings = items.filter((item) => item.settings.length);
  const settingsCount = asking ? items.length : 0;
  return (
    <AskCard
      data-interaction-kind="connector_setup"
      data-intent="agent_needs"
      data-phase={phase}
      icon={PlugIcon}
      id={pendingInteractionDomId(interaction.id)}
      kind="question"
      spokenDetail={items
        .map((item) =>
          [item.name, agentNeedKind(item), asking ? agentNeedEffect(item) : agentNeedProgress(item)]
            .filter(Boolean)
            .join(', '),
        )
        .join('. ')}
      title={title}
      titleText={title}
      wrapTitle
    >
      <AskBody>
        <AskSection className="mt-1.5 grid gap-1.5 pb-1">
          <ul aria-label={t`What it needs`} className="grid gap-1" data-slot="agent-needs-items">
            {items.map((item) => (
              <NeedItem asking={asking} item={item} key={item.id} left={Boolean(left[item.id])} />
            ))}
          </ul>
          {asking ? (
            <p className="text-xs leading-5 text-muted-foreground" data-slot="agent-needs-not-now">
              {plural(items.length, {
                one: `Not now: ${agent} works without it and can offer it later.`,
                other: `Not now: ${agent} works without them and can offer them later.`,
              })}
            </p>
          ) : null}
          {asking
            ? chosen
                .filter((item) => item.missing.some((need) => need.required))
                .map((item) => (
                  <div className="grid gap-1" key={item.id}>
                    <span className="text-xs text-muted-foreground">{item.name}</span>
                    <ConnectorNeedRows
                      disabled={disabled}
                      draft={drafts[item.id] ?? {}}
                      needs={item.missing.filter((need) => need.required)}
                      onDraft={draft(item.id)}
                      onSignIn={() => undefined}
                      onSubmit={enable}
                      submitLabel={t`Enable ${item.name}`}
                    />
                  </div>
                ))
            : null}
        </AskSection>
      </AskBody>
      <AskError error={responseError} />
      {asking ? (
        <BinaryAsk
          accept={
            offered('submit')
              ? {
                  disabled: !payload || !chosen.length,
                  label:
                    chosen.length === items.length
                      ? t`Enable all`
                      : t`Enable ${ph({ count: chosen.length })}`,
                  onChoose: enable,
                  title: unfilled.length
                    ? t`Those with an empty required value ask for it when first used.`
                    : undefined,
                }
              : undefined
          }
          className="mt-2"
          decline={
            offered('decline')
              ? {
                  label: t`Not now`,
                  onChoose: () => onResponse(interaction, { action: 'decline' }),
                }
              : undefined
          }
          disabled={disabled}
          enterAccepts
          label={t`Decision`}
        >
          {settingsCount ? (
            <button
              aria-controls={settingsId}
              aria-expanded={showSettings}
              className="flex h-7 w-fit shrink-0 items-center gap-1 rounded-[4px] px-1 text-xs whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              data-slot="agent-needs-settings"
              onClick={() => setShowSettings((open) => !open)}
              type="button"
            >
              <ChevronRightIcon
                aria-hidden="true"
                className={cn('size-3.5 transition-transform', showSettings && 'rotate-90')}
              />
              {t`Settings (${ph({ count: settingsCount })})`}
            </button>
          ) : null}
        </BinaryAsk>
      ) : (
        <AskOptions aria-label={t`Decision`} className="mt-2">
          {failed.length > 0 && offered('submit') ? (
            <AskButton
              disabled={disabled}
              number={1}
              onClick={() =>
                respondFromControl(
                  onResponse(interaction, {
                    action: 'submit',
                    metadata: { items: failed.map((item) => item.id) },
                  }),
                )
              }
            >
              {t`Try again`}
            </AskButton>
          ) : null}
          {offered('dismiss') ? (
            <AskButton
              disabled={disabled}
              // i18n-ignore: key name
              hint={phase === 'done' ? 'Enter' : 'Escape'}
              onClick={() => respondFromControl(onResponse(interaction, { action: 'dismiss' }))}
              primary={phase === 'done' && !failed.length}
              title={phase === 'working' ? t`It goes on in the background.` : undefined}
            >
              {phase === 'working' ? t`Hide` : t`Close`}
            </AskButton>
          ) : null}
          {settingsCount ? (
            <button
              aria-controls={settingsId}
              aria-expanded={showSettings}
              className="flex h-7 w-fit shrink-0 items-center gap-1 rounded-[4px] px-1 text-xs whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
              data-slot="agent-needs-settings"
              onClick={() => setShowSettings((open) => !open)}
              type="button"
            >
              <ChevronRightIcon
                aria-hidden="true"
                className={cn('size-3.5 transition-transform', showSettings && 'rotate-90')}
              />
              {t`Settings (${ph({ count: settingsCount })})`}
            </button>
          ) : null}
        </AskOptions>
      )}
      {asking && showSettings ? (
        <AskSection className="mt-2 grid max-h-64 gap-2 overflow-y-auto" id={settingsId}>
          {items.map((item) => (
            <label
              className="flex min-w-0 items-center gap-2 text-xs"
              data-slot="agent-needs-choice"
              key={item.id}
            >
              <input
                checked={!left[item.id]}
                className="size-3.5 accent-primary"
                disabled={disabled}
                onChange={(event) =>
                  setLeft((current) => ({ ...current, [item.id]: !event.target.checked }))
                }
                type="checkbox"
              />
              <span className="min-w-0 truncate">
                {t`Enable ${item.name}`}
                <span className="text-muted-foreground">{` (${agentNeedKind(item)})`}</span>
              </span>
            </label>
          ))}
          {withSettings
            .filter((item) => !left[item.id])
            .map((item) => (
              <div className="grid gap-1" key={`${item.id}-settings`}>
                <span className="text-xs text-muted-foreground">{t`${item.name} settings`}</span>
                <ConnectorNeedRows
                  disabled={disabled}
                  draft={drafts[item.id] ?? {}}
                  needs={item.settings}
                  onDraft={draft(item.id)}
                  onSignIn={() => undefined}
                  onSubmit={enable}
                  submitLabel={t`Enable ${item.name}`}
                />
              </div>
            ))}
        </AskSection>
      ) : null}
    </AskCard>
  );
}

/** One item: its logo, name and kind, then what enabling does or where it is now. */
function NeedItem({ item, asking, left }: { item: AgentNeedItem; asking: boolean; left: boolean }) {
  const words = asking ? agentNeedEffect(item) : agentNeedProgress(item);
  return (
    <li
      className={cn('flex min-w-0 items-center gap-2 leading-5', left && 'opacity-60')}
      data-connector={item.id}
      data-progress={item.progress ?? undefined}
      data-slot="agent-needs-item"
    >
      <ConnectorLogo
        className="size-4 shrink-0 text-[8px]"
        connector={{
          id: item.id,
          name: item.name,
          logo_url: item.logo_url,
          logo_dark_url: item.logo_dark_url,
        }}
      />
      <span className="shrink-0 font-medium">{item.name}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{agentNeedKind(item)}</span>
      {asking ? (
        <span className="min-w-0 truncate text-xs text-muted-foreground" title={words}>
          {left ? t`Not now` : words}
        </span>
      ) : (
        <span className="flex min-w-0 items-center overflow-hidden text-xs" title={words}>
          <StatusIndicator label={words} tone={agentNeedTone(item)} />
        </span>
      )}
    </li>
  );
}
