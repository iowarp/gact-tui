import type { LanguageModelPreset } from '@clio/core/v3';
import { useEffect, useRef, type ReactNode } from 'react';
import { providerUsableModelCount, type ProviderGroup } from './model-picker-model';
import { ProviderComponentStatus } from './provider-component-status';
import { useProviderComponentUpdate } from './provider-component-update';
import { ProviderConnectState } from './provider-connect-state';
import { providerCredentialKind } from '@/lib/provider-availability';
import { useProviderActions } from './provider-actions';
import { ProviderPanelFooter, type ProviderLogOut } from './provider-panel-footer';
import { providerActionError } from './provider-setup-state';

export interface ProviderPanelColumn {
  /** The column's content when it has no rows (setup, or a log in). */
  empty?: ReactNode;
  footer?: ReactNode;
}

/**
 * The models a provider's column lists, as tree children: nothing until the
 * provider is usable.
 */
export function providerColumnModels(group: ProviderGroup) {
  return providerUsableModelCount(group) > 0 ? group.availableChoices : [];
}

interface UseProviderPanelInput {
  group: ProviderGroup | undefined;
  preset: LanguageModelPreset | undefined;
  /** Whether the picker is open: a provider that needs a check is checked once per opening. */
  open: boolean;
  /** A sentence the action row shows over the latest failure (e.g. why a model can't be picked). */
  notice?: string;
}

/**
 * The picker's right-hand panel for the provider in view, driven by the
 * shared action hook every provider surface uses.
 */
export function useProviderPanel({ group, preset, open, notice }: UseProviderPanelInput) {
  const providerActions = useProviderActions({
    presetId: group?.id ?? '',
    apiBase: group?.endpoint ?? preset?.api_base ?? '',
    preset,
  });
  // The provider's SDK update (Claude Code): its running stage drives
  // the same heartbeat and panel text as every other provider action, and a
  // finished update re-checks the provider so its models reflect the new SDK.
  const componentUpdate = useProviderComponentUpdate({
    group,
    open,
    onUpdated: () => providerActions.handshake.mutate(),
  });
  const stage = componentUpdate.stage ?? providerActions.stage;
  const componentStatus = group?.client ? (
    <ProviderComponentStatus group={group} state={componentUpdate} />
  ) : null;

  // A CLI-owned sign-in (Claude Code) the service last saw signed out is asked
  // again when it comes into view, once per opening: the person may have
  // signed in in a terminal since (#1455).
  const autoChecked = useRef(new Set<string>());
  const needsCheck =
    providerCredentialKind(preset) === 'cli' &&
    preset?.is_authenticated === false &&
    preset.status !== 'install_required';
  const providerBusy = Boolean(providerActions.stage);
  const groupId = group?.id;
  useEffect(() => {
    if (!open) {
      autoChecked.current.clear();
      return;
    }
    if (!groupId || !needsCheck || providerBusy || autoChecked.current.has(groupId)) return;
    autoChecked.current.add(groupId);
    providerActions.handshake.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a mutation handle is not a trigger
  }, [open, groupId, needsCheck, providerBusy]);

  if (!group) return { column: {} satisfies ProviderPanelColumn, stage };

  const usable = providerUsableModelCount(group) > 0;
  const logOut: ProviderLogOut | undefined = !preset?.is_authenticated
    ? undefined
    : preset.supports_logout
      ? { label: 'Log out', run: () => providerActions.logout.mutate(), busy: false }
      : preset.requires_api_key
        ? { label: 'Remove key', run: () => providerActions.removeApiKey.mutate(), busy: false }
        : undefined;
  const column: ProviderPanelColumn = usable
    ? {
        footer: (
          <>
            {componentStatus}
            <ProviderPanelFooter
              actions={providerActions}
              error={notice ?? providerActionError(providerActions, group)}
              logOut={logOut}
            />
          </>
        ),
      }
    : { empty: <ProviderConnectState actions={providerActions} group={group} preset={preset} /> };
  return { column, stage };
}
