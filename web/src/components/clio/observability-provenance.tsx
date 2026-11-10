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

export function ProvenanceSourceBar({
  compact = false,
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
  const selectedDegradation =
    degradation && degradation.provider === selected?.name ? degradation : undefined;
  const issue = evidenceRecordIssue(
    selectedDegradation ?? (!selected ? degradation : undefined),
    execution,
    selected,
  );
  const choosable = Boolean(providers && providers.length > 1 && provider && onProviderChange);
  if (compact && !issue && !choosable && !pending) return null;
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
              <span className="shrink-0 text-xs font-medium">Evidence sources</span>
            </>
          )}
          {pending ? <ResourceLoading label="Loading evidence sources" variant="line" /> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {choosable && providers ? (
            <Select onValueChange={onProviderChange} value={provider}>
              <SelectTrigger aria-label="Activity record source" className="w-auto" size="sm">
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
                aria-label={issue?.label ?? 'About evidence records'}
                title={issue?.label ?? 'About evidence records'}
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
              <p className="font-medium">{issue?.title ?? 'About these records'}</p>
              <p>
                {issue?.explanation ??
                  'This view brings together saved activity, file use and artifact relationships for this conversation.'}
              </p>
              {issue ? <p className="text-muted-foreground">{issue.consequence}</p> : null}
              <dl className="grid gap-2 border-t pt-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Activity history</dt>
                  <dd>{selected ? recordSourceLabel(selected.name) : 'Source unavailable'}</dd>
                </div>
                {artifactProvider ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Artifact relationships</dt>
                    <dd>
                      {artifactProvider.provider === 'native'
                        ? `${vocab.agent} artifact registry`
                        : recordSourceLabel(artifactProvider.provider)}
                    </dd>
                  </div>
                ) : null}
              </dl>
              <TechnicalDetails title="Technical details" className="text-xs text-muted-foreground">
                <dl className="grid gap-1">
                  <div>Provider: {selected?.name ?? provider ?? 'unknown'}</div>
                  <div>Source: {selected?.source ?? 'unknown'}</div>
                  <div>Source availability: {selected?.status ?? 'unknown'}</div>
                  {artifactProvider ? (
                    <div>Artifact provider: {artifactProvider.provider}</div>
                  ) : null}
                </dl>
                {selectedDegradation ? (
                  <p className="mt-2 break-words">{selectedDegradation.reason}</p>
                ) : null}
                {selected?.health.last_error ? (
                  <p className="mt-2 break-words">Recording error: {selected.health.last_error}</p>
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

function recordSourceLabel(provider: string): string {
  return (
    (
      { native: `Built-in ${vocab.agent} records`, flowcept: 'Flowcept', cmf: 'CMF' } as Record<
        string,
        string
      >
    )[provider] ?? provider
  );
}

/** Explain record coverage separately from whether its storage service can be queried. */
function evidenceRecordIssue(
  degradation: ExecutionProvenanceDegradation | undefined,
  execution: ExecutionProvenanceResult | undefined,
  source: ProvenanceProviderSummary | undefined,
): { label: string; title: string; explanation: string; consequence: string } | undefined {
  if (execution?.truncated)
    return {
      label: 'Limited history',
      title: 'Some activity is not shown',
      explanation: 'The recording source returned a limited number of records.',
      consequence:
        'This view cannot show the full sequence of work or all relationships between records.',
    };
  if (degradation?.partial && source?.name === 'native' && execution?.complete === false)
    return {
      label: 'Unfinished records',
      title: 'Some activity has no recorded finish',
      explanation: 'It may still be running, or its final update may be missing.',
      consequence: 'The history cannot confirm completion or duration for those records.',
    };
  if (degradation?.partial || source?.status === 'partial')
    return {
      label: 'Partial history',
      title: 'Activity history is incomplete',
      explanation:
        'The recording source cannot confirm that this view contains the full activity history.',
      consequence:
        'Some events or relationships may be missing. Review the available records before relying on the full sequence or timings.',
    };
  if (source && providerStatus(source.status, source.queryable) === 'degraded')
    return {
      label: 'Recording needs attention',
      title: 'Some records may be missing',
      explanation: 'The source can be read, but it reports a recording problem.',
      consequence:
        'Review the available activity with that limitation in mind. Technical details contain the source diagnostic.',
    };
  if (degradation || (source && providerStatus(source.status, source.queryable) !== 'healthy'))
    return {
      label: 'Recording unavailable',
      title: 'Activity records could not be read',
      explanation: 'The selected recording source is unavailable or reports a problem.',
      consequence:
        'The evidence shown here may be limited to records available from other parts of the conversation. Technical details contain the source diagnostic.',
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
