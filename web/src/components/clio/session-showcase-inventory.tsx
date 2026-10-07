import { useQuery } from '@tanstack/react-query';
import { CalendarClockIcon, DatabaseIcon, ListChecksIcon } from 'lucide-react';
import { Accordion } from '@/components/ui/accordion';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { EvidenceSection } from './observability-evidence-section';
import { useSessionWork } from './use-session-work';
import { ClioStatus } from './status';

/** Connected data belongs beside context and artifacts, independently of work state. */
export function SessionConnectedSources({ workspaceId }: { workspaceId: string }) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const sources = useQuery({
    queryKey: ['connected-storage', connectionScope(settings), workspaceId, 'sources'],
    queryFn: ({ signal }) => repository.connectedSources(workspaceId, signal),
    refetchInterval: 5000,
  });
  const connected = sources.data?.filter((source) => source.connected) ?? [];
  if (sources.error)
    return (
      <p role="alert" className="py-2 text-xs">
        Connected sources could not be loaded.
      </p>
    );
  if (!connected.length) return null;
  return (
    <Accordion type="multiple" defaultValue={['connected']}>
      <EvidenceSection
        icon={DatabaseIcon}
        label="Connected sources"
        value="connected"
        count={connected.length}
      >
        <ul className="grid gap-2 text-xs">
          {connected.map((source) => (
            <li key={source.id} className="truncate" title={source.label}>
              {source.label}
            </li>
          ))}
        </ul>
      </EvidenceSection>
    </Accordion>
  );
}

/** Show current todos and scheduled instructions using their existing query owners. */
export function SessionWorkShowcase({ sessionId }: { sessionId: string }) {
  const work = useSessionWork(sessionId);
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const schedules = useQuery({
    queryKey: ['session-work-schedules', settings.endpoint, sessionId],
    queryFn: ({ signal }) => repository.scheduledTurns(sessionId, signal),
    refetchInterval: 5000,
  });
  const todos = work.data?.todos ?? [];
  const scheduled = schedules.data?.schedules ?? [];
  return (
    <>
      {work.error ? (
        <p role="alert" className="py-2 text-xs">
          Session work could not be loaded.
        </p>
      ) : null}
      {schedules.error ? (
        <p role="alert" className="py-2 text-xs">
          Schedules could not be loaded.
        </p>
      ) : null}
      <Accordion type="multiple" defaultValue={['todos', 'schedules']}>
        {todos.length ? (
          <EvidenceSection icon={ListChecksIcon} label="Todos" value="todos" count={todos.length}>
            <ul className="grid gap-2 text-xs">
              {todos.map((todo, index) => (
                <li key={`${index}:${todo.content}`} className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{todo.content}</span>
                  <ClioStatus
                    value={todo.status === 'in_progress' ? 'running' : todo.status}
                    className="shrink-0"
                  />
                </li>
              ))}
            </ul>
          </EvidenceSection>
        ) : null}
        {scheduled.length ? (
          <EvidenceSection
            icon={CalendarClockIcon}
            label="Schedules"
            value="schedules"
            count={scheduled.length}
          >
            <ul className="grid gap-2 text-xs">
              {scheduled.map((schedule) => (
                <li key={schedule.id} className="[overflow-wrap:anywhere]">
                  <p>{schedule.question}</p>
                  <p className="text-muted-foreground">
                    {schedule.enabled ? 'Scheduled' : 'Paused'}
                    {schedule.next_fire_at
                      ? ` · ${new Date(schedule.next_fire_at).toLocaleString()}`
                      : ''}
                  </p>
                </li>
              ))}
            </ul>
          </EvidenceSection>
        ) : null}
      </Accordion>
    </>
  );
}
