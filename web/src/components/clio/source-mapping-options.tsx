import { DownloadIcon, LinkIcon, ShieldCheckIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { vocab } from '@/lib/brand-vocabulary';

import { linkAccessNames, type LinkAccess, type DownloadAccess } from './connected-source-labels';

const explanations: Record<LinkAccess, string> = {
  read_only: 'Use the files without changing them.',
  publish_later: `Keep edits in ${vocab.agent}. Review and publish when you are ready.`,
  write_through: 'Each saved edit changes the original file at the source.',
};

/** Mapping and access are separate choices made when bringing a folder into CLIO. */
export function SourceMappingOptions({
  canDownload,
  canLink,
  linked,
  downloadAccess,
  linkAccess,
  allowed,
  reason,
  confirmed,
  disabled,
  linkLocked = false,
  onDownloadAccess,
  onLinkAccess,
  onConfirmed,
  onDownload,
  onLink,
}: {
  canDownload: boolean;
  canLink: boolean;
  linked: boolean;
  downloadAccess: DownloadAccess;
  linkAccess: LinkAccess;
  allowed: LinkAccess[];
  reason?: string;
  confirmed: boolean;
  disabled: boolean;
  linkLocked?: boolean;
  onDownloadAccess: (value: DownloadAccess) => void;
  onLinkAccess: (value: LinkAccess) => void;
  onConfirmed: (value: boolean) => void;
  onDownload: () => void;
  onLink: () => void;
}) {
  return (
    <section aria-label="How to use this folder" className="space-y-3">
      <h4 className="text-sm font-medium">How do you want to use these files?</h4>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        {canDownload && (
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center gap-2 font-medium">
              <DownloadIcon className="size-4" />
              Download a copy
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Save files in this workspace. Available offline. Changes stay here and never update
              the originals.
            </p>
            <label className="space-y-1 text-xs">
              <span className="font-medium">Your copy</span>
              <select
                aria-label="Downloaded copy access"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={downloadAccess}
                onChange={(e) => onDownloadAccess(e.target.value as DownloadAccess)}
                disabled={disabled}
              >
                <option value="editable">Editable copy</option>
                <option value="read_only">Read only</option>
              </select>
            </label>
            <Button variant="outline" onClick={onDownload} disabled={disabled}>
              <DownloadIcon />
              Download all
            </Button>
          </div>
        )}
        {canLink && (
          <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center gap-2 font-medium">
              <LinkIcon className="size-4" />
              Link to the originals
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Keep files at their source. {vocab.agent} reads them when needed. Choose how edits
              should be handled.
            </p>
            <label className="space-y-1 text-xs">
              <span className="font-medium">Through this link</span>
              <select
                aria-label="Linked folder access"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={linkAccess}
                onChange={(e) => {
                  onLinkAccess(e.target.value as LinkAccess);
                  onConfirmed(false);
                }}
                disabled={disabled || linkLocked}
              >
                {(['read_only', 'publish_later', 'write_through'] as const).map((value) => (
                  <option key={value} value={value} disabled={!allowed.includes(value)}>
                    {linkAccessNames[value]}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs leading-relaxed">{explanations[linkAccess]}</p>
            {linkAccess === 'write_through' && (
              <label className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs leading-relaxed">
                <input
                  type="checkbox"
                  aria-label="Allow changes to original files"
                  checked={confirmed}
                  onChange={(e) => onConfirmed(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I understand that edits and deletions change the originals, including files shared
                  with others.
                </span>
              </label>
            )}
            <Button
              onClick={onLink}
              disabled={
                disabled ||
                linkLocked ||
                !allowed.includes(linkAccess) ||
                (linkAccess === 'write_through' && !confirmed)
              }
            >
              <LinkIcon />
              {linked ? 'Update link' : 'Link folder'}
            </Button>
          </div>
        )}
      </div>
      {canLink && reason && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0" />
          {reason}
        </p>
      )}
    </section>
  );
}
