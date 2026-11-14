import type { InfrastructureInventory } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { ArchiveIcon, ServerIcon, UserRoundIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { SidebarFooter } from '@/components/ui/sidebar';
import type { ConnectionAvailability } from '@/hooks/use-connection-availability';
import { useRepository } from '@/hooks/use-repository';
import { HISTORY_MODE_LABEL } from '@/lib/context-mode';
import { SettingsIcon } from '@/lib/icon-vocabulary';
import { useShortcutPresentation } from '@/lib/shortcuts/hooks';
import { IconButton, NamedTooltip } from './primitives/icon-button';
import { HeldKeyBadge } from './primitives/key-chip';
import { Monogram } from './primitives/monogram';
import { useLocalProfile } from './settings-profile-store';
import { tourAnchor } from '@/lib/onboarding/tour-anchors';
import { t } from '@lingui/core/macro';

const FOOTER_LINK =
  'relative grid size-7 shrink-0 place-items-center rounded-[6px] text-muted-foreground outline-none hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring';

/** The left bar's bottom row: your profile, then Archived, Infrastructure and Settings. */
export function NavigationFooter({
  endpoint,
  from,
  availability,
  onOpenArchived,
}: {
  endpoint: string;
  from: string;
  /** The connected service's last health probe, already polled for the line under CLIO. */
  availability: ConnectionAvailability | undefined;
  onOpenArchived: () => void;
}) {
  const profileName = useLocalProfile().profile.name.trim();
  const returnState = { endpoint, from };
  return (
    <SidebarFooter className="flex-row items-center gap-1 border-t border-sidebar-border p-2 group-data-[collapsible=icon]:flex-col">
      <NamedTooltip label={t`Your profile`} side="top">
        <Link
          className="flex h-9 min-w-0 flex-1 items-center gap-[9px] rounded-[8px] px-1.5 outline-none hover:bg-hover focus-visible:ring-1 focus-visible:ring-ring group-data-[collapsible=icon]:hidden"
          state={returnState}
          to="/settings/profile"
        >
          <Monogram
            fallback={<UserRoundIcon aria-hidden="true" className="size-3.5" />}
            name={profileName}
          />
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-ui text-foreground">
              {profileName || t`Your profile`}
            </span>
            <span className="truncate text-caption text-faint">{t`Local profile`}</span>
          </span>
        </Link>
      </NamedTooltip>
      <IconButton
        icon={<ArchiveIcon />}
        label={t`Archived conversations`}
        onClick={onOpenArchived}
        tooltipSide="top"
      />
      <InfrastructureLink
        endpoint={endpoint}
        returnState={returnState}
        serviceNeedsYou={serviceNeedsYou(availability)}
      />
      <NamedTooltip label={t`Settings`} shortcut="settings" side="top">
        <Link
          aria-label={t`Settings`}
          className={FOOTER_LINK}
          {...tourAnchor('settings')}
          state={returnState}
          to="/settings/general"
        >
          <SettingsIcon aria-hidden="true" className="size-[15px]" />
          <HeldKeyBadge id="settings" />
        </Link>
      </NamedTooltip>
    </SidebarFooter>
  );
}

/**
 * Infrastructure, with an amber flag when a service failed or a computer needs
 * sign-in. The flag is always named too, in the tooltip and accessible name.
 */
function InfrastructureLink({
  endpoint,
  returnState,
  serviceNeedsYou,
}: {
  endpoint: string;
  returnState: { endpoint: string; from: string };
  serviceNeedsYou: boolean;
}) {
  const repository = useRepository();
  const shortcut = useShortcutPresentation('infrastructure');
  // Read what the Infrastructure page last loaded without polling from the left bar.
  const inventory = useQuery<InfrastructureInventory>({
    queryKey: ['infrastructure-inventory', endpoint],
    queryFn: ({ signal }) => repository.infrastructureInventory(signal),
    enabled: false,
  });
  const signIn = inventory.data?.targets.some(
    (host) =>
      host.transport_state === 'reauthentication_required' ||
      host.transport_state === 'disconnected',
  );
  const label = serviceNeedsYou
    ? t`Infrastructure: a service needs attention`
    : signIn
      ? t`Infrastructure: a computer needs sign-in`
      : t`Infrastructure`;
  const reason = serviceNeedsYou || signIn;
  return (
    <NamedTooltip label={label} shortcut="infrastructure" side="top">
      <Link
        aria-keyshortcuts={shortcut?.aria}
        aria-label={label}
        className={FOOTER_LINK}
        data-attention={reason ? 'true' : undefined}
        state={returnState}
        to="/infrastructure"
      >
        <ServerIcon aria-hidden="true" className="size-[15px]" />
        {reason ? (
          <span
            aria-hidden="true"
            className="absolute top-[3px] right-[3px] size-[7px] rounded-full bg-warning ring-2 ring-sidebar"
          />
        ) : null}
        <HeldKeyBadge id="infrastructure" />
      </Link>
    </NamedTooltip>
  );
}

/** A reachable service that reports itself limited; History mode is a choice, not a fault. */
function serviceNeedsYou(availability: ConnectionAvailability | undefined): boolean {
  return availability?.state === 'degraded' && availability.label !== HISTORY_MODE_LABEL;
}
