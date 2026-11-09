import type { MarketplaceSummary, PluginCheckReport, PluginMarketplace } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BoxIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { SlotButton } from './extension-parts';
import { CheckReport } from './plugin-check-report';
import { PluginMarketplaceDialog, type PluginMarketplaceInput } from './plugin-marketplace-dialog';
import { DialogFrame } from './primitives/dialog-frame';

type Confirm = { kind: 'trust' | 'uninstall'; marketplace: PluginMarketplace };

function summaryText(summary: MarketplaceSummary): string {
  const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
  const parts = [count(summary.plugins.length, 'plugin'), count(summary.agents.length, 'agent')];
  if (summary.pending_trust.length) parts.push(`${summary.pending_trust.length} waiting for trust`);
  return parts.join(', ');
}

/** What the page can ask of a marketplace; each change asks first where it widens trust or removes. */
export interface MarketplaceManager {
  busy: boolean;
  updating: (name: string) => boolean;
  checking: (name: string) => boolean;
  openInstall: () => void;
  /** Ask before trusting a marketplace or its waiting update. */
  requestTrust: (marketplace: PluginMarketplace) => void;
  requestUninstall: (marketplace: PluginMarketplace) => void;
  update: (name: string) => void;
  check: (name: string) => void;
  /** The install and confirmation dialogs; render once. */
  dialogs: ReactNode;
  /** The latest plugin check, or nothing. */
  report: ReactNode;
}

/** The single owner of marketplace installation, trust, updates, checks and removal. */
export function useMarketplaceManager(): MarketplaceManager {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [installing, setInstalling] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>();
  const [report, setReport] = useState<PluginCheckReport>();
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
  const target = confirm?.marketplace;
  const trustingUpdate = confirm?.kind === 'trust' && Boolean(target?.trusted);
  return {
    busy,
    updating: (name) => update.isPending && update.variables === name,
    checking: (name) => check.isPending && check.variables === name,
    openInstall: () => setInstalling(true),
    requestTrust: (marketplace) => setConfirm({ kind: 'trust', marketplace }),
    requestUninstall: (marketplace) => setConfirm({ kind: 'uninstall', marketplace }),
    update: (name) => update.mutate(name),
    check: (name) => check.mutate(name),
    report: report ? <CheckReport onClose={() => setReport(undefined)} report={report} /> : null,
    dialogs: (
      <>
        {installing ? (
          <PluginMarketplaceDialog
            error={install.error?.message}
            onInstall={(input) => install.mutate(input)}
            onOpenChange={setInstalling}
            open
            pending={install.isPending}
          />
        ) : null}
        <DialogFrame
          icon={<BoxIcon />}
          onOpenChange={(open) => (open ? undefined : setConfirm(undefined))}
          open={Boolean(confirm)}
          title={
            confirm?.kind === 'trust'
              ? trustingUpdate
                ? `Trust the update from ${target?.name}?`
                : `Trust ${target?.name}?`
              : `Uninstall ${target?.name}?`
          }
          confirm={{
            label:
              confirm?.kind === 'trust'
                ? trustingUpdate
                  ? 'Trust update'
                  : 'Trust marketplace'
                : 'Uninstall',
            tone: confirm?.kind === 'uninstall' ? 'destructive' : 'default',
            disabled: busy,
            onConfirm: () => {
              if (!confirm) return;
              if (confirm.kind === 'trust') trust.mutate(confirm.marketplace.name);
              else uninstall.mutate(confirm.marketplace.name);
            },
          }}
        >
          <p className="leading-5 text-muted-foreground">
            {confirm?.kind === 'trust'
              ? trustingUpdate
                ? 'The update changes parts that run on this service: commands, servers or hooks. Until you trust it, the installed version keeps running.'
                : 'Its plugins can run commands, start servers and run hooks on this service. Trust only sources you know. An update that changes executable parts asks again.'
              : 'Its plugins and agents leave the + menu. Conversations already running keep their pinned plugins until they end.'}
          </p>
          {target?.source ? (
            <p className="mt-2 truncate font-mono text-xs text-faint" title={target.source}>
              {target.source}
            </p>
          ) : null}
        </DialogFrame>
      </>
    ),
  };
}

/** The Trust or Update button a marketplace row and pane offer, or nothing. */
export function marketplaceSlot(
  marketplace: PluginMarketplace,
  pendingUpdates: number,
  manager: MarketplaceManager,
): ReactNode {
  if (!marketplace.trusted)
    return (
      <SlotButton
        disabled={manager.busy}
        label={`Trust ${marketplace.name}`}
        onClick={() => manager.requestTrust(marketplace)}
      >
        Trust
      </SlotButton>
    );
  if (pendingUpdates)
    return (
      <SlotButton
        disabled={manager.busy}
        label={`Trust the update from ${marketplace.name}`}
        onClick={() => manager.requestTrust(marketplace)}
      >
        Trust update
      </SlotButton>
    );
  return (
    <SlotButton
      disabled={manager.busy}
      label={`Update ${marketplace.name}`}
      onClick={() => manager.update(marketplace.name)}
    >
      {manager.updating(marketplace.name) ? 'Updating…' : 'Update'}
    </SlotButton>
  );
}
