import type { ReactNode } from 'react';
import {
  CheckCircle2Icon,
  CircleAlertIcon,
  CircleDashedIcon,
  DownloadIcon,
  LoaderCircleIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { vocab } from '@/lib/brand-vocabulary';
import { cn } from '@/lib/utils';
import { RefreshButton } from './refresh-button';

export type ProductUpdateState =
  | 'unknown'
  | 'checking'
  | 'current'
  | 'available'
  | 'unavailable'
  | 'error';

export interface ProductVersionDetail {
  label: string;
  version?: string;
  targetVersion?: string;
  releaseUrl?: string;
  testId?: string;
}

/** Shared update status, supported actions, and a read-only version list. */
export function ProductUpdateSummary({
  state,
  message,
  versions,
  updating = false,
  disabled = false,
  onCheck,
  onUpdate,
  children,
}: {
  state: ProductUpdateState;
  message?: string;
  versions: ProductVersionDetail[];
  updating?: boolean;
  disabled?: boolean;
  onCheck: () => unknown | Promise<unknown>;
  onUpdate?: () => unknown | Promise<unknown>;
  children?: ReactNode;
}) {
  const heading = {
    unknown: 'Updates not checked',
    checking: 'Checking for updates',
    current: `${vocab.agent} is up to date`,
    available: 'Update available',
    unavailable: 'Could not check for updates',
    error: 'Update needs attention',
  }[state];
  const detail = message?.replace(
    /^Could not check for updates:\s*(.)/i,
    (_match, initial: string) => initial.toUpperCase(),
  );
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-40 space-y-1">
          <p
            className="flex items-center gap-2 text-sm font-medium"
            role="status"
            aria-label="Update status"
          >
            <ProductUpdateIcon state={state} />
            {updating ? 'Updating' : heading}
          </p>
          {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
        </div>
        {(state === 'available' || updating) && onUpdate ? (
          <Button size="sm" disabled={disabled || updating} onClick={() => void onUpdate()}>
            {updating ? (
              <LoaderCircleIcon aria-hidden="true" className="motion-safe:animate-spin" />
            ) : (
              <DownloadIcon aria-hidden="true" />
            )}
            {updating ? 'Updating' : `Update ${vocab.agent}`}
          </Button>
        ) : (
          <RefreshButton
            label="Check for updates"
            size="sm"
            variant="outline"
            refreshing={state === 'checking'}
            disabled={disabled}
            onRefresh={onCheck}
          />
        )}
      </div>
      {versions.length ? (
        <dl className="grid gap-2 text-sm">
          {versions.map(({ label, version, targetVersion, releaseUrl, testId }) => (
            <div
              key={label}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
              data-testid={testId}
            >
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="min-w-0 break-words text-right font-mono text-xs">
                {version ? (
                  releaseUrl ? (
                    <ExternalLink href={releaseUrl} className="hover:underline">
                      v{version}
                    </ExternalLink>
                  ) : (
                    `v${version}`
                  )
                ) : (
                  'Not checked'
                )}
                {targetVersion ? ` → v${targetVersion}` : ''}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children}
    </div>
  );
}

/** Consistent status icon for the navigation trigger and update summary. */
export function ProductUpdateIcon({ state }: { state: ProductUpdateState }) {
  if (state === 'checking') {
    return (
      <LoaderCircleIcon aria-hidden="true" className="size-4 shrink-0 motion-safe:animate-spin" />
    );
  }
  if (state === 'current') {
    return <CheckCircle2Icon aria-hidden="true" className="size-4 shrink-0 text-success" />;
  }
  if (state === 'unknown') {
    return (
      <CircleDashedIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    );
  }
  if (state === 'available') {
    return <DownloadIcon aria-hidden="true" className="size-4 shrink-0 text-primary" />;
  }
  return (
    <CircleAlertIcon
      aria-hidden="true"
      className={cn(
        'size-4 shrink-0',
        state === 'error' ? 'text-destructive' : 'text-muted-foreground',
      )}
    />
  );
}
