import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { providerCredentialKind } from '@/lib/provider-availability';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useProviderActions } from './provider-actions';
import type { ProviderActionFlow } from './provider-action-steps';
import { ProviderSetupAction } from './provider-setup-action';
import { providerActionError } from './provider-setup-state';

interface TurnProviderSignInProps {
  providerId: string;
  providerLabel: string;
}

/**
 * The failed turn's own way back in: the SAME provider action the model
 * picker offers (shared action hook + setup control). A provider CLIO signs
 * in itself gets its browser sign-in; a provider whose own CLI owns the login
 * (Claude Code) gets the check that picks up a sign-in made in its CLI.
 */
export function TurnProviderSignIn({ providerId, providerLabel }: TurnProviderSignInProps) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const configuration = useQuery({
    queryKey: queryKeys.key('language-model-configuration', settings.endpoint),
    queryFn: ({ signal }) => repository.languageModelConfiguration(signal),
  });
  const preset = configuration.data?.presets.find((row) => row.id === providerId);
  const actions = useProviderActions({
    presetId: providerId,
    apiBase: preset?.api_base ?? '',
    preset,
  });
  const flow: ProviderActionFlow =
    providerCredentialKind(preset) === 'sign_in' ? 'sign_in' : 'check';
  const failure = actions.stage ? undefined : providerActionError(actions, providerLabel);
  return (
    <div className="mt-2 flex flex-col gap-1.5" data-slot="turn-provider-sign-in">
      <ProviderSetupAction
        actions={actions}
        align="start"
        failed={Boolean(failure)}
        flow={flow}
        loginLabel="Sign in again"
        offerCode={preset?.provider === 'codex'}
        preset={preset}
        providerLabel={providerLabel}
      />
      {failure ? (
        <p className="text-sm text-destructive" role="alert">
          {failure}
        </p>
      ) : null}
    </div>
  );
}
