import type { FleetAccount } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { Switch } from '@/components/ui/switch';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import {
  accountUsageWords,
  BILLING_ORDER,
  billingLabel,
  spendLabel,
  type UsageMode,
} from '@/lib/fleet-usage';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { providerLogoId } from '@/lib/provider-presentation';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
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

function useDelegation(account: FleetAccount) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  return useMutation({
    mutationFn: (allowed: boolean) => repository.setDelegationAllowed(account.id, allowed),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.key('fleet', settings.endpoint) }),
    onError: (error: Error) => toast.error(error.message),
  });
}

function DelegationSwitch({ account, id }: { account: FleetAccount; id?: string }) {
  const toggle = useDelegation(account);
  return (
    <Switch
      aria-label={`${vocab.agent} may use ${account.label} for delegated work`}
      checked={account.delegation_allowed}
      disabled={toggle.isPending}
      id={id}
      onCheckedChange={(checked) => toggle.mutate(checked)}
      size="sm"
      title={`${vocab.agent} may use this account for delegated work`}
    />
  );
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
      actions={<IconButton icon={<InfoIcon />} label="Details" onClick={onDetails} size="sm" />}
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
        <span className="flex min-w-0" title={words.hint}>
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
    { label: 'Billing', value: billingLabel(account.billing) },
    { label: 'Health', value: account.health.charAt(0).toUpperCase() + account.health.slice(1) },
    ...(account.endpoint ? [{ label: 'Endpoint', value: account.endpoint, mono: true }] : []),
    ...(account.failure ? [{ label: 'Reason', value: account.failure, mono: true }] : []),
  ];
  return (
    <DetailPane
      icon={<ModelSelectorLogo provider={providerLogoId(account.id)} />}
      onClose={onClose}
      title={account.label}
    >
      <div className="grid gap-1" data-slot="usage-account-details">
        <SettingsGroupLabel>Limits</SettingsGroupLabel>
        <UsageSummary
          missingReason={account.usage_missing_reason}
          mode={mode}
          snapshot={account.usage}
        />
        <SettingsGroupLabel className="mt-3">Recorded by {vocab.agent}</SettingsGroupLabel>
        {account.spend ? (
          <SpendSummary spend={account.spend} />
        ) : (
          <p className="text-xs text-muted-foreground">Nothing recorded yet</p>
        )}
        <SettingsGroupLabel className="mt-3">Delegated work</SettingsGroupLabel>
        <label className="flex items-center gap-2 text-[13px]" htmlFor={switchId}>
          <DelegationSwitch account={account} id={switchId} />
          {vocab.agent} may use this account
        </label>
        <SettingsGroupLabel className="mt-3">Technical details</SettingsGroupLabel>
        <KeyValueGrid items={facts} />
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
  const estimated = fleet.data?.estimated_sessions ?? 0;
  return (
    <section aria-label="Usage" className="flex flex-col gap-4">
      {/* The title-row controls end on the list's right edge. */}
      <div className="max-w-[760px]">
        <SettingsSectionHeading
          actions={
            accounts.length ? (
              <SegmentedControl label="Show" onValueChange={choose} options={MODES} value={mode} />
            ) : undefined
          }
          info={`Account limits and usage recorded by ${vocab.agent}.`}
          title="Usage"
        />
      </div>
      {fleet.isPending ? (
        <StateView kind="loading" size="row" title="Loading usage" />
      ) : fleet.error || !fleet.data ? (
        <StateView
          action={{ label: 'Retry', onClick: () => void fleet.refetch() }}
          kind="error"
          size="row"
          title="Usage could not be loaded"
        />
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
            <div className="grid gap-2">
              <div className="max-w-[760px]">
                <SettingsGroupLabel
                  actions={
                    <span className="flex items-center gap-1" data-slot="usage-delegation-caption">
                      Delegated work
                      <InfoTip className="text-faint" label="About delegated work">
                        Turn an account on to let {vocab.agent} run delegated work on it without
                        asking.
                      </InfoTip>
                    </span>
                  }
                  className="mt-0"
                >
                  Accounts
                </SettingsGroupLabel>
                <ItemList className="border-t border-border/70" label="Accounts">
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
              </div>
              {estimated ? (
                <p className="text-xs text-muted-foreground">
                  {estimated} older conversation{estimated === 1 ? ' is' : 's are'} counted under
                  the model {estimated === 1 ? 'it was' : 'they were'} set to: they predate
                  per-model usage.
                </p>
              ) : null}
            </div>
          }
        />
      ) : (
        <div className="max-w-[760px]">
          <StateView
            action={{ label: 'Open Providers', onClick: () => navigate('/settings/providers') }}
            kind="empty"
            size="row"
            title="No account connected"
          />
        </div>
      )}
    </section>
  );
}
