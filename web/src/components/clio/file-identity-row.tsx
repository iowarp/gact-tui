import type { HTMLAttributes, MouseEventHandler, ReactNode } from 'react';
import { useId } from 'react';
import { fileRowTint } from '@/lib/file-presentation';
import { cn } from '@/lib/utils';
import { FileTypeIcon } from './file-type-icon';

/** Filename and metadata share one reading order, with independent sibling actions. */
export function FileIdentityRow({
  name,
  mediaType = '',
  metadata,
  icon,
  actions,
  onOpen,
  disabled,
  children,
  className,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, 'onClick'> & {
  name: string;
  mediaType?: string;
  metadata?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  onOpen?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
}) {
  const metadataId = useId();
  const identity = (
    <>
      <span className="block truncate text-sm font-medium">{name}</span>
      {metadata ? (
        <span
          id={metadataId}
          className="mt-0.5 block truncate text-xs font-normal text-muted-foreground"
        >
          {metadata}
        </span>
      ) : null}
    </>
  );
  return (
    <div
      {...props}
      data-slot="file-identity-row"
      data-file-row=""
      className={cn(
        'relative flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5',
        fileRowTint(name, mediaType),
        className,
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center">
        {icon ?? <FileTypeIcon name={name} mediaType={mediaType} badge className="size-9" />}
      </span>
      <div className="min-w-0 flex-1 text-foreground">
        {onOpen ? (
          <button
            type="button"
            aria-label={`Open ${name}`}
            aria-describedby={metadata ? metadataId : undefined}
            title={name}
            disabled={disabled}
            onClick={onOpen}
            className="block w-full min-w-0 text-left outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] hover:underline focus-visible:after:ring-2 focus-visible:after:ring-ring disabled:cursor-default"
          >
            {identity}
          </button>
        ) : (
          <div title={name}>{identity}</div>
        )}
        {children}
      </div>
      {actions ? (
        <div className="relative z-10 flex shrink-0 items-center gap-1 text-foreground">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
