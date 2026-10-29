import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CopyIcon, FolderIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { AgentEntry } from '@clio/core/v3';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { useInstalledAgents, usePluginCatalog } from '@/hooks/use-session-agent';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { queryKeys } from '@/lib/query-keys';
import { AgentPreviewDialog, AgentRow } from './agent-library-row';
import { InstalledPluginList } from './installed-plugin-list';

/** Browse host-local content even when no plugin marketplace has been created yet. */
export function PrivateLocalLibrary({ onBackup }: { onBackup: () => void }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const catalog = usePluginCatalog();
  const agents = useInstalledAgents();
  const [previewing, setPreviewing] = useState<AgentEntry>();
  const local = useQuery({
    // Saving/deleting an agent invalidates this same namespace, including its source files.
    queryKey: queryKeys.key(
      'agents',
      settings.endpoint,
      'local-sources',
      connectionScope(settings),
    ),
    queryFn: ({ signal }) => repository.localLibrary(signal),
    retry: false,
  });
  const mine = agents.data?.filter((row) => row.kind === 'user') ?? [];
  const plugins = catalog.data?.plugins.filter((row) => row.marketplace === 'private-local') ?? [];
  return (
    <div className="grid min-w-0 gap-4">
      <p className="text-muted-foreground">
        Your saved agents, skills and plugins live on this agent host. You can browse and use them
        here without GitHub.
      </p>
      {local.isPending ? <p role="status">Loading local folders…</p> : null}
      {local.error ? (
        <p role="alert" className="text-muted-foreground">
          The connected service could not report local source locations: {local.error.message}
        </p>
      ) : null}
      {local.data ? (
        <div className="grid gap-2">
          <HostFolder label="Agent definitions" path={local.data.agents_directory} />
          <HostFolder label="Skills and plugins" path={local.data.plugins_directory} />
        </div>
      ) : null}
      <section aria-label="Local agents" className="grid min-w-0 gap-1">
        <h3 className="font-medium">Agents ({mine.length})</h3>
        {agents.isPending ? <p role="status">Loading agents…</p> : null}
        {agents.error ? <p role="alert">{agents.error.message}</p> : null}
        <ul className="min-w-0">
          {mine.map((agent) => (
            <AgentRow
              key={agent.ref}
              agent={agent}
              agents={agents.data ?? []}
              onPreview={() => setPreviewing(agent)}
            />
          ))}
        </ul>
        {!agents.isPending && !agents.error && !mine.length ? (
          <p className="text-muted-foreground">Save a variation from Agents to see it here.</p>
        ) : null}
        {local.data?.agents.map((source) => (
          <details key={source.ref} className="min-w-0 text-xs">
            <summary className="cursor-pointer">Saved definition: {source.ref}</summary>
            <p className="my-2 break-all font-mono text-muted-foreground">{source.path}</p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3">
              {JSON.stringify(source.definition, null, 2)}
            </pre>
          </details>
        ))}
      </section>
      {plugins.length || catalog.isPending || catalog.error ? (
        <InstalledPluginList
          flat
          hideFilter
          plugins={plugins}
          pending={catalog.isPending}
          error={catalog.error?.message}
        />
      ) : (
        <p className="text-muted-foreground">No local skills or plugins yet.</p>
      )}
      {plugins.length ? (
        <div className="grid justify-items-start gap-1">
          <Button size="xs" variant="outline" onClick={onBackup}>
            Back up skills and plugins with GitHub
          </Button>
          <p className="text-xs text-muted-foreground">
            Optional manual backup. Saved agent definitions are shown separately above.
          </p>
        </div>
      ) : null}
      {previewing ? (
        <AgentPreviewDialog agent={previewing} onClose={() => setPreviewing(undefined)} />
      ) : null}
    </div>
  );
}

function HostFolder({ label, path }: { label: string; path: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-md bg-muted/30 p-2">
      <FolderIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium">{label}</p>
        <p className="break-all font-mono text-xs text-muted-foreground">{path}</p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Copy ${label.toLowerCase()} folder`}
        onClick={() => {
          void navigator.clipboard.writeText(path).then(
            () => toast.success('Folder path copied'),
            () => toast.error('Could not copy folder path'),
          );
        }}
      >
        <CopyIcon aria-hidden="true" />
      </Button>
    </div>
  );
}
