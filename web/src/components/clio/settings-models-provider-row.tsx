import { ArrowRightIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  providerGroupStatus,
  providerSettingsHref,
  type ProviderGroup,
} from './model-picker-model';
import { ProviderHeartbeat } from './provider-heartbeat';

/**
 * The ONE thing Settings > Models shows about a provider that is not ready:
 * a compact row -- heartbeat, name, state -- linking to that provider on
 * Settings > Providers, where its sign-in, key and checks live. Never an
 * inline form.
 */
export function ProviderSetupRow({ group }: { group: ProviderGroup }) {
  const state = providerGroupStatus(group).label;
  return (
    <div
      className="flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
      data-slot="provider-setup-row"
    >
      <ProviderHeartbeat group={group} />
      <span className="min-w-0 truncate font-medium">{group.name}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{state}</span>
      <Button asChild size="sm" variant="outline">
        <Link to={providerSettingsHref(group.id)}>
          {group.health === 'setup' ? 'Set up' : 'Review'}
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
      </Button>
    </div>
  );
}
