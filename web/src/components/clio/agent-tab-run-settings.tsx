import type { Session } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ModelSelectorLogo } from '@/components/ai-elements/model-selector';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useProviderGroups } from '@/hooks/use-provider-groups';
import { useRepository } from '@/hooks/use-repository';
import { useSpotterAvailability } from '@/hooks/use-spotter-availability';
import { findHeldModelOption, findSelectedModelOption } from '@/lib/model-options';
import { providerLogoId } from '@/lib/provider-presentation';
import { queryKeys } from '@/lib/query-keys';
import {
  defaultReasoningLabel,
  knownReasoningEffort,
  REASONING_EFFORT_LABELS,
} from '@/lib/reasoning-levels';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';
import { approvalOptionViews } from './approval-option-availability';
import { BehaviorMenuItem } from './behavior-menu-item';
import { CHANGED_FOR_CONVERSATION } from './agent-tab-values';
import { ClioModelPicker } from './model-picker';
import { KeyValueGrid, KeyValueRowButton, type KeyValueItem } from './primitives/key-value-grid';
import { SESSION_APPROVAL_OPTIONS } from './session-behavior-options';
import { t, ph } from '@lingui/core/macro';

type RunSettingsPatch = {
  provider_id?: string;
  model_id?: string;
  approval_mode?: Session['approval_mode'];
};

/** A small muted heading over one group of rows. */
export function AgentTabSectionLabel({ id, children }: { id: string; children: string }) {
  return (
    <h3
      className="truncate px-3.5 pt-3 pb-0.5 text-caption font-semibold text-muted-foreground"
      id={id}
    >
      {children}
    </h3>
  );
}

/**
 * "Runs with": the setup, and for a conversation the model, reasoning and
 * confirmation policy it runs on. A library agent has only its setup; a
 * conversation not yet started shows the service defaults it will start
 * with, chosen in the message box.
 */
export function AgentRunsWith({
  setup,
  sessionId,
  mode,
}: {
  setup: KeyValueItem;
  sessionId?: string;
  mode: 'session' | 'draft' | 'library';
}) {
  return (
    <section aria-labelledby="agent-runs-with">
      <AgentTabSectionLabel id="agent-runs-with">{t`Runs with`}</AgentTabSectionLabel>
      {mode === 'library' ? (
        <KeyValueGrid aria-label={t`Runs with`} items={[setup]} variant="rows" />
      ) : (
        <RunSettingRows draft={mode === 'draft'} sessionId={sessionId} setup={setup} />
      )}
    </section>
  );
}

function RunSettingRows({
  setup,
  sessionId,
  draft,
}: {
  setup: KeyValueItem;
  sessionId?: string;
  draft: boolean;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const session = useLiveStore((state) =>
    sessionId ? state.entities.sessions[sessionId] : undefined,
  );
  const replaceSnapshots = useLiveStore((state) => state.replaceSnapshots);
  const defaults = useQuery({
    queryKey: queryKeys.key('session-defaults', settings.endpoint),
    queryFn: ({ signal }) => repository.sessionDefaults(signal),
  });
  const { options, catalog, configuration } = useProviderGroups();
  const spotter = useSpotterAvailability(session?.workspace_id ?? '');
  const [confirmBypass, setConfirmBypass] = useState(false);
  const update = useMutation({
    mutationFn: (patch: RunSettingsPatch) => repository.updateSession(sessionId!, patch),
    onSuccess: async (updated, patch) => {
      replaceSnapshots({
        sessions: { ...useLiveStore.getState().entities.sessions, [updated.id]: updated },
      });
      setConfirmBypass(false);
      toast.success(patch.approval_mode ? t`Confirmations updated` : t`Model updated`);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.key('sessions', settings.endpoint, updated.workspace_id),
      });
    },
    onError: (error) =>
      toast.error(t`The conversation was not changed`, { description: error.message }),
  });
  const editable = !draft && Boolean(session);
  const base = defaults.data;
  const provider =
    session?.provider_id || base?.provider_id || configuration.data?.provider_id || undefined;
  const model = session?.model_id || base?.model_id || configuration.data?.model || undefined;
  const option =
    findSelectedModelOption(options, provider, model) ??
    findHeldModelOption(options, provider, model);
  const modelText = option
    ? `${option.providerName} / ${option.label}`
    : model || t`The service default`;
  const modelChanged = Boolean(
    editable &&
      base?.model_id &&
      session?.model_id &&
      (session.model_id !== base.model_id || (session.provider_id ?? '') !== base.provider_id),
  );
  const effort = knownReasoningEffort(session?.effort);
  const reasoningText = effort
    ? REASONING_EFFORT_LABELS[effort]
    : defaultReasoningLabel(base?.effort, option?.reasoning);
  const reasoningChanged = Boolean(
    editable && effort && base?.effort && knownReasoningEffort(base.effort) !== effort,
  );
  const approvalOptions = approvalOptionViews(SESSION_APPROVAL_OPTIONS, spotter);
  const approval = session?.approval_mode ?? base?.approval_mode ?? 'ask';
  const approvalOption =
    approvalOptions.find((row) => row.value === approval) ?? approvalOptions[0];
  const approvalChanged = Boolean(
    editable && base && session?.approval_mode !== base.approval_mode,
  );
  const logo = option ? (
    <ModelSelectorLogo
      className="size-3.5 rounded-none bg-transparent text-current"
      provider={providerLogoId(option.providerId)}
    />
  ) : undefined;
  const fixedTitle = t`Choose it in the message box before you send`;
  const items: KeyValueItem[] = [
    setup,
    {
      label: t`Model`,
      title: modelText,
      value: editable ? (
        <ClioModelPicker
          catalogStatus={catalog.isPending ? 'loading' : catalog.isError ? 'error' : 'ready'}
          model={model}
          onChange={(choice) =>
            update.mutate({ provider_id: choice.providerId, model_id: choice.id })
          }
          onRetryCatalog={() => void catalog.refetch()}
          options={options}
          provider={provider}
          title={t`Choose the conversation's model`}
          trigger={
            <KeyValueRowButton
              aria-label={
                modelChanged
                  ? t`Model: ${modelText}, changed for this conversation`
                  : t`Model: ${modelText}`
              }
              changed={modelChanged}
              changedLabel={CHANGED_FOR_CONVERSATION}
              chevron="down"
              disabled={update.isPending}
              icon={logo}
            >
              {modelText}
            </KeyValueRowButton>
          }
        />
      ) : (
        <FixedValue icon={logo} text={modelText} title={fixedTitle} />
      ),
    },
    {
      label: t`Reasoning`,
      title: t`${reasoningText}. Choose the level for each message in the message box.`,
      value: (
        <FixedValue
          changed={reasoningChanged}
          text={reasoningText}
          title={t`${reasoningText}. Choose the level for each message in the message box.`}
        />
      ),
    },
    {
      label: t`Permissions`,
      title: `${approvalOption.label}: ${approvalOption.description}`,
      value: editable ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <KeyValueRowButton
              aria-label={
                approvalChanged
                  ? t`Permissions: ${ph({ permissions: approvalOption.label })}, changed for this conversation`
                  : t`Permissions: ${ph({ permissions: approvalOption.label })}`
              }
              changed={approvalChanged}
              changedLabel={CHANGED_FOR_CONVERSATION}
              chevron="down"
              disabled={update.isPending}
            >
              {approvalOption.label}
            </KeyValueRowButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel>{t`Confirmations`}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              onValueChange={(value) => {
                if (value === 'bypass') setConfirmBypass(true);
                else update.mutate({ approval_mode: value as Session['approval_mode'] });
              }}
              value={approval}
            >
              {approvalOptions.map((row) => (
                <BehaviorMenuItem
                  destructive={row.value === 'bypass'}
                  disabled={row.disabled || update.isPending}
                  key={row.value}
                  option={row}
                  title={row.unavailableDetail || undefined}
                />
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <FixedValue text={approvalOption.label} title={fixedTitle} />
      ),
    },
  ];
  return (
    <>
      <KeyValueGrid aria-label={t`Runs with`} items={items} variant="rows" />
      <AlertDialog onOpenChange={setConfirmBypass} open={confirmBypass}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Bypass protected-action checks?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {t`The agent may perform supported actions without asking first. Workspace boundaries and unavailable capabilities still apply, but individual changes will not wait for review.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={update.isPending}>{t`Keep asking`}</AlertDialogCancel>
            <AlertDialogAction
              disabled={update.isPending}
              onClick={(event) => {
                event.preventDefault();
                update.mutate({ approval_mode: 'bypass' });
              }}
              variant="destructive"
            >
              {t`Bypass checks`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** A value this tab shows but does not change. */
function FixedValue({
  text,
  title,
  icon,
  changed = false,
}: {
  text: string;
  title: string;
  icon?: ReactNode;
  changed?: boolean;
}) {
  return (
    <span
      className={
        changed
          ? 'flex min-w-0 items-center gap-[7px] text-changed'
          : 'flex min-w-0 items-center gap-[7px]'
      }
      title={title}
    >
      {icon ? (
        <span aria-hidden="true" className="flex size-3.5 shrink-0 items-center">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 truncate">
        {text}
        {changed ? <span className="sr-only">, {CHANGED_FOR_CONVERSATION}</span> : null}
      </span>
    </span>
  );
}
