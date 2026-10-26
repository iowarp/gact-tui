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
import { PluginSettings } from './settings-plugins';
import { PluginExplorer } from './plugin-explorer';

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
  const [kind, setKind] = useState('all');
  const [search, setSearch] = useState('');
  const [registrySearch, setRegistrySearch] = useState('');
  const [cursor, setCursor] = useState('');
  const [adding, setAdding] = useState<ExtensionAdd>();
  const [signing, setSigning] = useState<string>();
  const [inspecting, setInspecting] = useState<SavedMcpService>();
  const [managing, setManaging] = useState(false);
  const [exploring, setExploring] = useState<string>();
  const marketplaces = usePluginMarketplaces(view === 'discover');
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
    (row) => kind === 'all' || kind === 'plugins' || (kind === 'skills' && row.skills.length > 0),
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
        <ExtensionAddMenu onChoose={setAdding} />
      </header>
      {supported === false ? (
        <p role="status" className="rounded-md border p-3 text-sm">
          Update the connected agent service to add or compose extensions here. Existing sources can
          still be inspected.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={view} onValueChange={setView}>
          <TabsList>
            <TabsTrigger value="yours">Yours</TabsTrigger>
            <TabsTrigger value="discover">Discover</TabsTrigger>
          </TabsList>
        </Tabs>
        <form
          className="flex w-full gap-2 sm:w-80"
          onSubmit={(event) => {
            event.preventDefault();
            setRegistrySearch(search);
            setCursor('');
            if (view === 'discover' && kind === 'all') setKind('mcp');
          }}
        >
          <Input
            aria-label="Search extensions"
            placeholder="Search extensions"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {view === 'discover' && (kind === 'mcp' || kind === 'all') ? (
            <Button type="submit" variant="outline" size="icon" aria-label="Search MCP Registry">
              <SearchIcon />
            </Button>
          ) : null}
        </form>
      </div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Extension types">
        {[
          ['all', 'All'],
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
              setKind(value);
              setCursor('');
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      {view === 'yours' ? (
        <>
          {kind === 'all' || kind === 'mcp' ? (
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
                        {row.transport === 'stdio' ? 'Local command' : 'Remote MCP'} · Saved on this
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
          {kind !== 'mcp' ? (
            <InstalledPluginList
              plugins={filtered}
              pending={catalog.isPending}
              error={catalog.error?.message}
              hideFilter
            />
          ) : null}
          <details
            className="border-t pt-3"
            onToggle={(event) => setManaging(event.currentTarget.open)}
          >
            <summary className="cursor-pointer text-sm font-medium">
              Manage sources, trust & updates
            </summary>
            <div className="pt-4">{managing ? <PluginSettings /> : null}</div>
          </details>
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
                  onAdd={() =>
                    haSkill
                      ? setExploring(haSkill.ref)
                      : setAdding({
                          kind: 'import',
                          source: 'https://github.com/homeassistant-ai/skills',
                        })
                  }
                />
                <DiscoveryCard
                  icon="plugin"
                  title="Bring your own extension"
                  filter={term}
                  description="Import Agent Plugins, Claude Code plugins or portable Agent Skills. Inspect the files before trusting the source."
                  onAdd={() => setAdding({ kind: 'import' })}
                />
              </div>
              <Button variant="link" className="w-fit px-0" onClick={() => setKind('mcp')}>
                Browse the MCP Registry
              </Button>
            </section>
          ) : null}
          {kind === 'all' || kind === 'mcp' ? (
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
                            .join(' · ') || 'See server documentation'
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
        <PluginExplorer reference={exploring} onClose={() => setExploring(undefined)} />
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{connection.label || connection.name}</DialogTitle>
          <DialogDescription>
            {connection.transport === 'stdio' ? 'Local MCP command' : 'Remote MCP connection'} ·{' '}
            {connection.name}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 text-sm">
          <p>
            This connection is saved on the agent host. Include it in a plugin to make its tools
            available to an agent.
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
                  ? `Connected · ${status.data.tools_count} ${status.data.tools_count === 1 ? 'tool' : 'tools'} available`
                  : status.data.status === 'auth_required'
                    ? 'Sign-in required'
                    : 'Connection check failed'}
              </p>
              {status.data.error ? (
                <p className="mt-2 text-destructive">{status.data.error}</p>
              ) : null}
              {status.data.tools.length ? (
                <ul className="mt-3 max-h-60 overflow-y-auto rounded-md border p-3">
                  {status.data.tools.map((tool) => (
                    <li className="py-1 break-words" key={tool}>
                      {tool}
                    </li>
                  ))}
                </ul>
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
