import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PackageXIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { unavailableDefaultMarketplace } from '@/lib/default-marketplace-health';
import { RetryIcon } from '@/lib/icon-vocabulary';
import { queryKeys, type ClioQueryNamespace } from '@/lib/query-keys';
import { QUERY_RESULT_FIELDS } from '@/lib/query-notify';
import {
  DEFAULT_AGENTS_BOOT_POLL_MS,
  DEFAULT_AGENTS_UNAVAILABLE_POLL_MS,
} from '@/lib/runtime-limits';
import { useConnectionSettings } from '@/providers/connection-provider';
import { composerFailureReason } from './composer-failure';
import { NoticeStrip } from './notice-strip';
import { RingSpinner } from './primitives/ring-spinner';
import { ph, t } from '@lingui/core/macro';

/** Reads that change once the default agents install: the catalog, agents and health. */
const INSTALL_READS: readonly ClioQueryNamespace[] = [
  'service-health',
  'connection-availability',
  'plugins',
  'plugin-marketplaces',
  'agents',
  'agent-resolution',
];

/**
 * When the service's boot install of its default agents failed, no conversation can
 * start with them. Every page says so in the service's own sentence and offers the
 * retry, until health reports them installed.
 */
export function DefaultAgentsBanner() {
  const repository = useRepository();
  const { credentialsReady, settings } = useConnectionSettings();
  const endpoint = settings.endpoint;
  const health = useQuery({
    queryKey: queryKeys.key('service-health', endpoint),
    queryFn: ({ signal }) => repository.serviceHealth(signal),
    enabled: credentialsReady,
    notifyOnChangeProps: QUERY_RESULT_FIELDS,
    refetchInterval: (query) => {
      if (query.state.status === 'error') return DEFAULT_AGENTS_UNAVAILABLE_POLL_MS;
      if (query.state.data?.readiness === 'starting') return DEFAULT_AGENTS_BOOT_POLL_MS;
      return unavailableDefaultMarketplace(query.state.data)
        ? DEFAULT_AGENTS_UNAVAILABLE_POLL_MS
        : false;
    },
  });
  const row = credentialsReady ? unavailableDefaultMarketplace(health.data) : undefined;
  if (!row) return null;
  return <DefaultAgentsStrip key={endpoint} text={row.text} />;
}

/** The strip itself: the service's sentence, and the retry with its progress and outcome. */
export function DefaultAgentsStrip({ text }: { text: string }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const retry = useMutation({
    mutationFn: () => repository.retryDefaultMarketplace(),
    onSettled: () =>
      Promise.all(
        INSTALL_READS.map((namespace) => queryClient.invalidateQueries({ queryKey: [namespace] })),
      ),
  });
  const outcome = retry.isPending
    ? t`Installing them again…`
    : retry.isError
      ? t`The retry couldn’t run: ${ph({ reason: composerFailureReason(retry.error, t`The service rejected it.`) })}`
      : retry.data && !retry.data.ready
        ? t`The retry didn’t install them.`
        : undefined;
  return (
    <NoticeStrip
      actions={
        <Button
          disabled={retry.isPending}
          onClick={() => retry.mutate()}
          type="button"
          variant="outline"
        >
          {retry.isPending ? <RingSpinner /> : <RetryIcon aria-hidden="true" />}
          {retry.isPending ? t`Retrying…` : t`Retry`}
        </Button>
      }
      detail={
        <>
          {text}
          {outcome ? (
            <span className="block font-medium text-foreground" role="status">
              {outcome}
            </span>
          ) : null}
        </>
      }
      icon={PackageXIcon}
      label={t`Default agents aren’t installed`}
      slot="default-agents-banner"
      title={t`Default agents aren’t installed`}
    />
  );
}
