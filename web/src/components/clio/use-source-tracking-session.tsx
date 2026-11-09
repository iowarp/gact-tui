import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { recentSessionsWith } from '@/lib/session-pages';
import { useConnectionSettings } from '@/providers/connection-provider';

const NEW_CONVERSATION = 'new';

/**
 * The service records each source download or link against a human-owned
 * conversation. Outside a conversation the person chooses one, or a new one
 * named after the source, which is the default when the workspace has none.
 */
export function useSourceTrackingSession({
  workspaceId,
  sessionId,
  sourceLabel,
}: {
  workspaceId: string;
  sessionId?: string;
  sourceLabel: string;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [selected, setSelected] = useState('');
  const created = useRef<Promise<string> | undefined>(undefined);
  const hintId = useId();
  const listKey = ['source-task-sessions', settings.endpoint, workspaceId];
  const sessions = useQuery({
    queryKey: listKey,
    enabled: !sessionId,
    queryFn: ({ signal }) => recentSessionsWith(repository, { workspaceId }, signal),
  });
  const empty = sessions.isSuccess && sessions.data.length === 0;
  const choice = selected || (empty ? NEW_CONVERSATION : '');

  const resolve = async (): Promise<string> => {
    if (sessionId) return sessionId;
    if (!choice) throw new Error('Choose a conversation to track this work.');
    if (choice !== NEW_CONVERSATION) return choice;
    // One creation per choice, shared by concurrent or retried attaches.
    created.current ??= repository
      .createSession({ workspace_id: workspaceId, title: sourceLabel })
      .then(async (session) => {
        setSelected(session.id);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: listKey }),
          queryClient.invalidateQueries({ queryKey: queryKeys.allSessionReads(settings.endpoint) }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.key('session-pages', settings.endpoint),
          }),
        ]);
        return session.id;
      })
      .catch((error: unknown) => {
        created.current = undefined;
        throw error;
      });
    return created.current;
  };

  const control = sessionId ? null : (
    <div className="grid gap-1 text-sm">
      <label className="grid gap-1">
        <span>Track work in</span>
        <select
          className="h-9 rounded-md border bg-background px-2"
          value={choice}
          aria-describedby={choice === NEW_CONVERSATION ? hintId : undefined}
          onChange={(event) => {
            created.current = undefined;
            setSelected(event.target.value);
          }}
        >
          {!empty && <option value="">Choose a conversation</option>}
          <option value={NEW_CONVERSATION}>New conversation</option>
          {sessions.data?.map((session) => (
            <option key={session.id} value={session.id}>
              {session.title}
            </option>
          ))}
        </select>
      </label>
      {choice === NEW_CONVERSATION && (
        <span id={hintId} className="text-xs text-muted-foreground">
          Starts “{sourceLabel}” to track this work.
        </span>
      )}
      {sessions.error && <span role="alert">{sessions.error.message}</span>}
    </div>
  );

  return { control, resolve };
}
