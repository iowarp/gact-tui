import type { FleetAccount } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { t, ph } from '@lingui/core/macro';

/**
 * Whether the agent may run delegated work on `account` without asking. An
 * account that is off is asked about once per conversation instead.
 */
export function DelegationSwitch({
  account,
  id,
  size = 'sm',
}: {
  account: FleetAccount;
  id?: string;
  size?: 'sm' | 'default';
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const toggle = useMutation({
    mutationFn: (allowed: boolean) => repository.setDelegationAllowed(account.id, allowed),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.key('fleet', settings.endpoint) }),
    onError: (error: Error) => toast.error(error.message),
  });
  return (
    <Switch
      aria-label={t`${ph({ agent: vocab.agent })} may use ${ph({ label: account.label })} for delegated work`}
      checked={account.delegation_allowed}
      disabled={toggle.isPending}
      id={id}
      onCheckedChange={(checked) => toggle.mutate(checked)}
      size={size}
      title={t`${ph({ agent: vocab.agent })} may use this account for delegated work`}
    />
  );
}
