import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { WorkRecord } from '@clio/core/v3';
import { Button } from '@/components/ui/button';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { t } from '@lingui/core/macro';

/** Explicit user controls, scoped to the retained identity rather than list position. */
export function WorkRecordControls({
  sessionId,
  kind,
  record,
}: {
  sessionId: string;
  kind: 'goal' | 'loop';
  record: WorkRecord;
}) {
  const repository = useRepository();
  const client = useQueryClient();
  const { settings } = useConnectionSettings();
  const control = useMutation({
    mutationFn: (action: 'stop' | 'restart' | 'delete') =>
      repository.controlSessionWork(sessionId, kind, record.id, action),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['session-work', settings.endpoint, sessionId] });
      await client.invalidateQueries({
        queryKey: ['session-work-schedules', settings.endpoint, sessionId],
      });
    },
  });
  const active = record.state === 'active';
  return (
    <>
      <details className="text-muted-foreground">
        <summary className="cursor-pointer">{t`Details`}</summary>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 py-1">
          {Object.entries(record.details ?? {}).map(([name, value]) => (
            <div className="contents" key={name}>
              <dt>
                {(
                  {
                    max_goal_iters: t`Turn limit`,
                    max_iters: t`Iteration limit`,
                    max_wallclock_s: t`Time limit (seconds)`,
                    max_tokens: t`Token limit`,
                    max_usd: t`Cost limit (USD)`,
                    interval_s: t`Interval (seconds)`,
                    stop_text: t`Stop text`,
                    waiting_tasks: t`Waiting for`,
                    judge_reason: t`Judge guidance`,
                    progress: t`Verified progress`,
                  } as Record<string, string>
                )[name] ?? name}
              </dt>
              <dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                {value === 0
                  ? t`Unlimited`
                  : Array.isArray(value)
                    ? value.join(', ')
                    : String(value || '—')}
              </dd>
            </div>
          ))}
        </dl>
      </details>
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={control.isPending}
          onClick={() => control.mutate(active ? 'stop' : 'restart')}
        >
          {active ? t`Stop` : t`Restart`}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={control.isPending}
          onClick={() => control.mutate('delete')}
        >
          {t`Cancel and delete`}
        </Button>
      </div>
      {control.error ? <p role="alert">{control.error.message}</p> : null}
    </>
  );
}
