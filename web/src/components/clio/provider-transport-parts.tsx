import type { LanguageModelPreset } from '@clio/core/v3';
import { LoaderCircleIcon } from 'lucide-react';
import { InfoTip } from './info-tip';
import type { ProviderGroup } from './model-picker-model';
import type { useProviderActions } from './provider-actions';
import { ProviderSetupAction } from './provider-setup-action';
import { providerActionError } from './provider-setup-state';
import type { TransportSection } from './provider-transport-state';

/** A transport section's heading: its short name, its hover explanation, and a running stage. */
export function TransportLabel({
  section,
  stage,
  focusable = false,
}: {
  section: TransportSection;
  stage?: string;
  focusable?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-1.5 px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground"
      data-slot="transport-label"
      data-transport={section.transport.id}
    >
      {section.label}
      <InfoTip focusable={focusable} label={`About ${section.label}`}>
        {section.info}
      </InfoTip>
      {stage ? (
        <span className="flex items-center gap-1 font-normal" data-slot="transport-stage" role="status">
          <LoaderCircleIcon aria-hidden="true" className="size-3 animate-spin" />
          {stage}
        </span>
      ) : null}
    </div>
  );
}

export function TransportLogin({
  actions,
  group,
  preset,
  section,
}: {
  actions: ReturnType<typeof useProviderActions>;
  group: ProviderGroup;
  preset: LanguageModelPreset | undefined;
  section: TransportSection;
}) {
  const failure = actions.stage ? undefined : providerActionError(actions, group.name);
  return (
    <div className="flex flex-col items-start gap-2 px-3">
      <ProviderSetupAction
        actions={actions}
        align="start"
        flow="sign_in"
        offerCode
        preset={preset}
        providerLabel={`${group.name} ${section.label}`}
      />
      {failure ? (
        <p className="text-xs text-destructive" role="alert">
          {failure}
        </p>
      ) : null}
    </div>
  );
}

export function OrSeparator() {
  return (
    <div
      aria-hidden="true"
      className="flex shrink-0 items-center gap-3 px-3 py-1 text-xs text-muted-foreground"
      data-slot="transport-separator"
    >
      <span className="h-px flex-1 bg-border" />
      or
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
