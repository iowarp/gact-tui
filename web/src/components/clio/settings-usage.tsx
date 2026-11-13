import type { FleetAccount, FleetSpend } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import {
  accountUsageWords,
  BILLING_ORDER,
  billingLabel,
  spendDetails,
  spendLabel,
  type UsageMode,
} from '@/lib/fleet-usage';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { providerLogoId } from '@/lib/provider-presentation';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { NARROW_HIDDEN } from '@/lib/settings-fold';
import { useConnectionSettings } from '@/providers/connection-provider';
import { DelegationSwitch } from './delegation-switch';
import { SpendSummary, UsageSummary } from './fleet-usage';
import { InfoTip } from './info-tip';
import { DetailPane, ListDetailLayout } from './primitives/detail-pane';
import { IconButton } from './primitives/icon-button';
import { ItemList, ItemRow } from './primitives/item-row';
import { KeyValueGrid } from './primitives/key-value-grid';
import { SegmentedControl } from './primitives/segmented-control';
import { StateView } from './primitives/state-view';
import { StatusIndicator } from './primitives/status-indicator';
import { SettingsGroupLabel } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';
import { SpendRow } from './settings-usage-spend';
import { TechnicalDetails } from './technical-details';
import { plural, t } from '@lingui/core/macro';

const { agent } = vocab;

const MODE_KEY = 'clio.usage.mode';

const MODES = [
  { value: 'used', label: t`Used` },
  { value: 'remaining', label: t`Remaining` },
] as const;

function storedMode(): UsageMode {
  try {
    return window.localStorage.getItem(MODE_KEY) === 'remaining' ? 'remaining' : 'used';
  } catch {
    return 'used';
  }
}

function AccountRow({
  account,
  mode,
  selected,
  onDetails,
}: {
  account: FleetAccount;
  mode: UsageMode;
  selected: boolean;
  onDetails: () => void;
}) {
  const words = accountUsageWords(account, mode);
  const meta = account.spend
    ? `${billingLabel(account.billing)}, ${spendLabel(account.spend)}`
    : billingLabel(account.billing);
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.key !== 'Enter') return;
    event.preventDefault();
    onDetails();
  }
  return (
    <ItemRow
      actions={<IconButton icon={<InfoIcon />} label={t`Details`} onClick={onDetails} size="sm" />}
      actionsWidth={40}
      aria-label={`${account.label}, ${words.label}`}
      data-account-id={account.id}
      data-slot="usage-account-row"
      icon={<ModelSelectorLogo provider={providerLogoId(account.id)} />}
      meta={<span title={meta}>{meta}</span>}
      onKeyDown={onKeyDown}
      selected={selected}
      slot={<DelegationSwitch account={account} />}
      slotWidth={44}
      status={
        <span className="flex min-w-0" role="status" title={words.hint}>
          <StatusIndicator label={words.label} tone={words.tone} />
        </span>
      }
      statusWidth={120}
      tabIndex={0}
      title={<span title={account.label}>{account.label}</span>}
    />
  );
}

function AccountDetails({
  account,
  mode,
  onClose,
}: {
  account: FleetAccount;
  mode: UsageMode;
  onClose: () => void;
}) {
  const switchId = `delegation-${account.id}`;
  const facts = [
    { label: t`Health`, value: account.health.charAt(0).toUpperCase() + account.health.slice(1) },
    ...(account.endpoint ? [{ label: t`Endpoint`, value: account.endpoint, mono: true }] : []),
    ...(account.failure ? [{ label: t`Reason`, value: account.failure, mono: true }] : []),
  ];
  return (
    <DetailPane
      // The pane sits on the settings surface, not on the app background.
      className="bg-transparent"
      icon={<ModelSelectorLogo provider={providerLogoId(account.id)} />}
      onClose={onClose}
      title={account.label}
    >
      <div className="grid gap-1" data-slot="usage-account-details">
        <SettingsGroupLabel>{t`Limits`}</SettingsGroupLabel>
        <UsageSummary
          missingReason={account.usage_missing_reason}
          mode={mode}
          snapshot={account.usage}
        />
        <SettingsGroupLabel className="mt-3">{t`Recorded by ${agent}`}</SettingsGroupLabel>
        {account.spend ? (
          <SpendSummary spend={account.spend} />
        ) : (
          <p className="text-xs text-muted-foreground">{t`Nothing recorded yet`}</p>
        )}
        <SettingsGroupLabel className="mt-3">{t`Delegated work`}</SettingsGroupLabel>
        <label className="flex items-center gap-2 text-ui" htmlFor={switchId}>
          <DelegationSwitch account={account} id={switchId} />
          {t`${agent} may use this account`}
        </label>
        <TechnicalDetails
          className="mt-3"
          contentClassName="pt-1"
          summaryClassName="text-xs font-normal"
          title={t`Technical details`}
        >
          <KeyValueGrid items={facts} />
        </TechnicalDetails>
      </div>
    </DetailPane>
  );
}

/**
 * Every connected account with what it has used and has left, one item row
 * each: the busiest usage window as the status, what this workspace spent,
 * and whether the agent may run delegated work on it without asking. The bars
 * per window, resets and balances open beside the list.
 */
export function UsageSettings() {
  const repository = useRepository();
  const navigate = useNavigate();
  const { settings } = useConnectionSettings();
  const [mode, setMode] = useState<UsageMode>(storedMode);
  const [detailsId, setDetailsId] = useState<string>();
  const fleet = useQuery({
    queryKey: queryKeys.key('fleet', settings.endpoint),
    queryFn: ({ signal }) => repository.fleet({}, signal),
    refetchInterval: 60_000,
  });
  const choose = (value: UsageMode) => {
    setMode(value);
    try {
      window.localStorage.setItem(MODE_KEY, value);
    } catch {
      // A per-viewer convenience only: the page works without it.
    }
  };
  const accounts = [...(fleet.data?.accounts ?? [])].sort(
    (a, b) => BILLING_ORDER.indexOf(a.billing) - BILLING_ORDER.indexOf(b.billing),
  );
  const opened = accounts.find((account) => account.id === detailsId);
  const data = fleet.data;
  const models = Object.entries(data?.spend_by_model ?? {}).sort(
    ([, a], [, b]) => b.tokens - a.tokens,
  );
  const total = totalSpend(
    models.length
      ? models.map(([, spend]) => spend)
      : accounts.flatMap((account) => (account.spend ? [account.spend] : [])),
  );
  const totals = total ? spendDetails(total) : undefined;
  return (
    <section aria-label={t`Usage`} className="@container flex flex-col gap-2">
      {/* The title-row controls end on the list's right edge, also beside the
          details pane (ListDetailLayout's list column is the other 58%, plus the
          page gutter the pane runs into). */}
      <div className={cn(opened && 'w-[calc(58%+var(--settings-gutter,0px))] @max-[40rem]:w-full')}>
        <SettingsSectionHeading
          actions={
            accounts.length ? (
              <SegmentedControl
                label={t`Show`}
                onValueChange={choose}
                options={MODES}
                value={mode}
              />
            ) : undefined
          }
          info={t`Account limits and usage recorded by ${agent}.`}
          title={t`Usage`}
        />
      </div>
      {fleet.isPending ? (
        <StateView kind="loading" size="row" title={t`Loading usage…`} />
      ) : fleet.error || !fleet.data ? (
        <div className="max-w-[760px]">
          <StateView
            action={{ label: t`Retry`, onClick: () => void fleet.refetch() }}
            kind="error"
            size="row"
            title={t`The agent could not load usage.`}
          />
        </div>
      ) : accounts.length ? (
        <ListDetailLayout
          detail={
            opened ? (
              <AccountDetails
                account={opened}
                mode={mode}
                onClose={() => setDetailsId(undefined)}
              />
            ) : undefined
          }
          list={
            <div className="grid grid-cols-1 gap-2">
              {/* Lists fill the pane, as on every list page; Total keeps By model's columns. */}
              <div>
                <SettingsGroupLabel
                  actions={
                    <span className="flex items-center gap-1" data-slot="usage-delegation-caption">
                      {t`Delegated work`}
                      <InfoTip
                        className={cn('text-faint', NARROW_HIDDEN)}
                        label={t`About delegated work`}
                      >
                        {t`Turn an account on to let ${agent} run delegated work on it without asking.`}
                      </InfoTip>
                    </span>
                  }
                  className="mt-0"
                >
                  {t`Accounts`}
                </SettingsGroupLabel>
                <ItemList className="border-t border-border/70" label={t`Accounts`}>
                  {accounts.map((account) => (
                    <AccountRow
                      account={account}
                      key={account.id}
                      mode={mode}
                      onDetails={() => setDetailsId(account.id)}
                      selected={account.id === detailsId}
                    />
                  ))}
                </ItemList>
                {data && models.length ? (
                  <>
                    <SettingsGroupLabel>{t`By model`}</SettingsGroupLabel>
                    <ItemList label={t`Usage by model`}>
                      {models.map(([ref, spend]) => {
                        const entry = data.entries.find((candidate) => candidate.ref === ref);
                        const [provider, ...rest] = ref.split('/');
                        const model = entry?.model ?? (rest.length ? rest.join('/') : ref);
                        const account = entry?.account ?? provider ?? '';
                        return (
                          <SpendRow
                            icon={
                              <ModelSelectorLogo
                                className="size-4 shrink-0"
                                provider={providerLogoId(account)}
                              />
                            }
                            key={ref}
                            meta={
                              account
                                ? plural(spend.turns, {
                                    one: `${account}, # turn`,
                                    other: `${account}, # turns`,
                                  })
                                : plural(spend.turns, { one: '# turn', other: '# turns' })
                            }
                            spend={spend}
                            title={model}
                          />
                        );
                      })}
                    </ItemList>
                  </>
                ) : null}
                {total && totals ? (
                  <>
                    <SettingsGroupLabel>{t`Total`}</SettingsGroupLabel>
                    {/* The same columns as By model, so the sums sit under their figures. */}
                    <ItemList label={t`Total usage`}>
                      <SpendRow
                        meta={
                          totals.cost
                            ? plural(total.turns, { one: '# turn', other: '# turns' })
                            : plural(total.turns, {
                                one: '# turn, no cost recorded',
                                other: '# turns, no cost recorded',
                              })
                        }
                        spend={total}
                        title={models.length ? t`All models` : t`All accounts`}
                      />
                    </ItemList>
                  </>
                ) : null}
                {data?.estimated_sessions ? (
                  <EstimatedNote count={data.estimated_sessions} />
                ) : null}
              </div>
            </div>
          }
        />
      ) : (
        <div className="max-w-[760px]">
          <StateView
            action={{ label: t`Open Providers`, onClick: () => navigate('/settings/providers') }}
            kind="empty"
            size="row"
            title={t`No account connected`}
          />
        </div>
      )}
    </section>
  );
}

function totalSpend(spends: FleetSpend[]): FleetSpend | undefined {
  if (!spends.length) return undefined;
  return spends.reduce((sum, spend) => ({
    tokens_input: sum.tokens_input + spend.tokens_input,
    tokens_cached: sum.tokens_cached + spend.tokens_cached,
    tokens_output: sum.tokens_output + spend.tokens_output,
    tokens: sum.tokens + spend.tokens,
    cost_usd: sum.cost_usd + spend.cost_usd,
    turns_without_cost: sum.turns_without_cost + spend.turns_without_cost,
    turns: sum.turns + spend.turns,
  }));
}

function EstimatedNote({ count }: { count: number }) {
  const text = plural(count, {
    one: '# older conversation is counted under the model it was set to: they predate per-model usage.',
    other:
      '# older conversations are counted under the model they were set to: they predate per-model usage.',
  });
  return (
    <p
      className="flex h-[1.875rem] min-w-0 items-center gap-2 text-xs whitespace-nowrap text-muted-foreground max-[599px]:h-auto max-[599px]:min-h-[1.875rem] max-[599px]:items-start max-[599px]:py-1.5"
      data-slot="settings-footnote"
      title={text}
    >
      <InfoIcon aria-hidden="true" className="size-[0.8125rem] shrink-0 max-[599px]:mt-px" />
      <span className="min-w-0 truncate max-[599px]:whitespace-normal">{text}</span>
    </p>
  );
}
