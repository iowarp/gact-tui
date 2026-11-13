import type { McpServerDefinition, SavedMcpService } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BoxIcon, CopyIcon, GlobeIcon, KeyRoundIcon, PlugIcon, SparklesIcon } from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { toast } from 'sonner';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import {
  useConnectorChanges,
  useConnectors,
  useInvalidateConnectors,
} from '@/hooks/use-connectors';
import { useRepository } from '@/hooks/use-repository';
import { useWindowContentHeight } from '@/hooks/use-window-content-height';
import { useRemoveSavedMcp, useSavedMcpServices } from '@/hooks/use-saved-mcp-services';
import {
  useExtensionsSupported,
  useInstalledAgents,
  usePluginCatalog,
  usePluginMarketplaces,
} from '@/hooks/use-session-agent';
import { connectionScope } from '@/lib/connection-scope';
import {
  copyAddress,
  copyReference,
  defaultAdd,
  EXTENSION_TYPE_LABELS,
  extensionEntries,
  LOCAL_MARKETPLACE,
  LOCAL_PLACEHOLDER,
  type ExtensionEntry,
  type ExtensionType,
} from '@/lib/extension-library-entries';
import { DeleteIcon, RefreshIcon } from '@/lib/icon-vocabulary';
import { serviceTarget } from '@/lib/mcp-service-presentation';
import { queryKeys } from '@/lib/query-keys';
import { newItemKey } from '@/lib/settings-row-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ConnectorLogo } from './connector-need-rows';
import { ConnectorPane } from './connector-pane';
import { ExtensionAddDialog, type ExtensionAdd } from './extension-add-dialog';
import { useDiscoverItems, type DiscoverItem } from './extension-discover';
import { BackupDialog, DiscoverPane, McpConnectionPane } from './extension-library-panes';
import { McpRegistrySection } from './extension-registry-section';
import { ExtensionToolbar, type ExtensionView } from './extension-library-toolbar';
import { ExtensionRow, SlotButton } from './extension-parts';
import { PluginIcon } from './installed-plugin-list';
import { marketplaceSlot, useMarketplaceManager } from './marketplace-manager';
import { MarketplaceActions } from './marketplace-actions';
import { McpSignInDialog } from './mcp-sign-in';
import { PluginDetailPane } from './plugin-explorer';
import { ListDetailLayout } from './primitives/detail-pane';
import { IconButton } from './primitives/icon-button';
import { ItemList } from './primitives/item-row';
import { StateView } from './primitives/state-view';
import { PrivateLocalLibrary } from './private-local-library';
import { SettingsGroupLabel } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';
import { MarketplaceDetailPane } from './settings-plugins';
import { RowConfirm } from './primitives/row-confirm';
import { RemoveSavedMcpDialog } from './settings-saved-mcp';
import { downloadBytes } from './surface-export';

type Detail =
  | { kind: 'connector'; id: string }
  | { kind: 'plugin'; ref: string; pending: boolean; skill?: string }
  | { kind: 'marketplace'; name: string }
  | { kind: 'mcp'; name: string }
  | { kind: 'discover'; key: string };

/** Connectors, plugins, marketplaces and skills: one list, one pane beside it. */
export function ExtensionLibrary(props: {
  initialWorkspaceId?: string;
  initialSessionId?: string;
}) {
  const { settings } = useConnectionSettings();
  return <ExtensionLibraryContents key={connectionScope(settings)} {...props} />;
}

function ExtensionLibraryContents({
  initialWorkspaceId,
}: {
  initialWorkspaceId?: string;
  initialSessionId?: string;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const client = useQueryClient();
  const catalog = usePluginCatalog();
  const marketplaces = usePluginMarketplaces();
  const supported = useExtensionsSupported();
  const agents = useInstalledAgents();
  const saved = useSavedMcpServices();
  const connectorList = useConnectors(supported !== false);
  const invalidateConnectors = useInvalidateConnectors();
  const manager = useMarketplaceManager();
  const servers = useQuery({
    queryKey: queryKeys.key('mcp-servers', settings.endpoint, initialWorkspaceId || 'global'),
    queryFn: ({ signal }) => repository.mcpServers(initialWorkspaceId || undefined, signal),
  });
  const [type, setType] = useState<ExtensionType>('all');
  const [view, setView] = useState<ExtensionView>('yours');
  const [search, setSearch] = useState('');
  const [registrySearch, setRegistrySearch] = useState('');
  const [cursor, setCursor] = useState('');
  const [detail, setDetail] = useState<Detail>();
  const [adding, setAdding] = useState<ExtensionAdd>();
  const [signing, setSigning] = useState<string>();
  const [removing, setRemoving] = useState<SavedMcpService>();
  // A row's Remove asks inline on that row; the detail pane's Remove keeps its dialog.
  const [askingRemove, setAskingRemove] = useState('');
  const removeSaved = useRemoveSavedMcp((service) =>
    setDetail((shown) =>
      shown?.kind === 'mcp' && shown.name === service.name ? undefined : shown,
    ),
  );
  const [backup, setBackup] = useState(false);
  const [localDetails, setLocalDetails] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [paneRoot, paneHeight] = useWindowContentHeight();

  const plugins = catalog.data?.plugins ?? [];
  const installed = marketplaces.data ?? [];
  const services = saved.data ?? [];
  const connectors = connectorList.data ?? [];
  const connectorChanges = useConnectorChanges();
  const serverRows = servers.data ?? [];
  const mine = agents.data?.filter((agent) => agent.kind === 'user') ?? [];
  const hasLocalItems = Boolean(
    plugins.some((plugin) => plugin.marketplace === LOCAL_MARKETPLACE) || mine.length,
  );
  const listed = installed.some((row) => row.name === LOCAL_MARKETPLACE)
    ? installed
    : [...installed, LOCAL_PLACEHOLDER];
  const marketplaceFor = (name: string) => listed.find((row) => row.name === name);
  const term = search.trim();
  const entries = extensionEntries({
    type,
    plugins,
    // Your library appears in All once something is saved to it.
    marketplaces:
      type === 'marketplaces' || hasLocalItems
        ? listed
        : listed.filter((row) => row !== LOCAL_PLACEHOLDER),
    saved: services,
    servers: serverRows,
    connectors,
    changes: connectorChanges,
    term,
  });
  const nothingInstalled =
    !connectors.length &&
    !plugins.length &&
    !installed.length &&
    !services.length &&
    !hasLocalItems;
  const loadError = catalog.error ?? marketplaces.error;
  const loading = supported !== false && (catalog.isPending || marketplaces.isPending);

  const invalidate = () =>
    Promise.all(
      (
        [
          'connectors',
          'plugins',
          'plugin-marketplaces',
          'agents',
          'agent-resolution',
          'session-agent',
          'mcp-configurations',
          'mcp-servers',
          'tools',
        ] as const
      ).map((key) => client.invalidateQueries({ queryKey: queryKeys.key(key, settings.endpoint) })),
    );
  const reconnect = useMutation({
    mutationFn: (server: McpServerDefinition) => repository.reconnectMcpServer(server.id),
    onSuccess: async (_value, server) => {
      await client.invalidateQueries({ queryKey: queryKeys.key('mcp-servers', settings.endpoint) });
      toast.success(`Reconnected ${server.name}`);
    },
    onError: (error: Error) => toast.error('Reconnect failed', { description: error.message }),
  });
  const exportMarketplace = async () => {
    setExporting(true);
    try {
      downloadBytes(
        await repository.exportLocalMarketplace(),
        'application/zip',
        'private-local-marketplace.zip',
      );
    } catch (error) {
      toast.error('Could not export marketplace', {
        description: error instanceof Error ? error.message : 'Try again',
      });
    } finally {
      setExporting(false);
    }
  };

  const { curated, registry, registryItems } = useDiscoverItems({
    enabled: view === 'discover' && (type === 'all' || type === 'mcp'),
    search: registrySearch,
    cursor,
    plugins,
    marketplaces: installed,
    services,
    onAdd: setAdding,
    onAddMarketplace: manager.openInstall,
    onViewSkill: (plugin, skill) =>
      setDetail({ kind: 'plugin', ref: plugin.ref, pending: plugin.pending_trust, skill }),
  });
  const matches = (item: DiscoverItem) =>
    item.types.includes(type) &&
    (!term || `${item.title} ${item.description}`.toLowerCase().includes(term.toLowerCase()));
  const discoverItems = [...curated, ...registryItems];

  const open = (next: Detail) => setDetail(next);
  // The other view's list doesn't hold the open row, so its pane closes with it.
  const changeView = (next: ExtensionView) => {
    setView(next);
    setCursor('');
    setDetail(undefined);
  };
  const close = () => setDetail(undefined);
  const isOpen = (next: Detail) =>
    Boolean(detail) && JSON.stringify(detail) === JSON.stringify(next);
  const changeType = (next: ExtensionType) => {
    setType(next);
    setCursor('');
  };
  const paneClass = 'sticky top-0 self-start h-(--ext-pane-h,min(80dvh,57rem))';

  const pane = (() => {
    if (!detail) return null;
    if (detail.kind === 'connector') {
      const connector = connectors.find((row) => row.id === detail.id);
      return connector ? (
        <ConnectorPane
          className={paneClass}
          connector={connector}
          key={connector.id}
          onClose={close}
          onSignIn={(row) => setSigning(row.id)}
        />
      ) : null;
    }
    if (detail.kind === 'plugin') {
      const plugin = plugins.find((row) => row.ref === detail.ref);
      const marketplace = marketplaceFor(plugin?.marketplace ?? detail.ref.split('/')[0]!);
      return (
        <PluginDetailPane
          className={paneClass}
          initialSkill={detail.skill}
          key={`${detail.ref}:${detail.pending}:${detail.skill}`}
          onCheck={marketplace ? () => manager.check(marketplace.name) : undefined}
          onClose={close}
          onTrust={marketplace ? () => manager.requestTrust(marketplace) : undefined}
          onUpdate={marketplace ? () => manager.update(marketplace.name) : undefined}
          pending={detail.pending}
          reference={detail.ref}
          updating={marketplace ? manager.updating(marketplace.name) : false}
        />
      );
    }
    if (detail.kind === 'marketplace') {
      const marketplace = marketplaceFor(detail.name);
      if (!marketplace) return null;
      const local = marketplace.name === LOCAL_MARKETPLACE;
      return (
        <MarketplaceDetailPane
          className={paneClass}
          exportDisabled={!hasLocalItems || exporting}
          key={marketplace.name}
          localCollection={
            local ? (
              <>
                <SettingsGroupLabel>Saved here</SettingsGroupLabel>
                <PrivateLocalLibrary
                  detailsOpen={localDetails}
                  onDetailsClose={() => setLocalDetails(false)}
                  onExplore={(plugin) =>
                    open({ kind: 'plugin', ref: plugin.ref, pending: plugin.pending_trust })
                  }
                />
              </>
            ) : undefined
          }
          manager={manager}
          marketplace={marketplace}
          onBackup={() => setBackup(true)}
          onClose={close}
          onExplorePlugin={(plugin) =>
            open({ kind: 'plugin', ref: plugin.ref, pending: plugin.pending_trust })
          }
          onExport={() => void exportMarketplace()}
          onLocalDetails={() => setLocalDetails(true)}
          placeholder={marketplace === LOCAL_PLACEHOLDER}
          plugins={plugins}
        />
      );
    }
    if (detail.kind === 'mcp') {
      const entry = entries.find((row) => row.kind === 'mcp' && row.name === detail.name);
      const row =
        entry?.kind === 'mcp'
          ? entry
          : extensionEntries({
              type: 'mcp',
              plugins: [],
              marketplaces: [],
              saved: services,
              servers: serverRows,
            }).find((item) => item.kind === 'mcp' && item.name === detail.name);
      if (row?.kind !== 'mcp') return null;
      return (
        <McpConnectionPane
          className={paneClass}
          entry={row}
          key={row.name}
          onClose={close}
          onReconnect={row.server ? () => reconnect.mutate(row.server!) : undefined}
          onRemove={row.saved ? () => setRemoving(row.saved) : undefined}
          onSignIn={row.saved && row.remote ? () => setSigning(row.name) : undefined}
          reconnecting={reconnect.isPending}
        />
      );
    }
    const item = discoverItems.find((row) => row.key === detail.key);
    return item ? (
      <DiscoverPane className={paneClass} item={item} key={item.key} onClose={close} />
    ) : null;
  })();

  const row = (entry: ExtensionEntry) => {
    if (entry.kind === 'connector') {
      const target: Detail = { kind: 'connector', id: entry.connector.id };
      return (
        <ExtensionRow
          icon={<ConnectorLogo className="size-5 text-[9px]" connector={entry.connector} />}
          key={entry.key}
          meta={entry.meta}
          name={entry.title}
          onExplore={() => open(target)}
          selected={isOpen(target)}
          aligned
          status={entry.status}
        />
      );
    }
    if (entry.kind === 'plugin') {
      const { plugin } = entry;
      const marketplace = marketplaceFor(plugin.marketplace);
      const target: Detail = { kind: 'plugin', ref: plugin.ref, pending: plugin.pending_trust };
      return (
        <ExtensionRow
          icon={<PluginIcon kind={plugin.kind} />}
          key={entry.key}
          meta={entry.meta}
          name={plugin.id}
          onExplore={() => open(target)}
          selected={isOpen(target)}
          aligned
          status={entry.status}
          actions={
            marketplace && marketplace.name !== LOCAL_MARKETPLACE ? (
              <IconButton
                disabled={manager.busy}
                icon={<RefreshIcon />}
                label={`Update ${marketplace.name}`}
                onClick={() => manager.update(marketplace.name)}
              />
            ) : null
          }
          menu={
            <>
              {marketplace && (plugin.pending_trust || !plugin.trusted) ? (
                <DropdownMenuItem onSelect={() => manager.requestTrust(marketplace)}>
                  {plugin.pending_trust ? 'Trust update…' : `Trust ${marketplace.name}…`}
                </DropdownMenuItem>
              ) : null}
              {marketplace ? (
                <DropdownMenuItem onSelect={() => manager.check(marketplace.name)}>
                  Check plugins
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={() => copyReference(plugin.ref)}>
                <CopyIcon aria-hidden="true" />
                Copy reference
              </DropdownMenuItem>
            </>
          }
        />
      );
    }
    if (entry.kind === 'skill') {
      const target: Detail = {
        kind: 'plugin',
        ref: entry.plugin.ref,
        pending: entry.plugin.pending_trust,
        skill: entry.skill,
      };
      return (
        <ExtensionRow
          icon={<SparklesIcon />}
          key={entry.key}
          meta={entry.meta}
          name={entry.skill}
          onExplore={() => open(target)}
          selected={isOpen(target)}
          aligned
          status={entry.status}
        />
      );
    }
    if (entry.kind === 'marketplace') {
      const { marketplace } = entry;
      const local = marketplace.name === LOCAL_MARKETPLACE;
      const placeholder = marketplace === LOCAL_PLACEHOLDER;
      const target: Detail = { kind: 'marketplace', name: marketplace.name };
      return (
        <ExtensionRow
          icon={<BoxIcon />}
          key={entry.key}
          meta={entry.meta}
          name={marketplace.name}
          onDelete={
            !marketplace.default && !local ? () => manager.requestUninstall(marketplace) : undefined
          }
          onExplore={() => open(target)}
          selected={isOpen(target)}
          slot={
            placeholder ? undefined : marketplaceSlot(marketplace, entry.pendingUpdates, manager)
          }
          aligned
          status={entry.status}
          title={entry.title}
          actions={
            <>
              {!marketplace.default && !local ? (
                <IconButton
                  disabled={manager.busy}
                  icon={<DeleteIcon />}
                  label={`Uninstall ${marketplace.name}`}
                  onClick={() => manager.requestUninstall(marketplace)}
                />
              ) : null}
              <MarketplaceActions
                checking={manager.checking(marketplace.name)}
                exportDisabled={!hasLocalItems || exporting}
                name={marketplace.name}
                onAddRemote={local ? manager.openInstall : undefined}
                onBackup={local ? () => setBackup(true) : undefined}
                onCheck={placeholder ? undefined : () => manager.check(marketplace.name)}
                onDetails={
                  local
                    ? () => {
                        open(target);
                        setLocalDetails(true);
                      }
                    : undefined
                }
                onExport={local ? () => void exportMarketplace() : undefined}
                source={local ? undefined : marketplace.source}
              />
            </>
          }
        />
      );
    }
    const target: Detail = { kind: 'mcp', name: entry.name };
    const address = serviceTarget({ saved: entry.saved, server: entry.server });
    // An unavailable connection offers its retry in the slot; otherwise it waits in the hover column.
    const retry = entry.server && entry.status?.tone === 'error' ? entry.server : undefined;
    return (
      <ExtensionRow
        icon={entry.remote ? <GlobeIcon /> : <PlugIcon />}
        key={entry.key}
        meta={entry.meta}
        name={entry.title}
        onDelete={entry.saved ? () => setAskingRemove(entry.key) : undefined}
        onExplore={() => open(target)}
        selected={isOpen(target)}
        aligned
        status={entry.status}
        confirm={
          entry.saved && askingRemove === entry.key ? (
            <RowConfirm
              action="Remove"
              busyAction="Removing…"
              onConfirm={() => removeSaved.mutateAsync(entry.saved!)}
              onKeep={() => setAskingRemove('')}
              question={`Remove ${entry.title}?`}
            />
          ) : undefined
        }
        slot={
          retry ? (
            <SlotButton
              disabled={reconnect.isPending}
              label={`Reconnect ${entry.title}`}
              onClick={() => reconnect.mutate(retry)}
            >
              Reconnect
            </SlotButton>
          ) : undefined
        }
        actions={
          <>
            {entry.server && !retry ? (
              <IconButton
                disabled={reconnect.isPending}
                icon={<RefreshIcon />}
                label={`Reconnect ${entry.title}`}
                onClick={() => reconnect.mutate(entry.server!)}
              />
            ) : null}
            {entry.saved ? (
              <IconButton
                icon={<DeleteIcon />}
                label={`Remove ${entry.title}`}
                onClick={() => setAskingRemove(entry.key)}
              />
            ) : null}
          </>
        }
        menu={
          entry.saved?.transport !== undefined && entry.remote ? (
            <>
              <DropdownMenuItem onSelect={() => setSigning(entry.name)}>
                <KeyRoundIcon aria-hidden="true" />
                Sign in…
              </DropdownMenuItem>
              {address ? (
                <DropdownMenuItem onSelect={() => copyAddress(address.full)}>
                  <CopyIcon aria-hidden="true" />
                  Copy address
                </DropdownMenuItem>
              ) : null}
            </>
          ) : address ? (
            <DropdownMenuItem onSelect={() => copyAddress(address.full)}>
              <CopyIcon aria-hidden="true" />
              {entry.remote ? 'Copy address' : 'Copy command'}
            </DropdownMenuItem>
          ) : undefined
        }
      />
    );
  };

  const discoverRow = (item: DiscoverItem) => {
    const target: Detail = { kind: 'discover', key: item.key };
    return (
      <ExtensionRow
        icon={item.icon}
        key={item.key}
        meta={item.meta}
        name={item.title}
        onExplore={() => open(target)}
        selected={isOpen(target)}
        slot={
          <SlotButton
            disabled={supported !== true && item.action.label !== 'View'}
            label={`${item.action.label} ${item.title}`}
            onClick={item.action.run}
            reason={
              supported === false
                ? 'Installing needs a newer agent service'
                : 'Checking the agent service…'
            }
          >
            {item.action.label}
          </SlotButton>
        }
        aligned
      />
    );
  };

  // FP-D4: under Connectors, suggest catalog connectors; other MCP servers keep their heading.
  const suggestions =
    type === 'mcp'
      ? []
      : curated.filter((item) => item.suggested && !item.installed && matches(item));
  const catalogOff = entries.filter(
    (entry) => entry.kind === 'connector' && !entry.connector.enabled,
  );
  const yours = loadError ? (
    <div title={loadError.message}>
      <StateView
        action={{
          label: 'Retry',
          onClick: () => {
            void catalog.refetch();
            void marketplaces.refetch();
          },
        }}
        kind="error"
        size="row"
        title="Extensions couldn’t be loaded."
      />
    </div>
  ) : loading ? (
    <StateView kind="loading" size="row" title="Loading extensions…" />
  ) : nothingInstalled && type === 'all' && !term ? (
    <StateView
      action={{ label: 'Add a marketplace', onClick: manager.openInstall }}
      kind="empty"
      secondaryAction={{ label: 'Discover', onClick: () => changeView('discover') }}
      size="row"
      title="No extensions yet."
    />
  ) : (
    <>
      {entries.length ? (
        <ItemList label="Extensions">{entries.map(row)}</ItemList>
      ) : (
        <StateView
          kind="empty"
          size="row"
          title={
            term
              ? `No extensions match “${term}”.`
              : `No ${EXTENSION_TYPE_LABELS[type].toLowerCase()} yet.`
          }
        />
      )}
      {suggestions.length ? (
        <>
          <SettingsGroupLabel>Discover</SettingsGroupLabel>
          <ItemList label="Suggested extensions">{suggestions.map(discoverRow)}</ItemList>
        </>
      ) : null}
    </>
  );
  const shownCurated = curated.filter(matches);
  const showRegistry = type === 'all' || type === 'mcp';
  const discover = (
    <>
      {type === 'mcp' && catalogOff.length ? (
        <>
          <SettingsGroupLabel>Connector catalog</SettingsGroupLabel>
          <ItemList label="Connectors to enable">{catalogOff.map(row)}</ItemList>
        </>
      ) : null}
      {shownCurated.length ? (
        <>
          <SettingsGroupLabel>
            {type === 'mcp' ? 'MCP servers you add yourself' : 'Suggested'}
          </SettingsGroupLabel>
          <ItemList label="Suggested extensions">{shownCurated.map(discoverRow)}</ItemList>
        </>
      ) : null}
      {showRegistry ? (
        <McpRegistrySection
          cursor={cursor}
          items={registryItems}
          onCursor={setCursor}
          registry={registry}
          renderItem={discoverRow}
        />
      ) : null}
      {!shownCurated.length && !showRegistry ? (
        <StateView kind="empty" size="row" title="No suggestions match." />
      ) : null}
    </>
  );

  const list = (
    <div
      className="@container/ext min-w-0 pt-4 pr-5 pb-17 sm:pr-7"
      onKeyDown={newItemKey(
        supported === true
          ? () => (type === 'marketplaces' ? manager.openInstall() : setAdding(defaultAdd(type)))
          : undefined,
      )}
    >
      <SettingsSectionHeading
        description="Connectors, plugins, marketplaces and skills for your agents."
        title="Extensions"
      />
      <ExtensionToolbar
        onAdd={setAdding}
        onAddMarketplace={manager.openInstall}
        onSearchChange={setSearch}
        onSearchSubmit={(next) => {
          setRegistrySearch(next);
          setCursor('');
        }}
        onTypeChange={changeType}
        onViewChange={changeView}
        search={search}
        supported={supported}
        type={type}
        view={view}
      />
      {catalog.data?.default_marketplace_error ? (
        <div className="mt-3" title={catalog.data.default_marketplace_error.message}>
          <StateView
            kind="error"
            size="row"
            title="The shipped marketplace couldn’t be installed; other marketplaces still work."
          />
        </div>
      ) : null}
      <div className="mt-3">{view === 'yours' ? yours : discover}</div>
      {manager.report}
    </div>
  );

  return (
    <div
      className="-mt-4 -mr-5 -mb-17 flex min-w-0 sm:-mr-7"
      ref={paneRoot}
      style={
        paneHeight
          ? ({
              minHeight: paneHeight,
              ['--ext-pane-h' as string]: `${paneHeight}px`,
            } as CSSProperties)
          : undefined
      }
    >
      <ListDetailLayout className="min-w-0 flex-1 items-stretch" detail={pane} list={list} />
      {manager.dialogs}
      {backup ? (
        <BackupDialog
          exporting={exporting}
          hasLocalItems={hasLocalItems}
          onClose={() => setBackup(false)}
          onExport={() => void exportMarketplace()}
        />
      ) : null}
      {adding ? (
        <ExtensionAddDialog
          choice={adding}
          connections={services}
          key={`${scope}:${adding.kind}`}
          onClose={() => setAdding(undefined)}
          onSaved={invalidate}
          onSignIn={setSigning}
        />
      ) : null}
      {signing ? (
        <McpSignInDialog
          key={`${scope}:${signing}`}
          name={signing}
          onClose={() => setSigning(undefined)}
          onConnected={() => void invalidateConnectors()}
          title={
            connectors.find((row) => row.id === signing)?.name ??
            services.find((row) => row.name === signing)?.label
          }
        />
      ) : null}
      <RemoveSavedMcpDialog
        onClose={() => {
          if (removing && detail?.kind === 'mcp' && detail.name === removing.name) close();
          setRemoving(undefined);
        }}
        service={removing}
      />
    </div>
  );
}
