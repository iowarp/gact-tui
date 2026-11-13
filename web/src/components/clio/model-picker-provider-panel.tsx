import type { LanguageModelPreset } from '@clio/core/v3';
import {
  CircleArrowUpIcon,
  DownloadIcon,
  KeyRoundIcon,
  LoaderCircleIcon,
  LogInIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { providerUsableModelCount, type ProviderGroup } from './model-picker-model';
import { ProviderComponentStatus } from './provider-component-status';
import { useProviderComponentUpdate } from './provider-component-update';
import { ProviderConnectState } from './provider-connect-state';
import { providerCredentialKind, providerNeedsReauthentication } from '@/lib/provider-availability';
import { providerManagedClientVendor } from '@/lib/provider-presentation';
import { CheckConnectionIcon, SettingsIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { useProviderActions } from './provider-actions';
import { ProviderLoginButton } from './provider-login-button';
import { ProviderPanelFooter, type ProviderLogOut } from './provider-panel-footer';
import { ProviderSetupAction } from './provider-setup-action';
import { providerActionError, providerSetupFlow } from './provider-setup-state';
import { RefreshButton } from './refresh-button';
import { ProviderEndpointEditor } from './provider-endpoint-editor';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { NamedTooltip } from './primitives/icon-button';
import { Link, useInRouterContext } from 'react-router-dom';
import { t } from '@lingui/core/macro';

export interface ProviderPanelColumn {
  /** The column's content when it has no rows (setup, or a log in). */
  empty?: ReactNode;
  /** Setup under the providers: the endpoint editor and client status. */
  footer?: ReactNode;
  /** The provider bar: the picker footer's leading segment. */
  bar?: ReactNode;
  /** One column: the same actions as the row that ends the provider's group. */
  manage?: ReactNode;
  /** Under the manage row while a fix needs the person: the key field or the sign-in hand-off. */
  manageDetail?: ReactNode;
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
  const [keyEntry, setKeyEntry] = useState(false);
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
    <NamedTooltip label={t`Provider settings`} side="top">
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
          <Link aria-label={t`Provider settings`} to={settingsHref} onClick={onClose}>
            {settingsIcon}
          </Link>
        ) : (
          <a aria-label={t`Provider settings`} href={settingsHref} onClick={onClose}>
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
      ? { label: t`Log out`, run: () => providerActions.logout.mutate(), busy: false }
      : preset.requires_api_key
        ? { label: t`Remove key`, run: () => providerActions.removeApiKey.mutate(), busy: false }
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
      className="h-[22px] min-w-0 shrink gap-[5px] rounded-[6px] px-2 text-caption font-semibold text-accent-foreground"
      data-slot="provider-update-available"
      disabled={Boolean(providerActions.stage)}
      onClick={componentUpdate.update}
      size="xs"
      title={t`Update to ${updateTo}`}
      type="button"
      variant="outline"
    >
      <CircleArrowUpIcon aria-hidden="true" className="size-3 shrink-0" />
      <span className="min-w-0 truncate">{t`Update to ${updateTo}`}</span>
    </Button>
  ) : null;
  const manageSettings = settingsLink('size-[22px] [&_svg]:size-[13px]');
  const settingsMenuItem = (label: string) => (
    <DropdownMenuItem asChild>
      {inRouter ? (
        <Link to={settingsHref} onClick={onClose}>
          {settingsIcon}
          {label}
        </Link>
      ) : (
        <a href={settingsHref} onClick={onClose}>
          {settingsIcon}
          {label}
        </a>
      )}
    </DropdownMenuItem>
  );
  const settingsItem = settingsMenuItem(t`Provider settings`);
  // A provider that is not usable yet ends its group with its one fix, inline:
  // the Log in split, Add key, Install or Check again (the spec's provider bar).
  const flow = providerSetupFlow(group, preset);
  const refused = providerNeedsReauthentication(preset, group.failure);
  const setupBusy = Boolean(providerActions.stage);
  const logIn = () => providerActions.authenticate.mutate('browser');
  const useCode =
    preset?.provider === 'codex' ? () => providerActions.authenticate.mutate('device') : undefined;
  const checkLabel =
    group.health === 'setup' ? t({ message: 'Check', context: 'verb' }) : t`Check again`;
  const compactButton = 'h-[22px] shrink-0 gap-[5px] rounded-[6px] px-2 text-caption';
  const manageSetup =
    flow === 'sign_in' ? (
      <ProviderLoginButton
        disabled={setupBusy}
        label={refused ? t`Sign in again` : t`Log in`}
        menuItems={settingsMenuItem(t`Set up in provider settings`)}
        onLogIn={logIn}
        onUseCode={useCode}
        size="xs"
      />
    ) : flow === 'api_key' ? (
      <Button
        aria-expanded={keyEntry}
        className={compactButton}
        disabled={setupBusy}
        onClick={() => setKeyEntry((current) => !current)}
        size="xs"
        type="button"
        variant="outline"
      >
        <KeyRoundIcon data-icon="inline-start" />
        {t`Add key`}
      </Button>
    ) : flow === 'install' ? (
      <Button
        className={compactButton}
        disabled={setupBusy}
        onClick={() => providerActions.installProvider.mutate()}
        size="xs"
        type="button"
        variant="outline"
      >
        <DownloadIcon data-icon="inline-start" />
        {t`Install`}
      </Button>
    ) : (
      <RefreshButton
        className="size-[22px] shrink-0 text-muted-foreground hover:text-foreground [&_svg]:size-[13px]"
        disabled={setupBusy}
        iconOnly
        idleIcon={CheckConnectionIcon}
        label={checkLabel}
        onRefresh={() => providerActions.handshake.mutateAsync()}
        refreshing={providerActions.handshake.isPending}
        size="icon-xs"
        type="button"
        variant="ghost"
      />
    );
  const manageSetupItems =
    flow === 'sign_in' ? (
      <>
        <DropdownMenuItem disabled={setupBusy} onSelect={logIn}>
          <LogInIcon aria-hidden="true" />
          {refused ? t`Sign in again` : t`Log in`}
        </DropdownMenuItem>
        {useCode ? (
          <DropdownMenuItem disabled={setupBusy} onSelect={useCode}>
            {t`Log in with a code instead`}
          </DropdownMenuItem>
        ) : null}
      </>
    ) : flow === 'api_key' ? (
      <DropdownMenuItem disabled={setupBusy} onSelect={() => setKeyEntry(true)}>
        <KeyRoundIcon aria-hidden="true" />
        {t`Add key`}
      </DropdownMenuItem>
    ) : flow === 'install' ? (
      <DropdownMenuItem
        disabled={setupBusy}
        onSelect={() => providerActions.installProvider.mutate()}
      >
        <DownloadIcon aria-hidden="true" />
        {t`Install`}
      </DropdownMenuItem>
    ) : (
      <DropdownMenuItem
        disabled={setupBusy}
        onSelect={() => void providerActions.handshake.mutateAsync()}
      >
        <CheckConnectionIcon aria-hidden="true" />
        {checkLabel}
      </DropdownMenuItem>
    );
  // The key field, or the sign-in hand-off (browser, code, paste) while a log in waits.
  const manageDetail =
    !usable && (providerActions.authFlow || (keyEntry && flow === 'api_key')) ? (
      <div
        className="w-full pe-2 pb-2"
        data-slot="provider-manage-detail"
        // The list's arrow and Enter keys stay with the picker's search field.
        onKeyDown={(event) => event.stopPropagation()}
      >
        <ProviderSetupAction
          actions={providerActions}
          align="start"
          flow={flow}
          loginLabel={refused ? t`Sign in again` : undefined}
          offerCode={Boolean(useCode)}
          preset={preset}
          providerLabel={group.name}
        />
      </div>
    ) : undefined;
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
        actions={providerActions}
        error={providerActionError(providerActions, group)}
        group={group}
        settings={manageSettings}
        settingsItem={settingsItem}
        setup={manageSetup}
        setupItems={manageSetupItems}
        fold={foldActions}
        update={update}
        variant="manage"
      />
    ),
    manageDetail,
  };
  return { column, stage };
}
