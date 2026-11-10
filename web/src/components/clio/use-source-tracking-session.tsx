import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Select as SelectPrimitive } from 'radix-ui';
import { useId, useRef, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectSeparator } from '@/components/ui/select';
import { useRepository } from '@/hooks/use-repository';
import { NewConversationIcon } from '@/lib/icon-vocabulary';
import { queryKeys } from '@/lib/query-keys';
import { recentSessionsWith } from '@/lib/session-pages';
import { useConnectionSettings } from '@/providers/connection-provider';
import { SettingsSelectField } from './model-select-field';
import { SettingsRow } from './settings-row';

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
  const fieldId = useId();
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

  const isNew = choice === NEW_CONVERSATION;
  const current = isNew
    ? 'New conversation'
    : sessions.data?.find((session) => session.id === choice)?.title;
  const control = sessionId ? null : (
    <SettingsRow
      title="Track work in"
      htmlFor={fieldId}
      fullWidth
      note={isNew ? <span id={hintId}>Named “{sourceLabel}”</span> : null}
      error={sessions.error?.message}
    >
      <Select
        value={choice}
        onValueChange={(value) => {
          created.current = undefined;
          setSelected(value);
        }}
      >
        <SelectPrimitive.Trigger asChild>
          <SettingsSelectField
            id={fieldId}
            icon={isNew ? <NewConversationIcon /> : undefined}
            value={current}
            placeholder="Choose a conversation"
            aria-describedby={isNew ? hintId : undefined}
          />
        </SelectPrimitive.Trigger>
        <SelectContent>
          <SelectItem value={NEW_CONVERSATION}>
            <NewConversationIcon aria-hidden="true" />
            New conversation
          </SelectItem>
          {sessions.data?.length ? <SelectSeparator /> : null}
          {sessions.data?.map((session) => (
            <SelectItem key={session.id} value={session.id}>
              {session.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingsRow>
  );

  return { control, resolve };
}
