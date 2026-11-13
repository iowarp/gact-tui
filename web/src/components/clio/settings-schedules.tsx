import { workspaceName } from '@/lib/workspace-labels';
import type { CreateScheduledTurnInput, ScheduledTurn } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { isPrimarySession } from '@/lib/recent-sessions';
import { SettingsScopeContext } from '@/lib/settings-scope-context';
import { recentSessionsWith } from '@/lib/session-pages';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { defineShortcuts } from '@/lib/shortcuts/registry';
import { useConnectionSettings } from '@/providers/connection-provider';
import { AddIcon } from '@/lib/icon-vocabulary';
import { IconButton } from './primitives/icon-button';
import { ItemList } from './primitives/item-row';
import { StateView } from './primitives/state-view';
import { rowArrowKeyDown } from '@/lib/row-arrow-keys';
import { ScheduleDialog } from './settings-schedule-dialog';
import { ScheduleSelect, type ScheduleSelectOption } from './settings-schedule-fields';
import { ScheduleRow } from './settings-schedule-row';
import { SettingsGroupLabel } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';
import { ph, t } from '@lingui/core/macro';

const NEW_SCHEDULE_SHORTCUT = 'settings-new-scheduled-work';

type DialogState = { mode: 'new'; key: number } | { mode: 'edit'; schedule: ScheduledTurn };

/** Scheduled work: one session's upcoming instructions, added and edited in the shared dialog. */
export function ScheduleSettings({ initialSessionId }: { initialSessionId?: string }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const pageScope = useContext(SettingsScopeContext);
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
    () => new Map((workspaces.data ?? []).map((item) => [item.id, workspaceName(item)])),
    [workspaces.data],
  );
  const sessionOptions = useMemo<ScheduleSelectOption[]>(
    () =>
      availableSessions.map((session) => ({
        value: session.id,
        label: session.title || t`Untitled session`,
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
      toast.success(replaces ? t`Scheduled work updated` : t`Scheduled work created`);
    },
    onError: () => toast.error(t`Scheduled work was not saved`),
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
      toast.success(schedule.enabled ? t`Scheduled work paused` : t`Scheduled work resumed`);
    },
    onError: () => toast.error(t`Scheduled work was not changed`),
  });
  // After a delete, focus moves to the row that took its place, or the one above it when it was last.
  const deleted = useRef<{ id: string; index: number } | null>(null);
  const remove = useMutation({
    mutationFn: (schedule: ScheduledTurn) => repository.deleteScheduledTurn(schedule.id),
    onSuccess: async () => {
      await refresh();
      toast.success(t`Scheduled work deleted`);
    },
    onError: () => {
      deleted.current = null;
      toast.error(t`Scheduled work was not deleted`);
    },
  });
  useEffect(() => {
    const gone = deleted.current;
    const rows = scheduledTurns.data?.schedules;
    if (!gone || !rows || rows.some((row) => row.id === gone.id)) return;
    deleted.current = null;
    const root = rootRef.current;
    const items = root?.querySelectorAll<HTMLElement>('[data-slot="item-row"][role="group"]');
    const next = items?.[Math.min(gone.index, items.length - 1)];
    (next ?? root?.querySelector<HTMLElement>('button[aria-label="New scheduled work"]'))?.focus();
  }, [scheduledTurns.data]);

  const canAdd = Boolean(selectedSessionId);
  const openNew = () => {
    if (canAdd) setDialog({ mode: 'new', key: Date.now() });
  };
  useEffect(
    () =>
      defineShortcuts([
        { id: NEW_SCHEDULE_SHORTCUT, name: t`New scheduled work`, group: 'tab', keys: ['N'] },
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
  // The list holds one conversation's schedules, so the line names that scope, not the whole agent.
  const scope = useMemo(
    () =>
      pageScope && {
        ...pageScope,
        line: t`${ph({ place: pageScope.place })}, applies to the selected conversation`,
      },
    [pageScope],
  );

  return (
    <div className="min-w-0" data-row-keys="" onKeyDown={rowArrowKeyDown} ref={rootRef}>
      <SettingsScopeContext.Provider value={scope}>
        <SettingsSectionHeading
          actions={
            sessionOptions.length ? (
              <ScheduleSelect
                className="w-[clamp(10rem,32cqw,16rem)]"
                label={t`Session`}
                onChange={setSessionId}
                options={sessionOptions}
                value={selectedSessionId}
              />
            ) : null
          }
          info={t`Ask an existing session to continue once or on a repeating schedule. Each instruction runs in that session with its existing agent, model, context and access rules. The connected service owns timing and execution, so closing this app does not cancel it.`}
          title={t`Scheduled work`}
        />
      </SettingsScopeContext.Provider>
      <SettingsGroupLabel
        actions={
          <IconButton
            disabled={!canAdd}
            icon={<AddIcon />}
            label={t`New scheduled work`}
            onClick={openNew}
            shortcut={NEW_SCHEDULE_SHORTCUT}
            size="sm"
          />
        }
      >
        {t`Upcoming`}
      </SettingsGroupLabel>
      <ItemList label={t`Upcoming scheduled work`}>
        {sessions.isPending || workspaces.isPending ? (
          <StateView kind="loading" size="row" title={t`Loading sessions…`} />
        ) : null}
        {sessions.error ? (
          <StateView
            action={{ label: t`Retry`, onClick: () => void sessions.refetch() }}
            kind="error"
            size="row"
            title={t`Sessions could not be loaded`}
          />
        ) : null}
        {sessions.data && !availableSessions.length ? (
          <StateView kind="empty" size="row" title={t`No sessions to schedule work in yet`} />
        ) : null}
        {selectedSessionId && scheduledTurns.isPending ? (
          <StateView kind="loading" size="row" title={t`Loading scheduled work…`} />
        ) : null}
        {scheduledTurns.error ? (
          <StateView
            action={{ label: t`Retry`, onClick: () => void scheduledTurns.refetch() }}
            kind="error"
            size="row"
            title={t`Scheduled work could not be loaded`}
          />
        ) : null}
        {scheduledTurns.data && !schedules.length ? (
          <StateView
            kind="empty"
            size="row"
            title={t`Nothing is scheduled in ${ph({ title: selectedSession?.title || t`Untitled session` })}`}
          />
        ) : null}
        {schedules.map((schedule, index) => (
          <ScheduleRow
            busy={busy}
            key={schedule.id}
            onDelete={(item) => {
              deleted.current = { id: item.id, index };
              remove.mutate(item);
            }}
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
