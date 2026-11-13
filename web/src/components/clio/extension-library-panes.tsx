import { GlobeIcon, KeyRoundIcon, PlugIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ExternalLink } from '@/components/ui/external-link';
import { shortSource, type ExtensionEntry } from '@/lib/extension-library-entries';
import { DeleteIcon, MoreIcon, RefreshIcon } from '@/lib/icon-vocabulary';
import { serviceStatus } from '@/lib/mcp-service-presentation';
import type { DiscoverItem } from './extension-discover';
import { MetaLine, SlotButton } from './extension-parts';
import { McpConnectionDetails } from './mcp-connection-details';
import { DetailPane } from './primitives/detail-pane';
import { DialogFrame } from './primitives/dialog-frame';
import { IconButton } from './primitives/icon-button';
import { KeyValueGrid } from './primitives/key-value-grid';
import { SettingsGroupLabel } from './settings-row';
import { t, ph } from '@lingui/core/macro';

/** One of your MCP connections: where it connects, its state, and what you can do with it. */
export function McpConnectionPane({
  entry,
  onClose,
  onReconnect,
  reconnecting,
  onRemove,
  onSignIn,
  className,
}: {
  entry: Extract<ExtensionEntry, { kind: 'mcp' }>;
  onClose: () => void;
  onReconnect?: () => void;
  reconnecting: boolean;
  onRemove?: () => void;
  onSignIn?: () => void;
  className?: string;
}) {
  const status = serviceStatus(entry.server);
  const definition = entry.server ?? {
    transport: entry.saved?.transport,
    spec: entry.saved?.spec ?? {},
  };
  const tools = entry.server?.tools ?? [];
  return (
    <DetailPane
      className={className}
      icon={entry.remote ? <GlobeIcon /> : <PlugIcon />}
      onClose={onClose}
      title={entry.title}
      actions={
        <>
          {onReconnect ? (
            <IconButton
              disabled={reconnecting}
              icon={<RefreshIcon />}
              label={t`Reconnect`}
              onClick={onReconnect}
            />
          ) : null}
          {onRemove ? (
            <IconButton icon={<DeleteIcon />} label={t`Remove`} onClick={onRemove} />
          ) : null}
          {onSignIn ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <IconButton
                  icon={<MoreIcon />}
                  label={t`More actions for ${ph({ title: entry.title })}`}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuItem onSelect={onSignIn}>
                  <KeyRoundIcon aria-hidden="true" />
                  {t`Sign in…`}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </>
      }
    >
      <MetaLine className="block truncate text-xs text-muted-foreground" parts={entry.meta} />
      <KeyValueGrid
        className="mt-3"
        items={[
          {
            label: t`Status`,
            value: (
              <MetaLine parts={[status.label, entry.server?.error ?? entry.server?.reason ?? '']} />
            ),
          },
          {
            label: t`Starts`,
            value: entry.saved?.always_load ? t`With every conversation` : t`When used`,
          },
          ...(tools.length ? [{ label: t`Tools`, value: `${tools.length}` }] : []),
        ]}
      />
      <SettingsGroupLabel>{t`Connection`}</SettingsGroupLabel>
      <McpConnectionDetails server={definition} />
      {tools.length ? (
        <>
          <SettingsGroupLabel>{t`Tools`}</SettingsGroupLabel>
          <p className="leading-5 text-muted-foreground">{tools.join(', ')}</p>
        </>
      ) : null}
    </DetailPane>
  );
}

/** A suggestion or registry server before it is installed. */
export function DiscoverPane({
  item,
  onClose,
  className,
}: {
  item: DiscoverItem;
  onClose: () => void;
  className?: string;
}) {
  return (
    <DetailPane className={className} icon={item.icon} onClose={onClose} title={item.title}>
      <MetaLine className="block truncate text-xs text-muted-foreground" parts={item.meta} />
      <div className="mt-3 flex items-start gap-2.5">
        <p className="min-w-0 flex-1 leading-5">{item.description}</p>
        <SlotButton label={`${item.action.label} ${item.title}`} onClick={item.action.run}>
          {item.action.label}
        </SlotButton>
      </div>
      {item.source || item.detail ? (
        <KeyValueGrid
          className="mt-3"
          items={[
            ...(item.source
              ? [
                  {
                    label: t`Source`,
                    value: (
                      <ExternalLink
                        className="truncate underline-offset-4 hover:underline"
                        href={item.source}
                      >
                        {shortSource(item.source)}
                      </ExternalLink>
                    ),
                    mono: true,
                  },
                ]
              : []),
            ...(item.detail ? [{ label: t`Runs as`, value: item.detail }] : []),
          ]}
        />
      ) : null}
    </DetailPane>
  );
}

export function BackupDialog({
  exporting,
  hasLocalItems,
  onExport,
  onClose,
}: {
  exporting: boolean;
  hasLocalItems: boolean;
  onExport: () => void;
  onClose: () => void;
}) {
  return (
    <DialogFrame
      description={t`Export your saved agents, skills and plugins to a repository you control.`}
      onOpenChange={(open) => (open ? undefined : onClose())}
      open
      title={t`Back up to GitHub`}
      cancelLabel={t`Close`}
      confirm={{
        label: exporting ? t`Preparing…` : t`Download marketplace ZIP`,
        disabled: exporting || !hasLocalItems,
        keyboard: false,
        onConfirm: onExport,
      }}
      secondary={
        <ExternalLink
          className="mr-auto text-xs underline underline-offset-4"
          href="https://github.com/new"
        >
          {t`Create GitHub repository`}
        </ExternalLink>
      }
    >
      <ol className="list-decimal space-y-2 pl-5 leading-5">
        <li>{t`Download the marketplace ZIP and unpack it.`}</li>
        <li>
          {t`Create a private GitHub repository and upload the unpacked files, preserving the folders.`}
        </li>
        <li>
          {t`To use the backup on another host, add its repository URL from Marketplaces. That host needs access to your private repository.`}
        </li>
      </ol>
      <p className="mt-3 leading-5 text-muted-foreground">
        {t`This is a manual backup. Future edits remain local until you upload them again. Saved MCP credentials are not included; configure those connections on each host.`}
      </p>
      {!hasLocalItems ? (
        <p className="mt-2 text-muted-foreground">{t`Save an agent, skill or plugin first.`}</p>
      ) : null}
    </DialogFrame>
  );
}
