import type { LanguageModelPreset } from '@clio/core/v3';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import { IconTile } from '@/components/reui/icon-tile';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { providerLogoId } from '@/lib/provider-presentation';
import type { ProviderGroup } from './model-picker-model';
import { ProviderSetupAction } from './provider-setup-action';
import {
  providerActionError,
  providerSetupFlow,
  providerSetupSentence,
  type ProviderActions,
} from './provider-setup-state';

interface ProviderConnectStateProps {
  group: ProviderGroup;
  preset: LanguageModelPreset | undefined;
  actions: ProviderActions;
}

/**
 * A provider that is not usable yet, in the picker's model column: its logo,
 * ONE plain sentence (its reason, or what to do), and the ONE action that
 * fixes it -- with the action's live steps while it runs and, if it fails,
 * the failure in place of the sentence.
 */
export function ProviderConnectState({ group, preset, actions }: ProviderConnectStateProps) {
  const flow = providerSetupFlow(group, preset);
  const failure = actions.stage ? undefined : providerActionError(actions, group.name);
  const refused = Boolean(preset?.status_message?.includes('argonne_reauthentication_required'));
  return (
    <Empty className="h-full gap-4 border-0 p-6" data-slot="provider-connect-state">
      <EmptyHeader>
        <EmptyMedia>
          <IconTile aria-hidden="true" size="xl" variant="frame">
            <ModelSelectorLogo className="size-7" provider={providerLogoId(group.id)} />
          </IconTile>
        </EmptyMedia>
        <EmptyDescription
          className={failure ? 'text-destructive' : 'text-foreground'}
          data-slot="provider-connect-sentence"
          role={failure ? 'alert' : undefined}
        >
          {failure ?? providerSetupSentence(group, flow)}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="max-w-sm">
        <ProviderSetupAction
          actions={actions}
          failed={group.health === 'degraded' || group.health === 'unavailable'}
          flow={flow}
          loginLabel={refused ? 'Log in again' : undefined}
          offerCode={preset?.provider === 'codex'}
          preset={preset}
          providerLabel={group.name}
        />
      </EmptyContent>
    </Empty>
  );
}
