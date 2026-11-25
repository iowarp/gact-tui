import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { useRepository } from '@/hooks/use-repository';
import { RetryIcon } from '@/lib/icon-vocabulary';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import type { RunRow } from '@/routes/runs-rows';
import { t } from '@lingui/core/macro';

export type RetryableRun = Pick<
  RunRow,
  'state' | 'ownerSessionId' | 'targetSessionId' | 'handleId' | 'label' | 'task'
>;

/**
 * Retry for a failed run its server can start again: a button under a run's
 * state line, or the row's retry icon among hover actions (a job card). Running
 * in the context box lists only live runs, so a failed run is retried from its
 * record or the card in the transcript.
 */
export function RunRetry({
  row,
  look = 'button',
}: {
  row: RetryableRun;
  look?: 'button' | 'icon';
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const sessionId = row.ownerSessionId ?? row.targetSessionId ?? '';
  const retry = useMutation({
    mutationFn: () => repository.controlSubagent(sessionId, row.handleId, 'restart'),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.key('tasks', settings.endpoint) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('run-snapshot', settings.endpoint),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.sessionObservability(settings.endpoint, sessionId),
        }),
      ]);
    },
    onError: (error) => toast.error(t`Could not retry ${row.label}: ${error.message}`),
  });
  if (row.state !== 'failed' || !sessionId || !row.task?.supported_actions.includes('restart'))
    return null;
  if (look === 'icon')
    return (
      <IconButton
        disabled={retry.isPending}
        icon={<RetryIcon aria-hidden="true" />}
        label={retry.isPending ? t`Retrying` : t`Retry`}
        onClick={() => retry.mutate()}
        size="sm"
      />
    );
  return (
    <Button
      className="mt-1 ml-6 justify-self-start"
      disabled={retry.isPending}
      onClick={() => retry.mutate()}
      size="compact"
      variant="outline"
    >
      {retry.isPending ? t`Retrying` : t`Retry`}
    </Button>
  );
}
