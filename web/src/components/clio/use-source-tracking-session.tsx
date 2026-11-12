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
import { useSourceWorkOwner } from './source-work-owner';

const NEW_CONVERSATION = 'new';

/**
 * The service records each source download or link against a human-owned
 * conversation. Outside a conversation the person chooses one, or a new one
 * named after the source, which is the default when the workspace has none.
 * In a new-conversation draft, the new one is the draft itself and is the
 * default, so the first message goes into the conversation that owns the work.
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
  const [claimed, setClaimed] = useState('');
  const created = useRef<Promise<string> | undefined>(undefined);
  const draftOwner = useSourceWorkOwner();
  const fieldId = useId();
  const hintId = useId();
  const listKey = ['source-task-sessions', settings.endpoint, workspaceId];
  const sessions = useQuery({
    queryKey: listKey,
    enabled: !sessionId,
    queryFn: ({ signal }) => recentSessionsWith(repository, { workspaceId }, signal),
  });
  const listed = sessions.data?.filter((session) => session.id !== claimed);
  const empty = sessions.isSuccess && sessions.data.length === 0;
  const choice = selected || (empty || draftOwner ? NEW_CONVERSATION : '');

  const resolve = async (): Promise<string> => {
    if (sessionId) return sessionId;
    if (!choice) throw new Error('Choose a conversation to track this work.');
    if (choice !== NEW_CONVERSATION) return choice;
    // One creation per choice, shared by concurrent or retried attaches.
    created.current ??= (
      draftOwner
        ? draftOwner()
        : repository
            .createSession({ workspace_id: workspaceId, title: sourceLabel })
            .then((session) => session.id)
    )
      .then(async (id) => {
        // A claimed draft stays "This new conversation" rather than a listed one.
        if (draftOwner) setClaimed(id);
        else setSelected(id);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: listKey }),
          queryClient.invalidateQueries({ queryKey: queryKeys.allSessionReads(settings.endpoint) }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.key('session-pages', settings.endpoint),
          }),
        ]);
        return id;
      })
      .catch((error: unknown) => {
        created.current = undefined;
        throw error;
      });
    return created.current;
  };

  const isNew = choice === NEW_CONVERSATION;
  const newLabel = draftOwner ? 'This new conversation' : 'New conversation';
  const current = isNew ? newLabel : listed?.find((session) => session.id === choice)?.title;
  const control = sessionId ? null : (
    <SettingsRow
      title="Track work in"
      htmlFor={fieldId}
      fullWidth
      note={isNew && !draftOwner ? <span id={hintId}>Named “{sourceLabel}”</span> : null}
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
            aria-describedby={isNew && !draftOwner ? hintId : undefined}
          />
        </SelectPrimitive.Trigger>
        <SelectContent>
          <SelectItem value={NEW_CONVERSATION}>
            <NewConversationIcon aria-hidden="true" />
            {newLabel}
          </SelectItem>
          {listed?.length ? <SelectSeparator /> : null}
          {listed?.map((session) => (
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
