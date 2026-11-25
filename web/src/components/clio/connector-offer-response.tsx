import {
  connectorSetupPayload,
  type PendingInteraction,
  type PluginChangeApply,
} from '@clio/core/v3';
import { ChevronRightIcon, PlugIcon, PuzzleIcon } from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useConnector, useSessionConnector } from '@/hooks/use-connectors';
import { usePluginCatalog } from '@/hooks/use-session-agent';
import { conversationAnswer, unfilledRequired, type ConnectorDraft } from '@/lib/connector-draft';
import { bringsMoreThanItsServer } from '@/lib/connector-plugin';
import { humanizePluginId } from '@/lib/plugin-presentation';
import { offerContentsLine } from '@/lib/plugin-offer-contents';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AskBody, AskCard, AskError, AskSection } from './ask-card';
import { BinaryAsk } from './ask-binary';
import { ConnectorLogo, ConnectorNeedRows } from './connector-need-rows';
import { pendingInteractionDomId, respondFromControl } from './interaction-control';
import type { ClioPendingInteractionsProps } from './pending-interactions';
import { StatusIndicator } from './primitives/status-indicator';
import { ph, t } from '@lingui/core/macro';
import { sentenceGap } from '@/lib/locale-format';

const PluginExplorer = lazy(() =>
  import('./plugin-explorer').then((module) => ({ default: module.PluginExplorer })),
);
const ConnectorViewDialog = lazy(() =>
  import('./connector-view-dialog').then((module) => ({ default: module.ConnectorViewDialog })),
);

/**
 * The agent offers to add a connector or a plugin to this conversation (discovery).
 * Four rows, so a first-time person can tell what it is, why the agent asks and what
 * Add changes: the logo, "Add <name> to this conversation?" and its state in words;
 * what it is (its own description, one line, the whole on expand); why (the agent's
 * reason, one line); Add, Not now, what it brings in words ("Brings 1 skill and 1 MCP
 * server (13 tools) to this conversation"), a quiet "View plugin" that opens the
 * plugin explorer over the conversation (the card stays; "View connector" and the
 * connector's own pane for a connector, PL-D1), and "Settings (n)" when the
 * connector has optional settings or required ones already saved. Only a required need
 * that is still missing shows inline, so a filled card keeps its four rows. Add
 * puts it in this conversation only, turning a connector on first when it is off, and
 * the agent's request continues; Not now refuses.
 */
/**
 * How an added plugin joins the turn that asked for it: the plugin picker's three
 * modes. Injection is the default, so the cached prompt is kept unless chosen.
 */
const JOIN_CHOICES: readonly { apply: PluginChangeApply; label: string; hint: string }[] = [
  {
    apply: 'note',
    label: t`Add as an injection`,
    hint: t`The agent is told about its tools and can call them now; the prompt cache is kept until the next compaction.`,
  },
  {
    apply: 'now',
    label: t`Add to the tool list`,
    hint: t`Its tools join the tool list now; the prompt cache is rebuilt on the next call.`,
  },
  {
    apply: 'compact',
    label: t`Compact, then add`,
    hint: t`Compacts the conversation before the agent's next step; its tools go in with it.`,
  },
];

export function ConnectorOfferResponse({
  disabled,
  interaction,
  onResponse,
  responseError,
}: {
  disabled?: boolean;
  interaction: PendingInteraction;
  onResponse: ClioPendingInteractionsProps['onResponse'];
  responseError?: Error;
}) {
  const payload = connectorSetupPayload(interaction.payload);
  const plugin = payload?.intent === 'add_plugin';
  // The agent asks for optional needs of a connector already here (KC5): only those rows.
  const asking = payload?.intent === 'values';
  const id = plugin ? '' : (payload?.connector_id ?? '');
  // The rows as this conversation sees them: its own values over the defaults (CV-D5).
  const { connector: everywhereRow } = useConnector(id || undefined);
  const { connector: conversationRow } = useSessionConnector(
    id || undefined,
    interaction.owner_session_id || undefined,
  );
  const connector = conversationRow ?? everywhereRow;
  // What the plugin brings, from the plugin row Extensions lists (`GET /v1/plugins`).
  const catalog = usePluginCatalog();
  const pluginRef = plugin ? (payload?.plugin_ref ?? '') : (connector?.plugin_ref ?? '');
  const entry = pluginRef ? catalog.data?.plugins.find((row) => row.ref === pluginRef) : undefined;
  const [exploring, setExploring] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<ConnectorDraft>({});
  const [showSettings, setShowSettings] = useState(false);
  const [joinMode, setJoinMode] = useState<PluginChangeApply>('note');
  const rows = (payload?.missing ?? []).map(
    (need) => connector?.needs.find((row) => row.key === need.key) ?? need,
  );
  const name = plugin
    ? (entry?.connector?.name ?? humanizePluginId(payload?.plugin_id || 'a plugin'))
    : (connector?.name ?? payload?.connector_name ?? (id || 'a connector'));
  // What it is: a plugin's own description (the row's whole text over the payload's
  // summary); a connector's own description, not its guidance plugin's.
  const description = plugin
    ? entry?.description || payload?.description || ''
    : payload?.description || connector?.description || '';
  // What must already be on this machine (SL-D8): shown until the connector is on.
  const requires = connector && !connector.enabled ? (connector.requires ?? '') : '';
  const contents = offerContentsLine(
    entry,
    plugin ? null : { id, tool_count: connector?.tool_count ?? null },
  );
  const on = connector?.enabled ?? payload?.connector_enabled ?? false;
  // A connector is viewed as a connector; a plugin (one that brings skills) as a plugin
  // (PL-D1): a carrier's files and `connector-<id>` never reach the person.
  const plainConnector =
    !plugin && Boolean(connector) && !(entry && bringsMoreThanItsServer(entry, id));
  const unfilled = unfilledRequired(rows, draft);
  // Inline only what is still missing, by what is saved (never by what is typed, so a
  // row does not move while the person fills it). A required row already saved, for this
  // conversation or as the default, folds into Settings with the optional ones (DOCS-F7).
  const missingKeys = new Set(
    asking ? rows.map((need) => need.key) : unfilledRequired(rows, {}).map((need) => need.key),
  );
  const inline = rows.filter((need) => missingKeys.has(need.key));
  const settings = rows.filter((need) => !missingKeys.has(need.key));
  // A saved required row the person empties keeps Settings open, so it is never hidden.
  const settingsOpen = showSettings || unfilled.some((need) => !missingKeys.has(need.key));
  const settingsId = `${pendingInteractionDomId(interaction.id)}-settings`;
  const offered = (action: string) => !interaction.actions || interaction.actions.includes(action);
  const add = () => {
    if (disabled || unfilled.length) return;
    const { values, save_as_default } = conversationAnswer(rows, draft, saveAsDefault);
    respondFromControl(
      onResponse(interaction, {
        action: 'submit',
        values,
        metadata: asking ? { save_as_default } : { save_as_default, apply: joinMode },
      }),
    );
  };
  const needProps = {
    disabled,
    draft,
    onDraft: (key: string, value: string) => setDraft((current) => ({ ...current, [key]: value })),
    onSignIn: () => undefined,
    onSaveAsDefault: (key: string, save: boolean) =>
      setSaveAsDefault((current) => ({ ...current, [key]: save })),
    onSubmit: add,
    saveAsDefault,
    submitLabel: asking ? t`Save` : t`Add ${name}`,
  };
  const marketplace = payload?.plugin_ref?.split('/')[0];
  const state = plugin
    ? marketplace
      ? t`Plugin from ${marketplace}`
      : t`Plugin`
    : on
      ? t`Enabled`
      : t`Not enabled (Add turns it on)`;
  const addTip = [
    plugin || on ? '' : t`Adding turns ${name} on.`,
    payload?.asks_sign_in ? t`It asks for a sign-in the first time the agent uses it.` : '',
    unfilled.length ? t`Fill the required rows first.` : '',
  ]
    .filter(Boolean)
    .join(sentenceGap());
  const asked = rows.map((need) => need.label || need.key).join(', ');
  const title = asking ? t`Give ${name} ${asked}?` : t`Add ${name} to this conversation?`;
  return (
    <>
      <AskCard
        data-connector={id || undefined}
        data-plugin={plugin ? (payload?.plugin_id ?? name) : undefined}
        data-interaction-kind="connector_setup"
        data-intent={payload?.intent ?? 'enable'}
        headerActions={
          <span
            className="flex max-w-[45%] shrink-0 items-center gap-1 pl-1 text-right text-xs text-muted-foreground"
            data-slot="connector-offer-state"
          >
            {plugin ? (
              state
            ) : (
              <StatusIndicator
                label={on ? t`Enabled` : t`Not enabled`}
                tone={on ? 'success' : 'inactive'}
              />
            )}
            {/* In a narrow card the title keeps the room; Add's tooltip says it too. */}
            {!plugin && !on ? (
              <span className="@max-[420px]/ask:hidden">{t`(Add turns it on)`}</span>
            ) : null}
          </span>
        }
        icon={plugin ? PuzzleIcon : PlugIcon}
        id={pendingInteractionDomId(interaction.id)}
        kind="question"
        leading={
          plugin ? undefined : (
            <ConnectorLogo
              className="size-4 text-[8px]"
              connector={connector ?? { id, name, logo_url: null }}
            />
          )
        }
        spokenDetail={`${state}. ${description} ${payload?.reason ?? ''} ${requires} ${contents}. ${addTip}`.trim()}
        title={title}
        titleText={title}
        wrapTitle
      >
        {description || payload?.reason || requires || inline.length || !payload ? (
          <AskBody>
            <AskSection className="mt-1.5 grid gap-1">
              {description ? (
                <OneLine
                  className="text-muted-foreground"
                  slot="connector-offer-description"
                  text={description}
                />
              ) : null}
              {payload?.reason ? (
                <div className="flex min-w-0 items-baseline gap-1.5">
                  <span className="shrink-0 text-xs text-muted-foreground">{t`Why`}</span>
                  <OneLine slot="connector-offer-reason" text={payload.reason} />
                </div>
              ) : null}
              {requires ? (
                <div className="flex min-w-0 items-baseline gap-1.5">
                  <span className="shrink-0 text-xs text-muted-foreground">{t`On this machine`}</span>
                  <OneLine slot="connector-offer-requires" text={requires} />
                </div>
              ) : null}
              {!payload ? <p role="alert">{t`This offer can’t be read by this version.`}</p> : null}
              {inline.length ? <ConnectorNeedRows {...needProps} needs={inline} /> : null}
            </AskSection>
          </AskBody>
        ) : null}
        <AskError error={responseError} />
        <BinaryAsk
          accept={
            offered('submit')
              ? {
                  disabled: !payload || unfilled.length > 0,
                  label: asking ? t`Save` : t({ message: 'Add', context: 'verb' }),
                  onChoose: add,
                  title: addTip || undefined,
                }
              : undefined
          }
          // In a narrow card the options are a column; one line, so the row of what it
          // brings is as wide as the card and truncates instead of widening every button.
          className="mt-2 @max-[420px]/ask:flex-nowrap"
          decline={
            offered('decline')
              ? {
                  label: t`Not now`,
                  onChoose: () => onResponse(interaction, { action: 'decline' }),
                }
              : undefined
          }
          disabled={disabled}
          enterAccepts
          label={t`Decision`}
        >
          {offered('submit') && !asking ? (
            <Select
              disabled={disabled}
              onValueChange={(value) => setJoinMode(value as PluginChangeApply)}
              value={joinMode}
            >
              <SelectTrigger
                aria-label={t`How it joins this turn`}
                className="h-8 w-auto max-w-56 text-xs"
                data-slot="connector-offer-join"
                title={JOIN_CHOICES.find((choice) => choice.apply === joinMode)?.hint}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start">
                {JOIN_CHOICES.map((choice) => (
                  <SelectItem key={choice.apply} title={choice.hint} value={choice.apply}>
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <div
            className="flex min-w-0 flex-1 basis-48 items-center gap-1.5 @max-[420px]/ask:flex-none @max-[420px]/ask:basis-auto"
            data-slot="connector-offer-brings"
          >
            <span
              className="min-w-0 shrink truncate text-xs text-muted-foreground"
              data-slot="connector-offer-contents"
              title={contents}
            >
              {contents}
            </span>
            {entry || plainConnector ? (
              <button
                aria-haspopup="dialog"
                className="flex h-7 w-fit shrink-0 items-center rounded-[4px] px-1 text-xs whitespace-nowrap text-muted-foreground underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
                data-slot="connector-offer-view-plugin"
                onClick={() => setExploring(true)}
                type="button"
              >
                {plainConnector ? t`View connector` : t`View plugin`}
              </button>
            ) : null}
            {settings.length ? (
              <button
                aria-controls={settingsId}
                aria-expanded={settingsOpen}
                className="flex h-7 w-fit shrink-0 items-center gap-1 rounded-[4px] px-1 text-xs whitespace-nowrap text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                data-slot="connector-offer-settings"
                onClick={() => setShowSettings(!settingsOpen)}
                type="button"
              >
                <ChevronRightIcon
                  aria-hidden="true"
                  className={cn('size-3.5 transition-transform', settingsOpen && 'rotate-90')}
                />
                {t`Settings (${ph({ count: settings.length })})`}
              </button>
            ) : null}
          </div>
        </BinaryAsk>
        {settings.length && settingsOpen ? (
          <AskSection className="max-h-64 overflow-y-auto" id={settingsId}>
            <ConnectorNeedRows {...needProps} needs={settings} />
          </AskSection>
        ) : null}
      </AskCard>
      {exploring && plainConnector && connector ? (
        <div className="contents" onKeyDown={(event) => event.stopPropagation()}>
          <Suspense fallback={null}>
            <ConnectorViewDialog connector={connector} onClose={() => setExploring(false)} />
          </Suspense>
        </div>
      ) : exploring && entry ? (
        // Outside the card, and its keys stop here: Escape closes the explorer and never
        // answers the offer, which stays for Add once the person has looked.
        <div className="contents" onKeyDown={(event) => event.stopPropagation()}>
          <Suspense fallback={null}>
            <PluginExplorer onClose={() => setExploring(false)} reference={entry.ref} />
          </Suspense>
        </div>
      ) : null}
    </>
  );
}

/** One line of the card (what it is, or why the agent asks); the whole of it on expand. */
function OneLine({ text, slot, className }: { text: string; slot: string; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <button
      aria-expanded={open}
      className={cn(
        'min-w-0 rounded-[4px] text-left leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        open ? 'whitespace-normal [overflow-wrap:anywhere]' : 'truncate',
        className,
      )}
      data-slot={slot}
      onClick={() => setOpen((value) => !value)}
      title={open ? undefined : text}
      type="button"
    >
      {text}
    </button>
  );
}
