import { useQuery } from '@tanstack/react-query';
import { BoxIcon, CpuIcon, HouseIcon, LoaderCircleIcon, MonitorIcon } from 'lucide-react';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { displayHostPath } from '@/lib/host-path-display';
import { RefreshIcon } from '@/lib/icon-vocabulary';
import { RUNTIME_NAMES, hostSummary, runtimeFactLines } from './managed-service-target-utils';
import { IconButton } from './primitives/icon-button';
import { KeyValueGrid, type KeyValueItem } from './primitives/key-value-grid';
import { StateView } from './primitives/state-view';
import { TechnicalDetails } from './technical-details';

/** Read actual capabilities from the same inspection/cache used by Services. */
export function InfrastructureHostInspection({ targetId }: { targetId: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const query = useQuery({
    queryKey: ['managed-service-catalog', settings.endpoint, targetId],
    queryFn: ({ signal }) => repository.managedServiceCatalog(targetId, signal),
    retry: false,
    staleTime: 30_000,
  });
  const inspectAgain = (
    <IconButton
      disabled={query.isFetching}
      icon={
        query.isFetching ? (
          <LoaderCircleIcon className="motion-safe:animate-spin" />
        ) : (
          <RefreshIcon />
        )
      }
      label={query.isFetching ? 'Inspecting' : 'Inspect again'}
      onClick={() => void query.refetch()}
      size="sm"
    />
  );
  const facts = query.data?.facts;
  const runtimes = facts ? runtimeFactLines(facts) : [];
  const runtimeErrors = runtimes.filter((line) => line.detail);
  const items: KeyValueItem[] = facts
    ? [
        { label: 'System', icon: <CpuIcon />, value: hostSummary(facts), action: inspectAgain },
        ...runtimes.map((line) => ({
          label: RUNTIME_NAMES[line.name],
          icon: <BoxIcon />,
          value: line.text,
        })),
        ...(facts.hostname
          ? [{ label: 'Computer', icon: <MonitorIcon />, value: facts.hostname, mono: true }]
          : []),
        ...(facts.home
          ? [
              {
                label: 'Home',
                icon: <HouseIcon />,
                value: displayHostPath(facts.home),
                mono: true,
              },
            ]
          : []),
      ]
    : [];
  return (
    <section aria-label="Computer capabilities" className="flex min-w-0 flex-col gap-1.5">
      {query.error ? (
        <>
          <StateView
            action={{ label: 'Inspect again', onClick: () => void query.refetch() }}
            kind="error"
            size="row"
            title="Could not inspect this computer. Check its connection, then try again."
          />
          <TechnicalDetails className="text-[12px]" title="Inspection details">
            <pre className="clio-scrollbar mt-1 max-h-48 overflow-auto font-mono text-[11px] whitespace-pre-wrap break-words text-muted-foreground">
              {query.error.message}
            </pre>
          </TechnicalDetails>
        </>
      ) : facts ? (
        <>
          <KeyValueGrid items={items} />
          {runtimeErrors.length ? (
            <TechnicalDetails className="text-[12px]" title="Runtime details">
              <pre className="clio-scrollbar mt-1 max-h-48 overflow-auto font-mono text-[11px] whitespace-pre-wrap break-words text-muted-foreground">
                {runtimeErrors
                  .map((line) => `${RUNTIME_NAMES[line.name]}: ${line.detail}`)
                  .join('\n')}
              </pre>
            </TechnicalDetails>
          ) : null}
        </>
      ) : (
        <StateView kind="loading" size="row" title="Reading this computer's capabilities" />
      )}
    </section>
  );
}
