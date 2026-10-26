import type { MarketplaceSummary, PluginCheckReport, PluginMarketplace } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { StoreIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRepository } from '@/hooks/use-repository';
import {
  useAgentPluginsSupported,
  usePluginCatalog,
  usePluginMarketplaces,
} from '@/hooks/use-session-agent';
import { AddIcon, DeleteIcon, MoreIcon, RefreshIcon } from '@/lib/icon-vocabulary';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { PluginMarketplaceDialog, type PluginMarketplaceInput } from './plugin-marketplace-dialog';
import { SettingsSectionHeading } from './settings-section-heading';
import { ClioStatus } from './status';

type Confirm = { kind: 'trust' | 'uninstall'; marketplace: PluginMarketplace };

function summaryText(summary: MarketplaceSummary): string {
  const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
  const parts = [count(summary.plugins.length, 'plugin'), count(summary.agents.length, 'agent')];
  if (summary.pending_trust.length) parts.push(`${summary.pending_trust.length} waiting for trust`);
  return parts.join(', ');
}

/** The single owner of marketplace installation, trust, updates and removal. */
export function MarketplaceSettings({ onBackup }: { onBackup?: () => void }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [installing, setInstalling] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>();
  const [report, setReport] = useState<PluginCheckReport>();
  const supported = useAgentPluginsSupported();
  const marketplaces = usePluginMarketplaces();
  const catalog = usePluginCatalog();
  const invalidate = () =>
    Promise.all(
      (
        ['plugin-marketplaces', 'plugins', 'agents', 'agent-resolution', 'session-agent'] as const
      ).map((namespace) =>
        queryClient.invalidateQueries({ queryKey: queryKeys.key(namespace, settings.endpoint) }),
      ),
    );
  const install = useMutation({
    mutationFn: (input: PluginMarketplaceInput) => repository.installPluginMarketplace(input),
    onSuccess: async (summary) => {
      setInstalling(false);
      await invalidate();
      toast.success(`Installed ${summary.marketplace}`, {
        description: summary.trusted
          ? summaryText(summary)
          : `${summaryText(summary)}. Trust it to load its plugins.`,
      });
    },
  });
  const trust = useMutation({
    mutationFn: (name: string) => repository.trustPluginMarketplace(name),
    onSuccess: async () => {
      await invalidate();
    },
    onError: (error: Error) => toast.error('Trust step failed', { description: error.message }),
    onSettled: () => setConfirm(undefined),
  });
  const update = useMutation({
    mutationFn: (name: string) => repository.updatePluginMarketplace(name),
    onSuccess: async (summary) => {
      await invalidate();
      toast.success(`Updated ${summary.marketplace}`, {
        description: summary.pending_trust.length
          ? `${summaryText(summary)}. Changed executable parts wait for the trust step.`
          : summaryText(summary),
      });
    },
    onError: (error: Error) => toast.error('Update failed', { description: error.message }),
  });
  const uninstall = useMutation({
    mutationFn: (name: string) => repository.uninstallPluginMarketplace(name),
    onSuccess: async (_value, name) => {
      await invalidate();
      toast.success(`Uninstalled ${name}`);
    },
    onError: (error: Error) => toast.error('Uninstall failed', { description: error.message }),
    onSettled: () => setConfirm(undefined),
  });
  const check = useMutation({
    mutationFn: (name: string) => repository.checkPlugins({ installed: name }),
    onSuccess: setReport,
    onError: (error: Error) => toast.error('Plugin check failed', { description: error.message }),
  });
  const busy = trust.isPending || update.isPending || uninstall.isPending;

  if (supported === false) {
    return (
      <Alert>
        <AlertTitle>Plugins are not available on this service</AlertTitle>
        <AlertDescription>
          The connected service does not compose agents from plugins.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SettingsSectionHeading
          title="Marketplaces"
          description="Sources for your skills and plugins. Manage trust and updates here."
        />
        <Button onClick={() => setInstalling(true)}>
          <AddIcon aria-hidden="true" /> Add marketplace
        </Button>
      </div>
      {catalog.data?.default_marketplace_error ? (
        <Alert variant="destructive">
          <AlertTitle>The shipped marketplace could not be installed</AlertTitle>
          <AlertDescription>
            {catalog.data.default_marketplace_error.message} Other marketplaces still work.
          </AlertDescription>
        </Alert>
      ) : null}
      {marketplaces.error ? (
        <Alert variant="destructive">
          <AlertTitle>Marketplaces unavailable</AlertTitle>
          <AlertDescription>{marketplaces.error.message}</AlertDescription>
        </Alert>
      ) : null}
      <section aria-label="Marketplaces" className="grid gap-2">
        {marketplaces.isPending ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading marketplaces…
          </p>
        ) : null}
        {marketplaces.data?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No marketplaces are installed.</p>
        ) : null}
        <ul className="grid gap-2">
          {marketplaces.data?.map((marketplace) => (
            <MarketplaceRow
              busy={busy}
              checking={check.isPending && check.variables === marketplace.name}
              key={marketplace.name}
              marketplace={marketplace}
              onCheck={() => check.mutate(marketplace.name)}
              onTrust={() => setConfirm({ kind: 'trust', marketplace })}
              pendingUpdates={
                catalog.data?.plugins.filter(
                  (plugin) => plugin.pending_trust && plugin.marketplace === marketplace.name,
                ).length ?? 0
              }
              onUninstall={() => setConfirm({ kind: 'uninstall', marketplace })}
              onUpdate={() => update.mutate(marketplace.name)}
              onBackup={marketplace.name === 'private-local' ? onBackup : undefined}
              updating={update.isPending && update.variables === marketplace.name}
            />
          ))}
        </ul>
      </section>
      {report ? <CheckReport onClose={() => setReport(undefined)} report={report} /> : null}
      {installing ? (
        <PluginMarketplaceDialog
          error={install.error?.message}
          onInstall={(input) => install.mutate(input)}
          onOpenChange={setInstalling}
          open
          pending={install.isPending}
        />
      ) : null}
      <AlertDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => (open ? undefined : setConfirm(undefined))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === 'trust'
                ? confirm.marketplace.trusted
                  ? `Trust the update from ${confirm.marketplace.name}?`
                  : `Trust ${confirm.marketplace.name}?`
                : `Uninstall ${confirm?.marketplace.name}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'trust'
                ? confirm.marketplace.trusted
                  ? 'The update changes parts that run on this service: commands, servers or hooks. Until you trust it, the installed version keeps running.'
                  : 'Its plugins can run commands, start servers and run hooks on this service. Trust only sources you know. An update that changes executable parts asks again.'
                : 'Its plugins and agents leave the + menu. Conversations already running keep their pinned plugins until they end.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm ? (
            <p className="break-all font-mono text-xs text-muted-foreground">
              {confirm.marketplace.source}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event) => {
                event.preventDefault();
                if (!confirm) return;
                if (confirm.kind === 'trust') trust.mutate(confirm.marketplace.name);
                else uninstall.mutate(confirm.marketplace.name);
              }}
            >
              {confirm?.kind === 'trust'
                ? confirm.marketplace.trusted
                  ? 'Trust update'
                  : 'Trust marketplace'
                : 'Uninstall'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MarketplaceRow({
  marketplace,
  busy,
  updating,
  checking,
  pendingUpdates,
  onTrust,
  onUpdate,
  onCheck,
  onUninstall,
  onBackup,
}: {
  marketplace: PluginMarketplace;
  busy: boolean;
  updating: boolean;
  checking: boolean;
  /** Plugins whose update waits for the trust step. */
  pendingUpdates: number;
  onTrust: () => void;
  onUpdate: () => void;
  onCheck: () => void;
  onUninstall: () => void;
  onBackup?: () => void;
}) {
  const errors = marketplace.diagnostics.filter((row) => row.severity === 'error').length;
  return (
    <li className="flex min-w-0 flex-wrap items-start gap-3 rounded-lg border px-3 py-3">
      <StoreIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {marketplace.name === 'private-local' ? 'Private local marketplace' : marketplace.name}
          </span>
          <ClioStatus
            label={marketplace.trusted ? 'Trusted' : 'Not trusted'}
            value={marketplace.trusted ? 'healthy' : 'degraded'}
            detail={
              marketplace.trusted
                ? marketplace.trust_reason === 'default_marketplace'
                  ? 'Shipped with the service'
                  : 'Trusted by you'
                : 'Its plugins load after the trust step'
            }
          />
          {marketplace.default ? <Badge variant="secondary">Shipped</Badge> : null}
          {marketplace.parent ? <Badge variant="outline">Via {marketplace.parent}</Badge> : null}
          {marketplace.trusted && pendingUpdates ? (
            <Badge variant="outline">
              {pendingUpdates === 1 ? '1 update waits' : `${pendingUpdates} updates wait`} for trust
            </Badge>
          ) : null}
          {errors ? (
            <Badge variant="destructive">
              {errors} {errors === 1 ? 'problem' : 'problems'}
            </Badge>
          ) : null}
        </div>
        {onBackup ? (
          <Button className="mt-2" size="sm" variant="outline" onClick={onBackup}>
            Back up with GitHub
          </Button>
        ) : null}
        <p
          className="mt-1 truncate font-mono text-xs text-muted-foreground"
          title={marketplace.source}
        >
          {marketplace.source}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {marketplace.format === 'claude-code' ? 'Claude Code format' : 'Agent Plugins format'}
          {marketplace.commit ? ` · commit ${marketplace.commit.slice(0, 12)}` : ''}
        </p>
        {marketplace.diagnostics.length ? (
          <details className="mt-1 text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              Details ({marketplace.diagnostics.length})
            </summary>
            <ul className="mt-1 grid gap-1">
              {marketplace.diagnostics.map((row, index) => (
                <li key={`${row.code}:${index}`}>
                  <span className="font-medium">{row.severity}</span> {row.message}{' '}
                  <span className="font-mono text-muted-foreground">[{row.code}]</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
      <div className="flex items-center gap-1">
        {!marketplace.trusted ? (
          <Button disabled={busy} onClick={onTrust} size="sm">
            Trust
          </Button>
        ) : pendingUpdates ? (
          <Button
            aria-label={`Trust the update from ${marketplace.name}`}
            disabled={busy}
            onClick={onTrust}
            size="sm"
          >
            Trust update
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label={`Actions for ${marketplace.name}`} size="icon-sm" variant="ghost">
              <MoreIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem disabled={busy} onSelect={onUpdate}>
              <RefreshIcon aria-hidden="true" /> {updating ? 'Updating…' : 'Update'}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={checking} onSelect={onCheck}>
              {checking ? 'Checking…' : 'Check plugins'}
            </DropdownMenuItem>
            {marketplace.default ? null : (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={busy} onSelect={onUninstall} variant="destructive">
                  <DeleteIcon aria-hidden="true" /> Uninstall
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function CheckReport({ report, onClose }: { report: PluginCheckReport; onClose: () => void }) {
  const failed = report.targets.filter((target) => !target.ok);
  const section = useRef<HTMLElement>(null);
  // The menu that asked for the check sits above; on a phone the report lands below the fold.
  useEffect(() => {
    section.current?.scrollIntoView({ block: 'nearest' });
  }, [report]);
  return (
    <section
      aria-label="Plugin check results"
      className="grid gap-2 rounded-lg border p-3"
      ref={section}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">Plugin check: {report.source}</h2>
        <ClioStatus
          label={report.ok ? 'Passed' : 'Failed'}
          value={report.ok ? 'completed' : 'failed'}
        />
        <span className="text-xs text-muted-foreground">
          {report.targets.length - failed.length} of {report.targets.length} passed
        </span>
        <Button className="ml-auto" onClick={onClose} size="xs" variant="ghost">
          Close
        </Button>
      </div>
      {[...report.diagnostics, ...failed.flatMap((target) => target.diagnostics)].length ? (
        <ul className="grid gap-1 text-sm">
          {report.diagnostics.map((row, index) => (
            <li key={`report:${index}`}>
              <span className="font-medium">{row.severity}</span>: {row.message}
            </li>
          ))}
          {failed.map((target) => (
            <li key={`${target.kind}:${target.id}`}>
              <span className="font-medium">
                {target.kind} {target.id}
              </span>
              <ul className="ml-4 list-disc text-muted-foreground">
                {target.diagnostics.map((row, index) => (
                  <li key={`${row.code}:${index}`}>
                    {row.message} <span className="font-mono">[{row.code}]</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No problems found.</p>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Full report</summary>
        <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap font-mono">
          {report.text}
        </pre>
      </details>
    </section>
  );
}
