import type { CreateScheduledTurnInput, ScheduledTurn } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { isPrimarySession } from '@/lib/recent-sessions';
import { recentSessionsWith } from '@/lib/session-pages';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { defineShortcuts } from '@/lib/shortcuts/registry';
import { useConnectionSettings } from '@/providers/connection-provider';
import { AddIcon } from '@/lib/icon-vocabulary';
import { IconButton } from './primitives/icon-button';
import { ItemList } from './primitives/item-row';
import { StateView } from './primitives/state-view';
import { ScheduleDialog } from './settings-schedule-dialog';
import { ScheduleSelect, type ScheduleSelectOption } from './settings-schedule-fields';
import { ScheduleRow } from './settings-schedule-row';
import { SettingsGroupLabel } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';

const NEW_SCHEDULE_SHORTCUT = 'settings-new-scheduled-work';

type DialogState = { mode: 'new'; key: number } | { mode: 'edit'; schedule: ScheduledTurn };

/** Scheduled work: one session's upcoming instructions, added and edited in the shared dialog. */
export function ScheduleSettings({ initialSessionId }: { initialSessionId?: string }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [sessionId, setSessionId] = useState(initialSessionId ?? '');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const sessions = useQuery({
    queryKey: queryKeys.key(
      'session-pages',
      settings.endpoint,
      'schedules',
      initialSessionId ?? '',
    ),
    queryFn: ({ signal }) => recentSessionsWith(repository, { ids: [initialSessionId] }, signal),
  });
  const workspaces = useQuery({
    queryKey: queryKeys.key('workspaces', settings.endpoint),
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  const availableSessions = useMemo(
    () => (sessions.data ?? []).filter((session) => !session.archived && isPrimarySession(session)),
    [sessions.data],
  );
  const workspaceNameById = useMemo(
    () => new Map((workspaces.data ?? []).map((item) => [item.id, item.display_name])),
    [workspaces.data],
  );
  const sessionOptions = useMemo<ScheduleSelectOption[]>(
    () =>
      availableSessions.map((session) => ({
        value: session.id,
        label: session.title || 'Untitled session',
        hint: workspaceNameById.get(session.workspace_id),
      })),
    [availableSessions, workspaceNameById],
  );
  const selectedSessionId = availableSessions.some((session) => session.id === sessionId)
    ? sessionId
    : (availableSessions[0]?.id ?? '');
  const selectedSession = availableSessions.find((session) => session.id === selectedSessionId);
  const place = selectedSession
    ? (workspaceNameById.get(selectedSession.workspace_id) ?? selectedSession.title ?? '')
    : '';

  const scheduleKey = ['scheduled-turns', settings.endpoint, selectedSessionId] as const;
  const scheduledTurns = useQuery({
    enabled: Boolean(selectedSessionId),
    queryKey: scheduleKey,
    queryFn: ({ signal }) => repository.scheduledTurns(selectedSessionId, signal),
  });
  const refresh = (targetSessionId = selectedSessionId) =>
    queryClient.invalidateQueries({
      queryKey: ['scheduled-turns', settings.endpoint, targetSessionId],
    });

  const save = useMutation({
    mutationFn: async ({
      targetSessionId,
      input,
      replaces,
    }: {
      targetSessionId: string;
      input: CreateScheduledTurnInput;
      replaces?: ScheduledTurn;
    }) => {
      const created = await repository.createScheduledTurn(targetSessionId, input);
      // The service has no in-place edit: the new schedule replaces the old one.
      if (replaces) {
        if (!replaces.enabled)
          await repository.setScheduleEnabled(targetSessionId, created.id, false);
        await repository.deleteScheduledTurn(replaces.id);
      }
      return created;
    },
    onSuccess: async (_created, { targetSessionId, replaces }) => {
      setDialog(null);
      await Promise.all([refresh(), refresh(targetSessionId)]);
      toast.success(replaces ? 'Scheduled work updated' : 'Scheduled work created');
    },
    onError: () => toast.error('Scheduled work was not saved'),
  });
  const toggle = useMutation({
    mutationFn: (schedule: ScheduledTurn) =>
      repository.setScheduleEnabled(
        schedule.session_id || selectedSessionId,
        schedule.id,
        !schedule.enabled,
      ),
    onSuccess: async (_result, schedule) => {
      await refresh();
      toast.success(schedule.enabled ? 'Scheduled work paused' : 'Scheduled work resumed');
    },
    onError: () => toast.error('Scheduled work was not changed'),
  });
  const remove = useMutation({
    mutationFn: (schedule: ScheduledTurn) => repository.deleteScheduledTurn(schedule.id),
    onSuccess: async () => {
      await refresh();
      toast.success('Scheduled work deleted');
    },
    onError: () => toast.error('Scheduled work was not deleted'),
  });

  const canAdd = Boolean(selectedSessionId);
  const openNew = () => {
    if (canAdd) setDialog({ mode: 'new', key: Date.now() });
  };
  useEffect(
    () =>
      defineShortcuts([
        { id: NEW_SCHEDULE_SHORTCUT, name: 'New scheduled work', group: 'tab', keys: ['N'] },
      ]),
    [],
  );
  useShortcut(NEW_SCHEDULE_SHORTCUT, openNew, {
    enabled: canAdd && !dialog,
    // The window's content pane holds focus when Settings opens on this page.
    region: {
      get current() {
        return rootRef.current?.closest('[data-window-content]') ?? rootRef.current;
      },
    },
  });

  const schedules = scheduledTurns.data?.schedules ?? [];
  const busy = toggle.isPending || remove.isPending || save.isPending;
  const serviceTimezone = scheduledTurns.data?.timezone ?? '';

  return (
    <div className="min-w-0" ref={rootRef}>
      <SettingsSectionHeading
        actions={
          sessionOptions.length ? (
            <ScheduleSelect
              className="w-[clamp(10rem,32cqw,16rem)]"
              label="Session"
              onChange={setSessionId}
              options={sessionOptions}
              value={selectedSessionId}
            />
          ) : null
        }
        info="Ask an existing session to continue once or on a repeating schedule. Each instruction runs in that session with its existing agent, model, context and access rules. The connected service owns timing and execution, so closing this app does not cancel it."
        title="Scheduled work"
      />
      <SettingsGroupLabel
        actions={
          <IconButton
            disabled={!canAdd}
            icon={<AddIcon />}
            label="New scheduled work"
            onClick={openNew}
            shortcut={NEW_SCHEDULE_SHORTCUT}
            size="sm"
          />
        }
      >
        Upcoming
      </SettingsGroupLabel>
      <ItemList label="Upcoming scheduled work">
        {sessions.isPending || workspaces.isPending ? (
          <StateView kind="loading" size="row" title="Loading sessions…" />
        ) : null}
        {sessions.error ? (
          <StateView
            action={{ label: 'Retry', onClick: () => void sessions.refetch() }}
            kind="error"
            size="row"
            title="Sessions could not be loaded"
          />
        ) : null}
        {sessions.data && !availableSessions.length ? (
          <StateView kind="empty" size="row" title="No sessions to schedule work in yet" />
        ) : null}
        {selectedSessionId && scheduledTurns.isPending ? (
          <StateView kind="loading" size="row" title="Loading scheduled work…" />
        ) : null}
        {scheduledTurns.error ? (
          <StateView
            action={{ label: 'Retry', onClick: () => void scheduledTurns.refetch() }}
            kind="error"
            size="row"
            title="Scheduled work could not be loaded"
          />
        ) : null}
        {scheduledTurns.data && !schedules.length ? (
          <StateView kind="empty" size="row" title="Nothing is scheduled for this session" />
        ) : null}
        {schedules.map((schedule) => (
          <ScheduleRow
            busy={busy}
            key={schedule.id}
            onDelete={(item) => remove.mutate(item)}
            onEdit={(item) => setDialog({ mode: 'edit', schedule: item })}
            onToggle={(item) => toggle.mutate(item)}
            place={place}
            schedule={schedule}
            serviceTimezone={serviceTimezone}
          />
        ))}
      </ItemList>
      {dialog ? (
        <ScheduleDialog
          key={dialog.mode === 'new' ? dialog.key : dialog.schedule.id}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          onSubmit={(targetSessionId, input) =>
            save.mutate({
              targetSessionId,
              input,
              replaces: dialog.mode === 'edit' ? dialog.schedule : undefined,
            })
          }
          open
          pending={save.isPending}
          schedule={dialog.mode === 'edit' ? dialog.schedule : undefined}
          serviceTimezone={scheduledTurns.data?.timezone}
          sessionId={selectedSessionId}
          sessions={sessionOptions}
        />
      ) : null}
    </div>
  );
}
