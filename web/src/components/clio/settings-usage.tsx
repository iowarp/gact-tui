import type { FleetSpend } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { InfoIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import { BILLING_ORDER, billingLabel, spendDetails, type UsageMode } from '@/lib/fleet-usage';
import { providerLogoId } from '@/lib/provider-presentation';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ItemList } from './primitives/item-row';
import { SegmentedControl } from './primitives/segmented-control';
import { StateView } from './primitives/state-view';
import { SettingsGroupLabel, SettingsRow } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';
import { SpendRow, UsageAccount } from './settings-usage-account';

const MODE_KEY = 'clio.usage.mode';

const MODES = [
  { value: 'used', label: 'Used' },
  { value: 'remaining', label: 'Remaining' },
] as const;

function storedMode(): UsageMode {
  try {
    return window.localStorage.getItem(MODE_KEY) === 'remaining' ? 'remaining' : 'used';
  } catch {
    return 'used';
  }
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

function StateRow({ children }: { children: ReactNode }) {
  return <div className="w-full border-b border-border/70 py-1 @3xl:w-[60%]">{children}</div>;
}

/**
 * Every connected account with what it has used and has left: a row per usage
 * window with its reset, a credit account's balance, what this workspace spent
 * by account and model, and whether the agent may run delegated work on it.
 */
export function UsageSettings() {
  const repository = useRepository();
  const navigate = useNavigate();
  const { settings } = useConnectionSettings();
  const [mode, setMode] = useState<UsageMode>(storedMode);
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
  const data = fleet.data;
  const accounts = data
    ? [...data.accounts].sort(
        (a, b) => BILLING_ORDER.indexOf(a.billing) - BILLING_ORDER.indexOf(b.billing),
      )
    : [];
  const groups = BILLING_ORDER.map((billing) => ({
    billing,
    accounts: accounts.filter((account) => account.billing === billing),
  })).filter((group) => group.accounts.length);
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
    <section aria-label="Usage">
      <SettingsSectionHeading
        actions={
          data && accounts.length ? (
            <SegmentedControl label="Show" onValueChange={choose} options={MODES} value={mode} />
          ) : undefined
        }
        description={`Account limits and usage recorded by ${vocab.agent}.`}
        title="Usage"
      />
      {fleet.isPending ? (
        <StateRow>
          <StateView kind="loading" size="row" title="Loading usage…" />
        </StateRow>
      ) : fleet.error || !data ? (
        <StateRow>
          <StateView
            action={{ label: 'Retry', onClick: () => void fleet.refetch() }}
            kind="error"
            size="row"
            title="Usage could not be loaded."
          />
        </StateRow>
      ) : (
        <>
          {groups.length ? (
            groups.map((group, index) => (
              <div key={group.billing}>
                <SettingsGroupLabel className={index === 0 ? 'mt-0' : undefined}>
                  {billingLabel(group.billing)}
                </SettingsGroupLabel>
                <ItemList label={`${billingLabel(group.billing)} accounts`}>
                  {group.accounts.map((account) => (
                    <UsageAccount account={account} key={account.id} mode={mode} />
                  ))}
                </ItemList>
              </div>
            ))
          ) : (
            <StateRow>
              <StateView
                action={{
                  label: 'Open Providers',
                  onClick: () => navigate('/settings/providers'),
                }}
                kind="empty"
                size="row"
                title="No account is connected."
              />
            </StateRow>
          )}
          {models.length ? (
            <>
              <SettingsGroupLabel>By model</SettingsGroupLabel>
              <ItemList label="Usage by model">
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
                      meta={`${account ? `${account}, ` : ''}${spend.turns} ${spend.turns === 1 ? 'turn' : 'turns'}`}
                      spend={spend}
                      title={model}
                    />
                  );
                })}
              </ItemList>
            </>
          ) : null}
          {totals ? (
            <>
              <SettingsGroupLabel>Total</SettingsGroupLabel>
              <SettingsRow title="Tokens">
                <UsageTotal>{totals.tokens}</UsageTotal>
              </SettingsRow>
              <SettingsRow title="Cost">
                <UsageTotal>{totals.cost ?? 'None recorded'}</UsageTotal>
              </SettingsRow>
            </>
          ) : null}
          {data.estimated_sessions ? <EstimatedNote count={data.estimated_sessions} /> : null}
        </>
      )}
    </section>
  );
}

function UsageTotal({ children }: { children: string }) {
  return (
    <span
      className="min-w-0 truncate font-mono text-xs font-semibold tabular-nums"
      title={children}
    >
      {children}
    </span>
  );
}

function EstimatedNote({ count }: { count: number }) {
  const text = `${count} older conversation${count === 1 ? ' is' : 's are'} counted under the model ${count === 1 ? 'it was' : 'they were'} set to: they predate per-model usage.`;
  return (
    <p
      className="flex h-[1.875rem] min-w-0 items-center gap-2 text-xs whitespace-nowrap text-faint"
      data-slot="settings-footnote"
      title={text}
    >
      <InfoIcon aria-hidden="true" className="size-[0.8125rem] shrink-0" />
      <span className="min-w-0 truncate">{text}</span>
    </p>
  );
}
