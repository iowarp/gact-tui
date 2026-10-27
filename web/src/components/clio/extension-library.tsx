import type { SavedMcpService, McpRegistryPage } from '@clio/core/v3';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpenIcon, CableIcon, PackageIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

import { ExternalLink } from '@/components/ui/external-link';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRepository } from '@/hooks/use-repository';
import {
  usePluginCatalog,
  usePluginMarketplaces,
  useExtensionsSupported,
} from '@/hooks/use-session-agent';
import { useSavedMcpServices } from '@/hooks/use-saved-mcp-services';
import { connectionScope } from '@/lib/connection-scope';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ExtensionAddDialog, ExtensionAddMenu, type ExtensionAdd } from './extension-add-dialog';
import { InstalledPluginList } from './installed-plugin-list';
import { McpSignInDialog } from './mcp-sign-in';
import { MarketplaceSettings } from './settings-plugins';
import { PluginExplorer } from './plugin-explorer';
import { downloadBytes } from './surface-export';
import { McpConnectionDetails as ConnectionFields } from './mcp-connection-details';
import { InventoryList } from './mcp-inventory';
import { WrenchIcon } from 'lucide-react';

function registryChoice(server: McpRegistryPage['servers'][number]['server']): ExtensionAdd {
  const title = server.title || server.name.split('/').at(-1);
  if (server.remotes[0]?.url) return { kind: 'remote', url: server.remotes[0].url, title };
  const pkg = server.packages.find(
    (row) => row.registryType === 'pypi' || row.registryType === 'npm',
  );
  if (pkg?.registryType === 'pypi')
    return {
      kind: 'local',
      title,
      command: 'uvx',
      args: [pkg.identifier + (pkg.version ? `==${pkg.version}` : '')],
    };
  if (pkg?.registryType === 'npm')
    return {
      kind: 'local',
      title,
      command: 'npx',
      args: ['-y', pkg.identifier + (pkg.version ? `@${pkg.version}` : '')],
    };
  return { kind: 'local', title };
}

/** A shared library of installed instructions, packages and user-owned MCP connections. */
export function ExtensionLibrary() {
  const { settings } = useConnectionSettings();
  return <ExtensionLibraryContents key={connectionScope(settings)} />;
}

function ExtensionLibraryContents() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const client = useQueryClient();
  const catalog = usePluginCatalog();
  const supported = useExtensionsSupported();
  const [view, setView] = useState('yours');
  const [kind, setKind] = useState<NonNullable<ExtensionAdd['category']>>('mcp');
  const [search, setSearch] = useState('');
  const [registrySearch, setRegistrySearch] = useState('');
  const [cursor, setCursor] = useState('');
  const [adding, setAdding] = useState<ExtensionAdd>();
  const [signing, setSigning] = useState<string>();
  const [inspecting, setInspecting] = useState<SavedMcpService>();
  const [backup, setBackup] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [skill, setSkill] = useState<string>();
  const [exploring, setExploring] = useState<string>();
  const marketplaces = usePluginMarketplaces();
  const saved = useSavedMcpServices();
  const registry = useQuery({
    queryKey: ['extension-discovery', scope, registrySearch, cursor],
    queryFn: ({ signal }) => repository.discoverMcp(registrySearch, cursor, signal),
    enabled: view === 'discover' && kind === 'mcp',
    staleTime: 60_000,
    retry: false,
  });
  const invalidate = () =>
    Promise.all(
      (
        [
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
  const term = search.trim().toLowerCase();
  const plugins = (catalog.data?.plugins ?? []).filter(
    (row) => kind === 'plugins' || (kind === 'skills' && row.skills.length > 0),
  );
  const filtered = plugins.filter(
    (row) =>
      !term || `${row.id} ${row.description} ${row.marketplace}`.toLowerCase().includes(term),
  );
  const services = saved.data ?? [];
  const haSource = marketplaces.data?.find(
    (row) =>
      row.source.replace(/\.git$/u, '').replace(/\/$/u, '') ===
      'https://github.com/homeassistant-ai/skills',
  );
  const haSkill = catalog.data?.plugins.find(
    (row) => row.marketplace === haSource?.name && row.id === 'home-assistant-skills',
  );
  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Extensions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Skills, MCP connections and plugins for your agents.
          </p>
        </div>
        {kind !== 'marketplaces' ? <ExtensionAddMenu category={kind} onChoose={setAdding} /> : null}
      </header>
      {supported === false ? (
        <p role="status" className="rounded-md border p-3 text-sm">
          Update the connected agent service to add or compose extensions here. Existing sources can
          still be inspected.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-1" role="group" aria-label="Extension types">
        {[
          ['marketplaces', 'Marketplaces'],
          ['mcp', 'MCP connections'],
          ['skills', 'Skills'],
          ['plugins', 'Plugins'],
        ].map(([value, label]) => (
          <Button
            key={value}
            size="sm"
            variant={kind === value ? 'secondary' : 'ghost'}
            aria-pressed={kind === value}
            onClick={() => {
              setKind(value as NonNullable<ExtensionAdd['category']>);
              setCursor('');
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {kind !== 'marketplaces' ? (
          <Tabs value={view} onValueChange={setView}>
            <TabsList>
              <TabsTrigger value="yours">Yours</TabsTrigger>
              <TabsTrigger value="discover">Discover</TabsTrigger>
            </TabsList>
          </Tabs>
        ) : null}
        {kind !== 'marketplaces' ? (
          <form
            className="flex w-full gap-2 sm:w-80"
            onSubmit={(event) => {
              event.preventDefault();
              setRegistrySearch(search);
              setCursor('');
            }}
          >
            <Input
              aria-label="Search extensions"
              placeholder="Search extensions"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {view === 'discover' && kind === 'mcp' ? (
              <Button type="submit" variant="outline" size="icon" aria-label="Search MCP Registry">
                <SearchIcon />
              </Button>
            ) : null}
          </form>
        ) : null}
      </div>
      {kind === 'marketplaces' ? (
        <>
          <MarketplaceSettings onBackup={() => setBackup(true)} />
          {!marketplaces.data?.some((row) => row.name === 'private-local') ? (
            <section className="rounded-lg border p-4 text-sm">
              <h2 className="font-medium">Private local marketplace</h2>
              <p className="mt-1 text-muted-foreground">
                Skills and plugins you create or upload are saved together on this agent host. They
                are not published.
              </p>
              <Button className="mt-3" variant="outline" onClick={() => setBackup(true)}>
                Back up with GitHub
              </Button>
            </section>
          ) : null}
        </>
      ) : view === 'yours' ? (
        <>
          {kind === 'mcp' ? (
            <section aria-label="Your MCP connections" className="grid gap-2">
              <h2 className="text-sm font-semibold">MCP connections</h2>
              {saved.isPending ? <p role="status">Loading connections…</p> : null}
              {saved.error ? (
                <p role="alert" className="text-destructive text-sm">
                  {saved.error.message}
                </p>
              ) : null}
              {services
                .filter((row) => `${row.label} ${row.name}`.toLowerCase().includes(term))
                .map((row) => (
                  <button
                    key={row.name}
                    className="flex items-center gap-3 rounded-lg border p-4 text-left hover:bg-muted/40"
                    onClick={() => setInspecting(row)}
                  >
                    <CableIcon className="size-5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{row.label || row.name}</span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {row.transport === 'stdio' ? 'Local command' : 'Remote MCP'}, saved on this
                        agent host
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">Details</span>
                  </button>
                ))}
              {!saved.isPending && !services.length ? (
                <div className="rounded-lg border border-dashed p-5 text-sm">
                  <p>No custom MCP connections yet.</p>
                  <Button
                    variant="link"
                    className="mt-2 h-auto p-0"
                    onClick={() => setAdding({ kind: 'remote' })}
                  >
                    Add an MCP server
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}
          {kind === 'plugins' ? (
            <InstalledPluginList
              plugins={filtered}
              pending={catalog.isPending}
              error={catalog.error?.message}
              hideFilter
            />
          ) : null}
          {kind === 'skills' ? (
            <section aria-label="Your skills" className="grid gap-2">
              {catalog.isPending ? <p role="status">Loading skills…</p> : null}
              {catalog.error ? <p role="alert">{catalog.error.message}</p> : null}
              {plugins.flatMap((plugin) =>
                plugin.skills
                  .filter(
                    (id) =>
                      !term ||
                      `${id} ${plugin.description} ${plugin.marketplace}`
                        .toLowerCase()
                        .includes(term),
                  )
                  .map((id) => (
                    <button
                      key={`${plugin.ref}:${id}`}
                      className="flex items-start gap-3 rounded-lg border p-4 text-left hover:bg-muted/40"
                      onClick={() => {
                        setSkill(id);
                        setExploring(plugin.ref);
                      }}
                    >
                      <BookOpenIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">
                        <span className="block font-medium">{id}</span>
                        <span className="block text-sm text-muted-foreground">
                          {plugin.marketplace} / {plugin.id}
                        </span>
                      </span>
                    </button>
                  )),
              )}
              {!catalog.isPending &&
              !catalog.error &&
              !plugins.some((plugin) =>
                plugin.skills.some(
                  (id) =>
                    !term ||
                    `${id} ${plugin.description} ${plugin.marketplace}`
                      .toLowerCase()
                      .includes(term),
                ),
              ) ? (
                <p className="text-sm text-muted-foreground">No matching skills.</p>
              ) : null}
            </section>
          ) : null}
        </>
      ) : (
        <div className="grid gap-5">
          {kind !== 'mcp' ? (
            <section className="grid gap-3">
              <h2 className="text-sm font-semibold">Explore extensions</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <DiscoveryCard
                  icon="skill"
                  title="Home Assistant skills"
                  filter={term}
                  description="Best practices, dashboards, automations and reference files from homeassistant-ai."
                  source="https://github.com/homeassistant-ai/skills"
                  actionLabel={haSkill ? 'View' : 'Add'}
                  onAdd={() => {
                    if (haSkill) {
                      setSkill('home-assistant-best-practices');
                      setExploring(haSkill.ref);
                    } else
                      setAdding({
                        kind: 'import',
                        category: 'skills',
                        source: 'https://github.com/homeassistant-ai/skills',
                      });
                  }}
                />
                <DiscoveryCard
                  icon="plugin"
                  title={kind === 'skills' ? 'Bring your own skills' : 'Bring your own plugin'}
                  filter={term}
                  description={
                    kind === 'skills'
                      ? 'Import a repository of Agent Skills, or upload one skill folder as a ZIP.'
                      : 'Import Agent Plugins or Claude Code plugins, or compose your own capabilities.'
                  }
                  onAdd={() => setAdding({ kind: 'import', category: kind })}
                />
              </div>
              <Button variant="link" className="w-fit px-0" onClick={() => setKind('mcp')}>
                Browse the MCP Registry
              </Button>
            </section>
          ) : null}
          {kind === 'mcp' ? (
            <DiscoveryCard
              icon="mcp"
              title="Home Assistant MCP"
              filter={term}
              description="Connect your Home Assistant deployment, or run the ha-mcp package on the agent host."
              source="https://github.com/homeassistant-ai/ha-mcp"
              onAdd={() => setAdding({ kind: 'remote', title: 'Home Assistant' })}
            />
          ) : null}
          {kind === 'mcp' ? (
            <section className="grid gap-3" aria-label="MCP Registry">
              <div>
                <h2 className="font-medium">MCP Registry</h2>
                <p className="text-sm text-muted-foreground">
                  Public server metadata. Adding a connection is your choice; browsing starts no
                  servers.
                </p>
              </div>
              {registry.isPending ? <p role="status">Searching the MCP Registry…</p> : null}
              {registry.error ? (
                <p className="text-destructive text-sm" role="alert">
                  {registry.error.message}
                </p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                {registry.data?.servers.map(({ server }) => (
                  <DiscoveryCard
                    key={`${server.name}:${server.version}`}
                    icon="mcp"
                    title={server.title || server.name}
                    description={server.description}
                    source={server.repository?.url}
                    onAdd={() => setAdding(registryChoice(server))}
                    detail={
                      server.remotes.length
                        ? 'Remote connection'
                        : server.packages
                            .map((row) => `${row.registryType}: ${row.identifier}`)
                            .join(', ') || 'See server documentation'
                    }
                  />
                ))}
              </div>
              {registry.data && !registry.data.servers.length ? (
                <p className="text-sm text-muted-foreground">No matching servers.</p>
              ) : null}
              {registry.data?.next_cursor ? (
                <Button
                  variant="outline"
                  className="w-fit"
                  onClick={() => setCursor(registry.data!.next_cursor)}
                >
                  Next page
                </Button>
              ) : null}
              {cursor ? (
                <Button variant="ghost" className="w-fit" onClick={() => setCursor('')}>
                  Back to first page
                </Button>
              ) : null}
            </section>
          ) : null}
        </div>
      )}
      {backup ? (
        <Dialog open onOpenChange={setBackup}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>Back up your private marketplace</DialogTitle>
              <DialogDescription>
                Export portable source files to a private GitHub repository you control.
              </DialogDescription>
            </DialogHeader>
            <ol className="list-decimal space-y-3 pl-5 text-sm">
              <li>Download the marketplace ZIP and unpack it.</li>
              <li>
                Create a private GitHub repository and upload the unpacked files, preserving the
                folders.
              </li>
              <li>
                To use the backup on another host, add its repository URL from Marketplaces. That
                host needs access to your private repository.
              </li>
            </ol>
            <p className="text-sm text-muted-foreground">
              This is a manual backup. Future edits remain local until you upload them again. Saved
              MCP credentials are not included; configure those connections on each host.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={
                  exporting || !marketplaces.data?.some((row) => row.name === 'private-local')
                }
                onClick={async () => {
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
                }}
              >
                {exporting ? 'Preparing…' : 'Download marketplace ZIP'}
              </Button>
              <ExternalLink href="https://github.com/new" className="self-center text-sm underline">
                Create GitHub repository
              </ExternalLink>
            </div>
            {!marketplaces.data?.some((row) => row.name === 'private-local') ? (
              <p className="text-sm text-muted-foreground">
                Create or upload a skill or plugin first.
              </p>
            ) : null}
          </DialogContent>
        </Dialog>
      ) : null}
      {adding ? (
        <ExtensionAddDialog
          key={`${scope}:${adding.kind}`}
          choice={adding}
          connections={services}
          onClose={() => setAdding(undefined)}
          onSaved={invalidate}
          onSignIn={setSigning}
        />
      ) : null}
      {exploring ? (
        <PluginExplorer
          reference={exploring}
          initialSkill={skill}
          onClose={() => {
            setExploring(undefined);
            setSkill(undefined);
          }}
        />
      ) : null}
      {signing ? (
        <McpSignInDialog
          key={`${scope}:${signing}`}
          name={signing}
          title={services.find((row) => row.name === signing)?.label}
          onClose={() => setSigning(undefined)}
        />
      ) : null}
      {inspecting ? (
        <McpConnectionDetails
          key={`${scope}:${inspecting.name}`}
          connection={inspecting}
          onClose={() => setInspecting(undefined)}
          onSignIn={() => {
            setSigning(inspecting.name);
            setInspecting(undefined);
          }}
          onChanged={invalidate}
        />
      ) : null}
    </div>
  );
}

function DiscoveryCard({
  icon,
  title,
  description,
  source,
  onAdd,
  detail,
  actionLabel = 'Add',
  filter = '',
}: {
  icon: 'mcp' | 'skill' | 'plugin';
  title: string;
  description: string;
  source?: string;
  onAdd: () => void;
  detail?: string;
  actionLabel?: string;
  filter?: string;
}) {
  const Icon = icon === 'mcp' ? CableIcon : icon === 'skill' ? BookOpenIcon : PackageIcon;
  if (filter && !`${title} ${description}`.toLowerCase().includes(filter)) return null;
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-start gap-3">
        <Icon className="mt-1 size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <h3 className="break-words font-medium">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
      {detail ? <p className="break-words text-xs text-muted-foreground">{detail}</p> : null}
      <div className="mt-auto flex items-center justify-between gap-2">
        {source ? (
          <ExternalLink href={source} className="text-sm underline underline-offset-4">
            Source
          </ExternalLink>
        ) : (
          <span />
        )}
        <Button size="sm" variant="outline" aria-label={`${actionLabel} ${title}`} onClick={onAdd}>
          {actionLabel}
        </Button>
      </div>
    </article>
  );
}

function McpConnectionDetails({
  connection,
  onClose,
  onSignIn,
  onChanged,
}: {
  connection: SavedMcpService;
  onClose: () => void;
  onSignIn: () => void;
  onChanged: () => Promise<unknown>;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [checking, setChecking] = useState(false);
  const extensionsSupported = useExtensionsSupported();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const status = useQuery({
    queryKey: ['mcp-connection-check', connectionScope(settings), connection.name],
    queryFn: ({ signal }) => repository.mcpConfiguration(connection.name, signal),
    enabled: checking,
    retry: false,
    staleTime: 0,
  });
  async function change(remove: boolean) {
    setBusy(true);
    setError('');
    try {
      if (remove) await repository.removeMcpConfiguration(connection.name);
      else await repository.forgetMcpAuthorization(connection.name);
      await onChanged();
      if (remove) onClose();
      else toast.success('Signed out');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update connection');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{connection.label || connection.name}</DialogTitle>
          <DialogDescription>
            {connection.transport === 'stdio' ? 'Local MCP command' : 'Remote MCP connection'}:{' '}
            {connection.name}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 text-sm">
          <ConnectionFields server={connection} />
          <p className="text-muted-foreground">
            {connection.spec.connection_only
              ? 'Available to agents through plugins that include this connection.'
              : 'Available through the agent host configuration.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy || status.isFetching}
              onClick={() => {
                setChecking(true);
                void status.refetch();
              }}
            >
              {status.isFetching ? 'Checking…' : 'Check connection'}
            </Button>
            {connection.transport !== 'stdio' &&
            (connection.spec.auth || status.data?.status === 'auth_required') ? (
              <Button disabled={extensionsSupported !== true} onClick={onSignIn}>
                Sign in
              </Button>
            ) : null}
          </div>
          {status.data ? (
            <div role="status">
              <p>
                {status.data.status === 'ready'
                  ? `Connected, ${status.data.tools_count} ${status.data.tools_count === 1 ? 'tool' : 'tools'} available`
                  : status.data.status === 'auth_required'
                    ? 'Sign-in required'
                    : 'Connection check failed'}
              </p>
              {status.data.error ? (
                <p className="mt-2 text-destructive">{status.data.error}</p>
              ) : null}
              {status.data.status === 'ready' ? (
                <InventoryList
                  rows={
                    status.data.tool_details?.length
                      ? status.data.tool_details
                      : status.data.tools.map((name) => ({ name }))
                  }
                  empty="This server exposes no tools."
                  icon={WrenchIcon}
                />
              ) : null}
            </div>
          ) : null}
          {status.error || error ? (
            <p role="alert" className="text-destructive">
              {error || status.error?.message}
            </p>
          ) : null}
          <div className="flex justify-between gap-2 border-t pt-3">
            {connection.transport !== 'stdio' && connection.spec.auth ? (
              <Button variant="ghost" disabled={busy} onClick={() => void change(false)}>
                Sign out
              </Button>
            ) : (
              <span />
            )}
            <Button variant="ghost" disabled={busy} onClick={() => void change(true)}>
              Remove connection
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
