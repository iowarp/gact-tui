import { DownloadIcon, LinkIcon, ShieldCheckIcon } from 'lucide-react';
import { Select as SelectPrimitive } from 'radix-ui';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem } from '@/components/ui/select';
import { vocab } from '@/lib/brand-vocabulary';

import { linkAccessNames, type LinkAccess, type DownloadAccess } from './connected-source-labels';
import { SettingsSelectField } from './model-select-field';

const explanations: Record<LinkAccess, string> = {
  read_only: 'Use the files without changing them.',
  publish_later: `Keep edits in ${vocab.agent}. Review and publish when you are ready.`,
  write_through: 'Each saved edit changes the original file at the source.',
};

const downloadOptions = [
  { value: 'editable', label: 'Editable copy' },
  { value: 'read_only', label: 'Read only' },
];

/** A labelled choice in a mapping card: the shared select field over the shared menu. */
function AccessSelect({
  label,
  name,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  name: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const id = useId();
  return (
    <div className="grid min-w-0 gap-[5px]">
      <label htmlFor={id} className="text-[11.5px] text-muted-foreground">
        {label}
      </label>
      <Select disabled={disabled} value={value} onValueChange={onChange}>
        <SelectPrimitive.Trigger asChild>
          <SettingsSelectField
            id={id}
            aria-label={name}
            value={options.find((option) => option.value === value)?.label}
          />
        </SelectPrimitive.Trigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

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
  selectionKind = 'folder',
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
  selectionKind?: 'folder' | 'files';
}) {
  const readOnlyLink = allowed.length === 1 && allowed[0] === 'read_only';
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
            <AccessSelect
              label="Your copy"
              name="Downloaded copy access"
              value={downloadAccess}
              options={downloadOptions}
              onChange={(value) => onDownloadAccess(value as DownloadAccess)}
              disabled={disabled}
            />
            <Button variant="outline" onClick={onDownload} disabled={disabled}>
              <DownloadIcon />
              {selectionKind === 'files' ? 'Download selected files' : 'Download all'}
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
              Keep files at their source. {vocab.agent} reads{' '}
              {selectionKind === 'files' ? 'the selected files' : 'them'} when needed.
              {readOnlyLink
                ? ' The originals stay unchanged.'
                : ' Choose how edits should be handled.'}
            </p>
            {readOnlyLink ? (
              <p className="text-xs font-medium">Read-only link</p>
            ) : (
              <AccessSelect
                label="Through this link"
                name="Linked folder access"
                value={linkAccess}
                options={(['read_only', 'publish_later', 'write_through'] as const).map(
                  (value) => ({
                    value,
                    label: linkAccessNames[value],
                    disabled: !allowed.includes(value),
                  }),
                )}
                onChange={(value) => {
                  onLinkAccess(value as LinkAccess);
                  onConfirmed(false);
                }}
                disabled={disabled || linkLocked}
              />
            )}
            {!readOnlyLink ? (
              <p className="text-xs leading-relaxed">{explanations[linkAccess]}</p>
            ) : null}
            {linkAccess === 'write_through' && (
              <label className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs leading-relaxed">
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
              {linked
                ? 'Update link'
                : selectionKind === 'files'
                  ? 'Link selected files'
                  : 'Link folder'}
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
