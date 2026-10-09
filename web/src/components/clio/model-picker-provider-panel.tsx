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
import { ProviderEndpointEditor } from './provider-endpoint-editor';
import { Button } from '@/components/ui/button';
import { Link, useInRouterContext } from 'react-router-dom';

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
  onClose?: () => void;
}

/**
 * The picker's right-hand panel for the provider in view, driven by the
 * shared action hook every provider surface uses.
 */
export function useProviderPanel({ group, preset, open, notice, onClose }: UseProviderPanelInput) {
  const inRouter = useInRouterContext();
  const providerActions = useProviderActions({
    presetId: group?.id ?? '',
    apiBase: group?.endpoint ?? preset?.api_base ?? '',
    preset,
  });
  // The provider's client update (Claude Code and direct Codex): its running stage drives
  // the same heartbeat and panel text as every other provider action, and a
  // finished update re-checks the provider so its models reflect the new SDK.
  const componentUpdate = useProviderComponentUpdate({
    group,
    preset,
    open,
    onUpdated: () => providerActions.handshake.mutate(),
  });
  const stage = componentUpdate.stage ?? providerActions.stage;
  const componentStatus =
    group && (preset?.provider === 'claude_code' || preset?.provider === 'codex') ? (
      <ProviderComponentStatus
        group={group}
        state={componentUpdate}
        busy={Boolean(providerActions.stage)}
      />
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
  const setup = (
    <>
      {preset ? (
        <ProviderEndpointEditor key={group.id} preset={preset} endpoint={group.endpoint} />
      ) : null}
      {componentStatus}
      <div className="flex shrink-0 border-t px-2 py-1.5">
        <Button asChild size="sm" type="button" variant="ghost">
          {inRouter ? (
            <Link
              to={`/settings/providers?provider=${encodeURIComponent(group.id)}`}
              onClick={onClose}
            >
              Provider settings
            </Link>
          ) : (
            <a
              href={`/settings/providers?provider=${encodeURIComponent(group.id)}`}
              onClick={onClose}
            >
              Provider settings
            </a>
          )}
        </Button>
      </div>
    </>
  );

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
            {setup}
            <ProviderPanelFooter
              actions={providerActions}
              error={notice ?? providerActionError(providerActions, group)}
              info={providerActions.refreshNotice}
              logOut={logOut}
            />
          </>
        ),
      }
    : {
        empty: <ProviderConnectState actions={providerActions} group={group} preset={preset} />,
        footer: setup,
      };
  return { column, stage };
}
