import type {
  ArtifactProvenanceProviderSummary,
  ExecutionProvenanceDegradation,
  ExecutionProvenanceResult,
  ProvenanceProviderSummary,
} from '@clio/core/v3';
import { CircleAlertIcon, WaypointsIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { vocab } from '@/lib/brand-vocabulary';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { ResourceLoading } from './resource-states';
import { TechnicalDetails } from './technical-details';
import { WorkspaceFoldersBar } from './workspace-folders';
import { ph, plural, t } from '@lingui/core/macro';

/** Older activity records the service holds beyond the pages read so far. */
export interface ProvenanceEarlier {
  /** Records asked for so far, newest first. */
  limit: number;
  loading: boolean;
  onLoad: () => void;
}

export function ProvenanceSourceBar({
  compact = false,
  earlier,
  execution,
  artifactProvider,
  degradation,
  onProviderChange,
  pending,
  provider,
  providers,
}: {
  /** One quiet line under a list, shown only when there is a choice, a read or a problem. */
  compact?: boolean;
  earlier?: ProvenanceEarlier;
  execution?: ExecutionProvenanceResult;
  artifactProvider?: ArtifactProvenanceProviderSummary;
  degradation?: ExecutionProvenanceDegradation;
  onProviderChange?: (provider: string) => void;
  pending?: boolean;
  provider?: string;
  providers?: readonly ProvenanceProviderSummary[];
}) {
  const [open, setOpen] = useState(false);
  const selected = providers?.find((item) => item.name === provider);
  const unknown = t`unknown`;
  const selectedDegradation =
    degradation && degradation.provider === selected?.name ? degradation : undefined;
  const issue = evidenceRecordIssue(
    selectedDegradation ?? (!selected ? degradation : undefined),
    execution,
    selected,
    Boolean(earlier),
  );
  const choosable = Boolean(providers && providers.length > 1 && provider && onProviderChange);
  if (compact && !issue && !choosable && !pending && !earlier) return null;
  return (
    <div
      className={
        compact
          ? 'flex h-8 shrink-0 items-center justify-between gap-2 border-t px-2'
          : 'grid gap-1 border-b pb-2'
      }
      data-slot={compact ? 'activity-record-source' : undefined}
    >
      <div className={compact ? 'contents' : 'flex flex-wrap items-center justify-between gap-2'}>
        <div className="flex min-w-0 items-center gap-2">
          {compact ? null : (
            <>
              <WaypointsIcon
                aria-hidden="true"
                className="size-3.5 shrink-0 text-muted-foreground"
              />
              <span className="shrink-0 text-xs font-medium">{t`Evidence sources`}</span>
            </>
          )}
          {pending ? <ResourceLoading label={t`Loading evidence sources`} variant="line" /> : null}
          {earlier && !pending ? (
            <span className="truncate text-xs text-muted-foreground">
              {plural(earlier.limit, { one: 'Latest # record', other: 'Latest # records' })}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {earlier && !pending ? (
            <Button
              className="h-7 px-1.5 text-xs"
              disabled={earlier.loading}
              onClick={earlier.onLoad}
              size="sm"
              variant="ghost"
            >
              {earlier.loading ? t`Loading earlier` : t`Load earlier`}
            </Button>
          ) : null}
          {choosable && providers ? (
            <Select onValueChange={onProviderChange} value={provider}>
              <SelectTrigger aria-label={t`Activity record source`} className="w-auto" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {providers.map((item) => (
                  <SelectItem key={item.name} value={item.name}>
                    <span className="flex items-center gap-2">
                      <span>{recordSourceLabel(item.name)}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                aria-label={issue?.label ?? t`About evidence records`}
                title={issue?.label ?? t`About evidence records`}
                size={issue ? 'sm' : 'icon-xs'}
                variant="ghost"
                className={
                  issue ? 'h-7 px-1.5 text-xs text-warning-foreground dark:text-warning' : undefined
                }
              >
                {issue ? (
                  <>
                    <CircleAlertIcon aria-hidden="true" className="size-3.5" />
                    <span>{issue.label}</span>
                  </>
                ) : (
                  <InfoIcon aria-hidden="true" />
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-3 text-sm leading-6">
              <p className="font-medium">{issue?.title ?? t`About these records`}</p>
              <p>
                {issue?.explanation ??
                  t`This view brings together saved activity, file use and artifact relationships for this conversation.`}
              </p>
              {issue ? <p className="text-muted-foreground">{issue.consequence}</p> : null}
              <dl className="grid gap-2 border-t pt-3">
                <div>
                  <dt className="text-xs text-muted-foreground">{t`Activity history`}</dt>
                  <dd>{selected ? recordSourceLabel(selected.name) : t`Source unavailable`}</dd>
                </div>
                {artifactProvider ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">{t`Artifact relationships`}</dt>
                    <dd>
                      {artifactProvider.provider === 'native'
                        ? t`${agent} artifact registry`
                        : recordSourceLabel(artifactProvider.provider)}
                    </dd>
                  </div>
                ) : null}
              </dl>
              <TechnicalDetails
                title={t`Technical details`}
                className="text-xs text-muted-foreground"
              >
                <dl className="grid gap-1">
                  <div>{t`Provider: ${ph({ provider: selected?.name ?? provider ?? unknown })}`}</div>
                  <div>{t`Source: ${ph({ source: selected?.source ?? unknown })}`}</div>
                  <div>{t`Source availability: ${ph({ status: selected?.status ?? unknown })}`}</div>
                  {artifactProvider ? (
                    <div>{t`Artifact provider: ${ph({ provider: artifactProvider.provider })}`}</div>
                  ) : null}
                </dl>
                {selectedDegradation ? (
                  <p className="mt-2 break-words">{selectedDegradation.reason}</p>
                ) : null}
                {selected?.health.last_error ? (
                  <p className="mt-2 break-words">{t`Recording error: ${ph({ error: selected.health.last_error })}`}</p>
                ) : null}
              </TechnicalDetails>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}

/** Under the Activity list: the record source when it needs a word, and folders the agent may write. */
export function ActivityRecordFooter({
  folders,
  ...source
}: Omit<Parameters<typeof ProvenanceSourceBar>[0], 'compact'> & {
  folders?: Parameters<typeof WorkspaceFoldersBar>[0]['folders'];
}) {
  const writable = folders?.some((folder) => !folder.primary);
  return (
    <>
      <ProvenanceSourceBar compact {...source} />
      {writable ? (
        <div className="max-h-32 shrink-0 overflow-y-auto border-t px-3 pt-2 [&>section]:border-b-0">
          <WorkspaceFoldersBar folders={folders} />
        </div>
      ) : null}
    </>
  );
}

const { agent } = vocab;

function recordSourceLabel(provider: string): string {
  return (
    (
      {
        native: t`Built-in ${agent} records`,
        flowcept: 'Flowcept',
        cmf: 'CMF',
      } as Record<string, string>
    )[provider] ?? provider
  );
}

/** Explain record coverage separately from whether its storage service can be queried. */
function evidenceRecordIssue(
  degradation: ExecutionProvenanceDegradation | undefined,
  execution: ExecutionProvenanceResult | undefined,
  source: ProvenanceProviderSummary | undefined,
  pageable = false,
): { label: string; title: string; explanation: string; consequence: string } | undefined {
  // A page of the newest records is cut on purpose; Load earlier reads the rest.
  if (execution?.truncated && !pageable)
    return {
      label: t`Limited history`,
      title: t`Some activity is not shown`,
      explanation: t`The recording source returned a limited number of records.`,
      consequence: t`This view cannot show the full sequence of work or all relationships between records.`,
    };
  if (degradation?.partial && source?.name === 'native' && execution?.complete === false)
    return {
      label: t`Unfinished records`,
      title: t`Some activity has no recorded finish`,
      explanation: t`It may still be running, or its final update may be missing.`,
      consequence: t`The history cannot confirm completion or duration for those records.`,
    };
  if (degradation?.partial || source?.status === 'partial')
    return {
      label: t`Partial history`,
      title: t`Activity history is incomplete`,
      explanation: t`The recording source cannot confirm that this view contains the full activity history.`,
      consequence: t`Some events or relationships may be missing. Review the available records before relying on the full sequence or timings.`,
    };
  if (source && providerStatus(source.status, source.queryable) === 'degraded')
    return {
      label: t`Recording needs attention`,
      title: t`Some records may be missing`,
      explanation: t`The source can be read, but it reports a recording problem.`,
      consequence: t`Review the available activity with that limitation in mind. Technical details contain the source diagnostic.`,
    };
  if (degradation || (source && providerStatus(source.status, source.queryable) !== 'healthy'))
    return {
      label: t`Recording unavailable`,
      title: t`Activity records could not be read`,
      explanation: t`The selected recording source is unavailable or reports a problem.`,
      consequence: t`The evidence shown here may be limited to records available from other parts of the conversation. Technical details contain the source diagnostic.`,
    };
  return undefined;
}

function providerStatus(
  status: string,
  queryable: boolean,
): 'healthy' | 'degraded' | 'unavailable' {
  if (!queryable || status === 'unavailable' || status === 'disabled') return 'unavailable';
  if (status === 'degraded' || status === 'partial') return 'degraded';
  return 'healthy';
}
