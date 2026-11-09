import type { LanguageModelPreset } from '@clio/core/v3';
import { CircleArrowUpIcon, LoaderCircleIcon } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { providerUsableModelCount, type ProviderGroup } from './model-picker-model';
import { ProviderComponentStatus } from './provider-component-status';
import { useProviderComponentUpdate } from './provider-component-update';
import { ProviderConnectState } from './provider-connect-state';
import { providerCredentialKind } from '@/lib/provider-availability';
import { providerManagedClientVendor } from '@/lib/provider-presentation';
import { SettingsIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { useProviderActions } from './provider-actions';
import { ProviderPanelFooter, type ProviderLogOut } from './provider-panel-footer';
import { providerActionError } from './provider-setup-state';
import { ProviderEndpointEditor } from './provider-endpoint-editor';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { NamedTooltip } from './primitives/icon-button';
import { Link, useInRouterContext } from 'react-router-dom';

export interface ProviderPanelColumn {
  /** The column's content when it has no rows (setup, or a log in). */
  empty?: ReactNode;
  /** Setup under the providers: the endpoint editor and client status. */
  footer?: ReactNode;
  /** The provider bar: the picker footer's leading segment. */
  bar?: ReactNode;
  /** One column: the same actions as the row that ends the provider's group. */
  manage?: ReactNode;
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
  /** Check a signed-out CLI sign-in once when it comes into view; on by default. */
  autoCheck?: boolean;
  /** The narrowest manage row folds its icon actions into one More menu. */
  foldActions?: boolean;
}

/**
 * The picker's right-hand panel for the provider in view, driven by the
 * shared action hook every provider surface uses.
 */
export function useProviderPanel({
  group,
  preset,
  open,
  notice,
  onClose,
  autoCheck = true,
  foldActions = false,
}: UseProviderPanelInput) {
  const inRouter = useInRouterContext();
  const providerActions = useProviderActions({
    presetId: group?.id ?? '',
    apiBase: group?.endpoint ?? preset?.api_base ?? '',
    preset,
  });
  // The provider's client update (Claude Code, direct Codex, GitHub Copilot): its running stage drives
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
    group && providerManagedClientVendor(preset?.provider) ? (
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
    autoCheck &&
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
  const settingsHref = `/settings/providers?provider=${encodeURIComponent(group.id)}`;
  const settingsIcon = <SettingsIcon aria-hidden="true" />;
  const settingsLink = (className?: string) => (
    <NamedTooltip label="Provider settings" side="top">
      <Button
        asChild
        className={cn(
          'shrink-0 text-muted-foreground hover:bg-hover hover:text-foreground',
          className,
        )}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        {inRouter ? (
          <Link aria-label="Provider settings" to={settingsHref} onClick={onClose}>
            {settingsIcon}
          </Link>
        ) : (
          <a aria-label="Provider settings" href={settingsHref} onClick={onClose}>
            {settingsIcon}
          </a>
        )}
      </Button>
    </NamedTooltip>
  );
  const settings = settingsLink();
  const setup = (
    <>
      {preset ? (
        <ProviderEndpointEditor key={group.id} preset={preset} endpoint={group.endpoint} />
      ) : null}
      {componentStatus}
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
  const hasSetup = Boolean(preset) || Boolean(componentStatus);
  // The client update folds into the manage row, as the spec's provider bar
  // does ("Update to 0.33"); its version check stays in Settings.
  const updateTo = componentUpdate.components?.update_available
    ? componentUpdate.components.target_version
    : undefined;
  const update = componentUpdate.stage ? (
    <span
      className="flex shrink-0 items-center gap-1 text-muted-foreground"
      data-slot="provider-component-stage"
      role="status"
    >
      <LoaderCircleIcon aria-hidden="true" className="size-3 animate-spin" />
      {componentUpdate.stage}
    </span>
  ) : updateTo ? (
    <Button
      className="h-[22px] shrink-0 gap-[5px] rounded-[6px] px-2 text-[11px] font-semibold text-accent-foreground"
      data-slot="provider-update-available"
      disabled={Boolean(providerActions.stage)}
      onClick={componentUpdate.update}
      size="xs"
      type="button"
      variant="outline"
    >
      <CircleArrowUpIcon aria-hidden="true" className="size-3" />
      Update to {updateTo}
    </Button>
  ) : null;
  const manageSettings = settingsLink('size-[22px] [&_svg]:size-[13px]');
  const settingsItem = (
    <DropdownMenuItem asChild>
      {inRouter ? (
        <Link to={settingsHref} onClick={onClose}>
          {settingsIcon}
          Provider settings
        </Link>
      ) : (
        <a href={settingsHref} onClick={onClose}>
          {settingsIcon}
          Provider settings
        </a>
      )}
    </DropdownMenuItem>
  );
  const column: ProviderPanelColumn = {
    ...(usable
      ? {}
      : {
          empty: <ProviderConnectState actions={providerActions} group={group} preset={preset} />,
        }),
    footer: hasSetup ? setup : undefined,
    bar: usable ? (
      <ProviderPanelFooter
        actions={providerActions}
        error={notice ?? providerActionError(providerActions, group)}
        group={group}
        info={providerActions.refreshNotice}
        settings={settings}
        logOut={logOut}
      />
    ) : (
      <ProviderPanelFooter group={group} settings={settings} />
    ),
    manage: usable ? (
      <ProviderPanelFooter
        actions={providerActions}
        error={notice ?? providerActionError(providerActions, group)}
        group={group}
        info={providerActions.refreshNotice}
        logOut={logOut}
        settings={manageSettings}
        settingsItem={settingsItem}
        fold={foldActions}
        update={update}
        variant="manage"
      />
    ) : (
      <ProviderPanelFooter
        group={group}
        settings={manageSettings}
        settingsItem={settingsItem}
        fold={foldActions}
        update={update}
        variant="manage"
      />
    ),
  };
  return { column, stage };
}
