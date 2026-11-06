import { CopyIcon, DownloadIcon, GitBranchIcon, LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ExternalLink } from '@/components/ui/external-link';
import { AddIcon, DeleteIcon, InfoIcon, MoreIcon, RefreshIcon } from '@/lib/icon-vocabulary';

/** The same source-management menu for local and installed marketplace rows. */
export function MarketplaceActions({
  name,
  source,
  busy = false,
  checking = false,
  updating = false,
  exportDisabled = false,
  onBackup,
  onExport,
  onAddRemote,
  onDetails,
  onUpdate,
  onCheck,
  onUninstall,
}: {
  name: string;
  source?: string;
  busy?: boolean;
  checking?: boolean;
  updating?: boolean;
  exportDisabled?: boolean;
  onBackup?: () => void;
  onExport?: () => void;
  onAddRemote?: () => void;
  onDetails: () => void;
  onUpdate?: () => void;
  onCheck?: () => void;
  onUninstall?: () => void;
}) {
  const url = repositoryLink(source);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label={`Actions for ${name}`} size="icon-sm" variant="ghost">
          <MoreIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {onBackup ? (
          <DropdownMenuItem onSelect={onBackup}>
            <GitBranchIcon aria-hidden="true" /> Back up with GitHub…
          </DropdownMenuItem>
        ) : null}
        {onExport ? (
          <DropdownMenuItem disabled={busy || exportDisabled} onSelect={onExport}>
            <DownloadIcon aria-hidden="true" /> Download marketplace ZIP
          </DropdownMenuItem>
        ) : null}
        {onAddRemote ? (
          <DropdownMenuItem onSelect={onAddRemote}>
            <AddIcon aria-hidden="true" /> Add remote marketplace…
          </DropdownMenuItem>
        ) : null}
        {url ? (
          <DropdownMenuItem asChild>
            <ExternalLink href={url}>
              <LinkIcon aria-hidden="true" /> Open repository
            </ExternalLink>
          </DropdownMenuItem>
        ) : null}
        {source ? (
          <DropdownMenuItem
            onSelect={() => {
              void navigator.clipboard.writeText(source).then(
                () => toast.success('Source copied'),
                () => toast.error('Could not copy source'),
              );
            }}
          >
            <CopyIcon aria-hidden="true" /> Copy source
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={onDetails}>
          <InfoIcon aria-hidden="true" /> Marketplace details
        </DropdownMenuItem>
        {onUpdate || onCheck ? <DropdownMenuSeparator /> : null}
        {onUpdate ? (
          <DropdownMenuItem disabled={busy} onSelect={onUpdate}>
            <RefreshIcon aria-hidden="true" /> {updating ? 'Updating…' : 'Update'}
          </DropdownMenuItem>
        ) : null}
        {onCheck ? (
          <DropdownMenuItem disabled={checking} onSelect={onCheck}>
            {checking ? 'Checking…' : 'Check plugins'}
          </DropdownMenuItem>
        ) : null}
        {onUninstall ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={busy} onSelect={onUninstall} variant="destructive">
              <DeleteIcon aria-hidden="true" /> Uninstall
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function repositoryLink(source?: string): string | undefined {
  if (!source) return undefined;
  const github = /^(?:github:|git@github\.com:)([\w.-]+\/[\w.-]+)\/?$/u.exec(source);
  if (github) return `https://github.com/${github[1].replace(/\.git$/u, '')}`;
  try {
    const url = new URL(source);
    return ['https:', 'http:'].includes(url.protocol)
      ? url.href.replace(/\.git\/?$/u, '')
      : undefined;
  } catch {
    return undefined;
  }
}
