import type { FleetAccount } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import { providerLogoId } from '@/lib/provider-presentation';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { BILLING_ORDER, billingLabel, spendLabel, type UsageMode } from '@/lib/fleet-usage';
import { UsageSummary } from './fleet-usage';

const MODE_KEY = 'clio.usage.mode';

function storedMode(): UsageMode {
  try {
    return window.localStorage.getItem(MODE_KEY) === 'remaining' ? 'remaining' : 'used';
  } catch {
    return 'used';
  }
}

function AccountRow({ account, mode }: { account: FleetAccount; mode: UsageMode }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const toggle = useMutation({
    mutationFn: (allowed: boolean) => repository.setDelegationAllowed(account.id, allowed),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.key('fleet', settings.endpoint) }),
    onError: (error: Error) => toast.error(error.message),
  });
  const switchId = `delegation-${account.id}`;
  return (
    <li className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
      <div className="flex min-w-0 items-start gap-3">
        <ModelSelectorLogo
          className="mt-0.5 size-5 shrink-0"
          provider={providerLogoId(account.id)}
        />
        <div className="min-w-0">
          <p className="font-medium">{account.label}</p>
          <p className="text-xs text-muted-foreground">
            {billingLabel(account.billing)}
            {account.health === 'ready' ? '' : ` · ${account.health}`}
          </p>
          {account.spend ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Used here: {spendLabel(account.spend)}
            </p>
          ) : null}
        </div>
      </div>
      <div className="grid min-w-0 gap-3">
        <UsageSummary
          missingReason={account.usage_missing_reason}
          mode={mode}
          snapshot={account.usage}
        />
        <label className="flex items-center gap-2 text-sm" htmlFor={switchId}>
          <Switch
            checked={account.delegation_allowed}
            disabled={toggle.isPending}
            id={switchId}
            onCheckedChange={(checked) => toggle.mutate(checked)}
            size="sm"
          />
          {vocab.agent} may use this account for delegated work
        </label>
      </div>
    </li>
  );
}

/**
 * Every connected account with what it has used and has left: a bar per usage
 * window with its reset, a credit account's balance, what this workspace spent,
 * and whether the agent may run delegated work on it without asking.
 */
export function UsageSettings() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [mode, setMode] = useState<UsageMode>(storedMode);
  const fleet = useQuery({
    queryKey: queryKeys.key('fleet', settings.endpoint),
    queryFn: ({ signal }) => repository.fleet({}, signal),
    refetchInterval: 60_000,
  });
  const choose = (value: string) => {
    if (value !== 'used' && value !== 'remaining') return;
    setMode(value);
    try {
      window.localStorage.setItem(MODE_KEY, value);
    } catch {
      // A per-viewer convenience only: the page works without it.
    }
  };
  if (fleet.isPending) return <p role="status">Loading usage…</p>;
  if (fleet.error || !fleet.data) {
    return (
      <div role="alert">
        Usage could not be loaded. <Button onClick={() => void fleet.refetch()}>Retry</Button>
      </div>
    );
  }
  const accounts = [...fleet.data.accounts].sort(
    (a, b) => BILLING_ORDER.indexOf(a.billing) - BILLING_ORDER.indexOf(b.billing),
  );
  return (
    <section aria-label="Usage" className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Usage</h2>
          <p className="text-sm text-muted-foreground">
            What each connected account has used and has left, and what this workspace spent on it.
          </p>
        </div>
        <ToggleGroup
          aria-label="Show"
          onValueChange={choose}
          size="sm"
          type="single"
          value={mode}
          variant="outline"
        >
          <ToggleGroupItem value="used">Used</ToggleGroupItem>
          <ToggleGroupItem value="remaining">Remaining</ToggleGroupItem>
        </ToggleGroup>
      </div>
      {accounts.length ? (
        <ul className="grid gap-3">
          {accounts.map((account) => (
            <AccountRow account={account} key={account.id} mode={mode} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          No account is connected. Connect one in Model providers.
        </p>
      )}
      {fleet.data.estimated_sessions ? (
        <p className="text-xs text-muted-foreground">
          {fleet.data.estimated_sessions} older conversation
          {fleet.data.estimated_sessions === 1 ? ' is' : 's are'} counted under the model{' '}
          {fleet.data.estimated_sessions === 1 ? 'it was' : 'they were'} set to: they predate
          per-model usage.
        </p>
      ) : null}
    </section>
  );
}
