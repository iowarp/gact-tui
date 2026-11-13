import type { PluginEntry, PluginMarketplace } from '@clio/core/v3';
import { BoxIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  LOCAL_MARKETPLACE,
  marketplaceRow,
  marketplaceShipped,
  marketplaceTitle,
  formatName,
} from '@/lib/extension-library-entries';
import { DeleteIcon, RefreshIcon } from '@/lib/icon-vocabulary';
import { MetaLine, TrustBanner } from './extension-parts';
import { InstalledPluginList } from './installed-plugin-list';
import { MarketplaceActions } from './marketplace-actions';
import { DetailPane } from './primitives/detail-pane';
import { IconButton } from './primitives/icon-button';
import { KeyValueGrid } from './primitives/key-value-grid';
import { StatusIndicator } from './primitives/status-indicator';
import { SettingsGroupLabel } from './settings-row';
import { marketplaceSlot, type MarketplaceManager } from './marketplace-manager';

/** Where a marketplace comes from and what it holds, beside the list. */
export function MarketplaceDetailPane({
  marketplace,
  plugins,
  manager,
  onClose,
  onExplorePlugin,
  onBackup,
  onExport,
  onLocalDetails,
  exportDisabled,
  localCollection,
  placeholder = false,
  className,
}: {
  marketplace: PluginMarketplace;
  plugins: readonly PluginEntry[];
  manager: MarketplaceManager;
  onClose: () => void;
  onExplorePlugin: (plugin: PluginEntry) => void;
  onBackup?: () => void;
  onExport?: () => void;
  onLocalDetails?: () => void;
  exportDisabled?: boolean;
  /** The private local library: your agents, skills and plugins. */
  localCollection?: ReactNode;
  /** Your library before anything is saved: nothing to update or check yet. */
  placeholder?: boolean;
  className?: string;
}) {
  const local = marketplace.name === LOCAL_MARKETPLACE;
  const entry = marketplaceRow(marketplace, plugins);
  const pendingUpdates = entry.kind === 'marketplace' ? entry.pendingUpdates : 0;
  const own = plugins.filter((plugin) => plugin.marketplace === marketplace.name);
  const errors = marketplace.diagnostics.filter((row) => row.severity === 'error').length;
  const name = marketplace.name;
  return (
    <DetailPane
      className={className}
      icon={<BoxIcon />}
      onClose={onClose}
      title={marketplaceTitle(marketplace)}
      actions={
        <>
          {!placeholder ? (
            <IconButton
              disabled={manager.busy}
              icon={<RefreshIcon />}
              label={manager.updating(name) ? 'Updating…' : 'Update'}
              onClick={() => manager.update(name)}
            />
          ) : null}
          {!marketplace.default && !local ? (
            <IconButton
              disabled={manager.busy}
              icon={<DeleteIcon />}
              label="Uninstall"
              onClick={() => manager.requestUninstall(marketplace)}
            />
          ) : null}
          <MarketplaceActions
            checking={manager.checking(name)}
            exportDisabled={exportDisabled}
            name={name}
            onAddRemote={local ? manager.openInstall : undefined}
            onBackup={local ? onBackup : undefined}
            onCheck={placeholder ? undefined : () => manager.check(name)}
            onDetails={local ? onLocalDetails : undefined}
            onExport={local ? onExport : undefined}
            source={local ? undefined : marketplace.source}
          />
        </>
      }
    >
      <MetaLine className="block truncate text-xs text-muted-foreground" parts={entry.meta.slice(1)} />
      <div className="mt-3">
        {!marketplace.trusted || pendingUpdates ? (
          <TrustBanner
            action={marketplaceSlot(marketplace, pendingUpdates, manager)}
            detail="Its plugins can run commands, start servers and run hooks on this service."
            message={
              marketplace.trusted
                ? 'An update changes parts that run here. The installed version keeps running until you trust it.'
                : 'Its plugins can run commands and hooks. Trust only sources you know.'
            }
          />
        ) : null}
        <KeyValueGrid
          items={[
            ...(local
              ? []
              : [
                  { label: 'Source', value: marketplace.source || 'Unknown', mono: true },
                  { label: 'Format', value: formatName(marketplace.format) },
                ]),
            ...(marketplace.commit
              ? [{ label: 'Commit', value: marketplace.commit.slice(0, 12), mono: true }]
              : []),
            {
              label: 'Trust',
              value: (
                <StatusIndicator
                  className="justify-end"
                  label={
                    !marketplace.trusted
                      ? 'Not trusted'
                      : marketplaceShipped(marketplace)
                        ? 'Shipped with the service'
                        : local
                          ? 'On this host'
                          : 'Trusted by you'
                  }
                  tone={marketplace.trusted ? 'success' : 'warning'}
                />
              ),
            },
            ...(marketplace.parent ? [{ label: 'Added by', value: marketplace.parent }] : []),
          ]}
        />
        {marketplace.diagnostics.length ? (
          <>
            <SettingsGroupLabel>
              {errors ? `${errors} ${errors === 1 ? 'problem' : 'problems'}` : 'Notes'}
            </SettingsGroupLabel>
            <ul className="grid gap-1 text-xs">
              {marketplace.diagnostics.map((row, index) => (
                <li
                  className={
                    row.severity === 'error' ? 'text-destructive' : 'text-muted-foreground'
                  }
                  key={`${row.code}:${index}`}
                >
                  {row.message} <span className="font-mono text-muted-foreground">{row.code}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {localCollection ?? (
          <>
            <SettingsGroupLabel>Plugins</SettingsGroupLabel>
            <InstalledPluginList
              label={`Plugins from ${name}`}
              onExplore={onExplorePlugin}
              pending={false}
              plugins={own}
              size="sm"
            />
          </>
        )}
      </div>
    </DetailPane>
  );
}
