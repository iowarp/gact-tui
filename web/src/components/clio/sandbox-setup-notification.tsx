import { useEffect, useRef } from 'react';
import { useIsMutating, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { queryKeys } from '@/lib/query-keys';
import { SANDBOX_SETUP_POLL_MS } from '@/lib/runtime-limits';
import { vocab } from '@/lib/brand-vocabulary';
import { formatDuration } from '@/lib/format';
import { t, ph } from '@lingui/core/macro';

const { agent } = vocab;

/** Follow service-owned setup even after the user leaves Infrastructure. */
export function SandboxSetupNotification() {
  const repository = useRepository();
  const { credentialsReady, settings } = useConnectionSettings();
  const navigate = useNavigate();
  const observed = useRef('');
  const notified = useRef('');
  const requested = useIsMutating({
    mutationKey: queryKeys.key('sandbox-setup', settings.endpoint),
  });
  const sandbox = useQuery({
    queryKey: queryKeys.key('sandbox-status', settings.endpoint),
    queryFn: ({ signal }) => repository.sandboxStatus(signal),
    enabled: credentialsReady,
    refetchInterval: (query) =>
      requested > 0 || query.state.data?.setup_in_progress ? SANDBOX_SETUP_POLL_MS : false,
  });
  useEffect(() => {
    const row = sandbox.data;
    const progress = row?.setup_progress;
    if (!progress) return;
    const id = `sandbox-setup:${settings.endpoint}`;
    if (row.setup_in_progress) {
      observed.current = `${settings.endpoint}:${progress.started_at}`;
      toast.loading(t`Setting up protected execution`, {
        id,
        description: t`${ph({ detail: progress.detail })} (${ph({ elapsed: formatDuration(progress.elapsed_seconds * 1000) })}) You can keep using ${agent} while this finishes.`,
        action: { label: t`View progress`, onClick: () => navigate('/infrastructure/agent') },
      });
    } else if (
      notified.current !== `${settings.endpoint}:${progress.started_at}` &&
      (observed.current === `${settings.endpoint}:${progress.started_at}` ||
        progress.status === 'failed' ||
        progress.status === 'setup_required')
    ) {
      observed.current = '';
      notified.current = `${settings.endpoint}:${progress.started_at}`;
      const ready =
        progress.status !== 'failed' &&
        progress.status !== 'setup_required' &&
        (row.status === 'ready' || row.status === 'healthy');
      (ready ? toast.success : toast.message)(
        ready ? t`Protected execution is ready` : t`Protected execution needs attention`,
        {
          id,
          description: ready
            ? t`Finished in ${ph({ elapsed: formatDuration(progress.elapsed_seconds * 1000) })}.`
            : progress.status === 'failed'
              ? progress.detail
              : row.next_action || progress.detail,
          action: { label: t`View status`, onClick: () => navigate('/infrastructure/agent') },
          duration: 10000,
        },
      );
    }
  }, [navigate, sandbox.data, settings.endpoint]);
  return null;
}
