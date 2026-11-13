import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { vocab } from '@/lib/brand-vocabulary';
import { sshRouteHost, type SshHost } from '@/lib/ssh-hosts';
import { SshHostPicker } from './ssh-host-picker';
import type { SshRouteCompleteness } from './ssh-route-utils';
import { registerSshTarget } from './ssh-target-connection';
import { t, ph } from '@lingui/core/macro';

/** Shared SSH editor backed by the connected CLIO's profiles and durable host inventory. */
export function ConnectedSshHostPicker({
  value,
  disabled,
  onChange,
}: {
  value?: SshHost;
  disabled?: boolean;
  onChange: (host: SshHost | undefined, route: SshRouteCompleteness) => void;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const targets = useQuery({
    queryKey: ['source-ssh-targets', scope],
    queryFn: () => repository.infrastructureTargets(),
  });
  const profiles = useQuery({
    queryKey: ['connected-ssh-profiles', scope],
    queryFn: () => repository.connectedSshProfiles(),
  });
  const saved = (targets.data ?? []).flatMap((target) =>
    target.kind === 'ssh' && target.ssh ? [sshRouteHost(target.ssh, target.label)] : [],
  );
  const hosts = [
    ...saved,
    ...(profiles.data?.profiles ?? [])
      .filter((profile) => !saved.some((host) => host.profile === profile))
      .map((profile) => sshRouteHost({ profile }, profile)),
  ];
  return (
    <div className="space-y-2">
      <SshHostPicker
        value={value}
        disabled={disabled}
        onChange={onChange}
        hostSource={{
          label: t`the connected ${ph({ agent: vocab.agent })}`,
          hosts,
          save: async (host) => {
            const target = await registerSshTarget(repository, host);
            await targets.refetch();
            return sshRouteHost(target.ssh!, target.label);
          },
        }}
      />
      <p className="text-xs text-muted-foreground">
        {t`SSH starts on the connected ${ph({ agent: vocab.agent })}. Add hops to reach the computer hosting the API.`}
      </p>
      {targets.error || profiles.error ? (
        <p role="alert" className="text-sm text-destructive">
          {(targets.error ?? profiles.error)?.message}
        </p>
      ) : null}
    </div>
  );
}
